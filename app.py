# ════════════════════════════════════════════════
# app.py
# Karazhar Minigrid — Flask Server
# Serves dashboard + API for Simulink bridge
# ════════════════════════════════════════════════

from flask import Flask, jsonify, request, send_from_directory, session, redirect
import threading, time, os, json, datetime, functools

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = 'karazhar-minigrid-2026-secret'
_lock = threading.Lock()

# ── Auth credentials (single operator) ───────────────────
AUTH_USERNAME = "admin"
AUTH_PASSWORD = "karazhar2026"

# ── Alert persistence directory ──────────────────────────
ALERTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'alerts_data')
os.makedirs(ALERTS_DIR, exist_ok=True)

# ── In-memory state ──────────────────────────────────────
_solar = {
    "voltage": 0, "current": 0, "power_out": 0, "load": 0,
    "soc": 0, "charging": 0,
    "temp_panel": 0, "temp_module": 0
}

_hydro = {
    "voltage": 0, "current": 0, "power_out": 0, "load": 0,
    "flow_rate": 0, "pressure": 0, "pump_state": 0
}

_gen = {
    "running": 0,
    "voltage": 0, "current": 0, "power_out": 0, "load": 0,
    "rpm": 0, "frequency": 0,
    "gen_temp": 0, "coolant_temp": 0,
    "fuel_pct": 72, "water_pct": 55,
    "bat_voltage": 24, "bat_current": 0
}

_gen_pending = {"cmd": ""}

# ── Chart history (server-side rolling arrays for tab-switch persistence) ─
_chart_history = {
    "solar_power": [], "solar_load": [],
    "hydro_power": [], "hydro_load": [], "hydro_flow": [],
    "gen_power": [], "gen_load": [],
    "overview_solar": [], "overview_hydro": [], "overview_gen": [],
    "timestamps": [],
}
MAX_CHART_POINTS = 16

# ── Thresholds ───────────────────────────────────────────
_thresholds = {
    "solar": {
        "voltage_high": 250, "voltage_low": 190,
        "soc_low": 20,
        "temp_ambient_high": 45, "temp_ambient_low": -30,
        "temp_panel_high": 75, "temp_panel_low": -20,
        "temp_module_high": 80, "temp_module_low": -20
    },
    "hydro": {
        "pressure_high": 60, "pressure_low": 30,
        "voltage_high": 250, "voltage_low": 190
    },
    "generator": {
        "voltage_high": 250, "voltage_low": 190,
        "rpm_high": 1800, "rpm_low": 1200,
        "coolant_high": 110, "coolant_low": 0,
        "fuel_high": 100, "fuel_low": 15,
        "water_high": 100, "water_low": 15,
        "bat_voltage_high": 30, "bat_voltage_low": 20
    }
}

# ── Alert dedup: tracks which conditions are currently active ─
_active_conditions = {}
_prev_states = {"charging": None, "pump_state": None, "gen_running": None}

# ── Alert file I/O ───────────────────────────────────────
def _today_str():
    return datetime.date.today().strftime("%Y-%m-%d")

def _alert_file(date_str=None):
    if date_str is None:
        date_str = _today_str()
    return os.path.join(ALERTS_DIR, f"alerts_{date_str}.json")

def _load_alerts_for_date(date_str=None):
    path = _alert_file(date_str)
    if not os.path.exists(path):
        return []
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def _save_alert(alert):
    path = _alert_file()
    alerts = _load_alerts_for_date()
    alerts.append(alert)
    try:
        with open(path, 'w') as f:
            json.dump(alerts, f)
    except IOError as e:
        print(f"[ALERT WRITE ERR] {e}")

def _ts():
    return time.strftime("%H:%M:%S")

def _add_alert(source, msg, level="warn"):
    alert = {"msg": msg, "time": _ts(), "level": level, "source": source,
             "date": _today_str()}
    _save_alert(alert)

def _get_available_dates():
    dates = []
    if os.path.exists(ALERTS_DIR):
        for fname in os.listdir(ALERTS_DIR):
            if fname.startswith("alerts_") and fname.endswith(".json"):
                date_str = fname[7:-5]
                dates.append(date_str)
    dates.sort(reverse=True)
    return dates

# ── Status-change alert helpers ──────────────────────────
def _check_range_dedup(source, label, value, key_high, key_low):
    t = _thresholds[source]
    hi = t.get(key_high)
    lo = t.get(key_low)

    if hi is not None:
        cond_key = f"{source}:{label}_high"
        currently_high = value > hi
        was_high = _active_conditions.get(cond_key, False)
        if currently_high and not was_high:
            _add_alert(source, f"{label} HIGH — {value} (threshold: {hi})", "warn")
            _active_conditions[cond_key] = True
        elif not currently_high and was_high:
            _add_alert(source, f"{label} returned to normal — {value} (was above {hi})", "info")
            _active_conditions[cond_key] = False

    if lo is not None:
        cond_key = f"{source}:{label}_low"
        currently_low = value < lo
        was_low = _active_conditions.get(cond_key, False)
        if currently_low and not was_low:
            _add_alert(source, f"{label} LOW — {value} (threshold: {lo})", "warn")
            _active_conditions[cond_key] = True
        elif not currently_low and was_low:
            _add_alert(source, f"{label} returned to normal — {value} (was below {lo})", "info")
            _active_conditions[cond_key] = False

def _check_state_change(key, new_val, on_msg, off_msg, source):
    prev = _prev_states.get(key)
    if prev is not None and prev != new_val:
        if new_val:
            _add_alert(source, on_msg, "info")
        else:
            _add_alert(source, off_msg, "info")
    _prev_states[key] = new_val

def _generate_alerts():
    # Solar
    _check_range_dedup("solar", "Solar Voltage", _solar["voltage"],
                       "voltage_high", "voltage_low")
    _check_state_change("charging", _solar["charging"],
                        "Battery charging", "Battery not charging", "solar")

    # SOC low
    soc_lo = _thresholds["solar"].get("soc_low")
    if soc_lo is not None:
        cond_key = "solar:SOC_low"
        currently_low = _solar["soc"] < soc_lo
        was_low = _active_conditions.get(cond_key, False)
        if currently_low and not was_low:
            _add_alert("solar", f"Battery SOC LOW — {_solar['soc']}% (threshold: {soc_lo}%)", "warn")
            _active_conditions[cond_key] = True
        elif not currently_low and was_low:
            _add_alert("solar", f"Battery SOC normal — {_solar['soc']}% (was below {soc_lo}%)", "info")
            _active_conditions[cond_key] = False

    # Panel temp
    _check_range_dedup("solar", "Panel Temp", _solar["temp_panel"],
                       "temp_panel_high", "temp_panel_low")
    # Module temp
    _check_range_dedup("solar", "Module Temp", _solar["temp_module"],
                       "temp_module_high", "temp_module_low")

    # Hydro
    _check_range_dedup("hydro", "Water Pressure", _hydro["pressure"],
                       "pressure_high", "pressure_low")
    _check_range_dedup("hydro", "Hydro Voltage", _hydro["voltage"],
                       "voltage_high", "voltage_low")
    _check_state_change("pump_state", _hydro["pump_state"],
                        "Pump started — running", "Pump stopped", "hydro")

    # Generator
    if _gen["running"]:
        _check_range_dedup("generator", "Generator Voltage", _gen["voltage"],
                           "voltage_high", "voltage_low")
        _check_range_dedup("generator", "Engine RPM", _gen["rpm"],
                           "rpm_high", "rpm_low")
        _check_range_dedup("generator", "Coolant Temp", _gen["coolant_temp"],
                           "coolant_high", "coolant_low")
        _check_range_dedup("generator", "Fuel Level", _gen["fuel_pct"],
                           "fuel_high", "fuel_low")
        _check_range_dedup("generator", "Water Level", _gen["water_pct"],
                           "water_high", "water_low")
        _check_range_dedup("generator", "Battery Voltage", _gen["bat_voltage"],
                           "bat_voltage_high", "bat_voltage_low")
    _check_state_change("gen_running", _gen["running"],
                        "Generator started", "Generator stopped", "generator")

# ── Chart history update ─────────────────────────────────
_chart_update_counter = 0

def _update_chart_history():
    ts = time.strftime("%H:%M")
    def push(key, val):
        arr = _chart_history[key]
        arr.append(val)
        if len(arr) > MAX_CHART_POINTS:
            _chart_history[key] = arr[-MAX_CHART_POINTS:]
    push("timestamps", ts)
    push("solar_power", _solar["power_out"])
    push("solar_load", _solar["load"])
    push("hydro_power", _hydro["power_out"])
    push("hydro_load", _hydro["load"])
    push("hydro_flow", _hydro["flow_rate"])
    push("gen_power", _gen["power_out"])
    push("gen_load", _gen["load"])
    push("overview_solar", _solar["power_out"])
    push("overview_hydro", _hydro["power_out"])
    push("overview_gen", _gen["power_out"])

# ══════════════════════════════════════════════════════════
#  AUTH DECORATOR
# ══════════════════════════════════════════════════════════
def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            if request.path.startswith('/api/'):
                return jsonify(error="Unauthorized"), 401
            return redirect('/login.html')
        return f(*args, **kwargs)
    return decorated

# ══════════════════════════════════════════════════════════
#  AUTH ROUTES
# ══════════════════════════════════════════════════════════
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    username = data.get('username', '')
    password = data.get('password', '')
    if username == AUTH_USERNAME and password == AUTH_PASSWORD:
        session['logged_in'] = True
        session['username'] = username
        return jsonify(ok=True)
    return jsonify(ok=False, error="Invalid credentials"), 401

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify(ok=True)

@app.route('/api/auth_status')
def api_auth_status():
    return jsonify(logged_in=session.get('logged_in', False),
                   username=session.get('username', ''))

# ══════════════════════════════════════════════════════════
#  STATIC FILE ROUTES
# ══════════════════════════════════════════════════════════
@app.route('/login.html')
def serve_login():
    return send_from_directory('.', 'login.html')

@app.route('/')
@login_required
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    # CSS/JS/images/fonts: no auth needed (login page needs them)
    if filename.endswith(('.css', '.js', '.png', '.jpg', '.svg', '.ico',
                          '.woff2', '.woff', '.ttf')):
        return send_from_directory('.', filename)
    if filename == 'login.html':
        return send_from_directory('.', filename)
    # HTML pages require auth
    if filename.endswith('.html'):
        if not session.get('logged_in'):
            return redirect('/login.html')
    return send_from_directory('.', filename)

# ══════════════════════════════════════════════════════════
#  API — DATA UPDATE (bridge.py pushes here)
# ══════════════════════════════════════════════════════════
@app.route('/api/update', methods=['POST'])
def api_update():
    global _chart_update_counter
    data = request.json or {}
    with _lock:
        for k in _solar:
            if k in data:
                _solar[k] = data[k]
        for k in _hydro:
            if k in data:
                _hydro[k] = data[k]
        for k in _gen:
            if k in data:
                _gen[k] = data[k]
        _generate_alerts()
        _chart_update_counter += 1
        if _chart_update_counter % 3 == 0:
            _update_chart_history()
    return jsonify(ok=True)

# ══════════════════════════════════════════════════════════
#  API — DATA READ
# ══════════════════════════════════════════════════════════
@app.route('/api/data')
@login_required
def api_data():
    with _lock:
        today = _load_alerts_for_date()
        return jsonify(solar=dict(_solar), hydro=dict(_hydro),
                       gen=dict(_gen), alerts=today[-30:])

@app.route('/api/solar')
@login_required
def api_solar():
    with _lock:
        today = _load_alerts_for_date()
        sa = [a for a in today if a.get("source") == "solar"]
        return jsonify(**_solar, alerts=sa[-30:])

@app.route('/api/hydro')
@login_required
def api_hydro():
    with _lock:
        today = _load_alerts_for_date()
        ha = [a for a in today if a.get("source") == "hydro"]
        return jsonify(**_hydro, alerts=ha[-30:])

@app.route('/api/generator')
@login_required
def api_generator():
    with _lock:
        today = _load_alerts_for_date()
        ga = [a for a in today if a.get("source") == "generator"]
        return jsonify(**_gen, alerts=ga[-30:])

# ══════════════════════════════════════════════════════════
#  API — ALERTS BY DATE
# ══════════════════════════════════════════════════════════
@app.route('/api/alerts/dates')
@login_required
def api_alert_dates():
    return jsonify(dates=_get_available_dates())

@app.route('/api/alerts/<date_str>')
@login_required
def api_alerts_by_date(date_str):
    source_filter = request.args.get('source', None)
    alerts = _load_alerts_for_date(date_str)
    if source_filter:
        alerts = [a for a in alerts if a.get("source") == source_filter]
    return jsonify(alerts=alerts)

# ══════════════════════════════════════════════════════════
#  API — CHART HISTORY
# ══════════════════════════════════════════════════════════
@app.route('/api/chart_history')
@login_required
def api_chart_history():
    with _lock:
        return jsonify(**_chart_history)

# ══════════════════════════════════════════════════════════
#  API — GENERATOR TOGGLE
# ══════════════════════════════════════════════════════════
@app.route('/api/gen_toggle', methods=['POST'])
@login_required
def gen_toggle():
    with _lock:
        _gen_pending['cmd'] = 'TOGGLE'
    return jsonify(ok=True)

@app.route('/api/gen_command')
def gen_command():
    with _lock:
        cmd = _gen_pending['cmd']
        _gen_pending['cmd'] = ''
    return jsonify(cmd=cmd)

# ══════════════════════════════════════════════════════════
#  API — THRESHOLDS
# ══════════════════════════════════════════════════════════
@app.route('/api/thresholds/<source>', methods=['GET'])
@login_required
def get_thresholds(source):
    if source not in _thresholds:
        return jsonify(error="Unknown source"), 400
    with _lock:
        return jsonify(**_thresholds[source])

@app.route('/api/thresholds/<source>', methods=['POST'])
@login_required
def set_thresholds(source):
    if source not in _thresholds:
        return jsonify(error="Unknown source"), 400
    data = request.json or {}
    with _lock:
        for k, v in data.items():
            if k in _thresholds[source]:
                try:
                    _thresholds[source][k] = float(v)
                except (ValueError, TypeError):
                    pass
    return jsonify(ok=True, **_thresholds[source])

@app.route('/api/alerts/clear/<source>', methods=['POST'])
@login_required
def clear_alerts(source):
    path = _alert_file()
    if source == "all":
        try:
            with open(path, 'w') as f:
                json.dump([], f)
        except IOError:
            pass
    else:
        alerts = _load_alerts_for_date()
        alerts = [a for a in alerts if a.get("source") != source]
        try:
            with open(path, 'w') as f:
                json.dump(alerts, f)
        except IOError:
            pass
    return jsonify(ok=True)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)