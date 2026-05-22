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
    "voltage": 0, "irradiance": 0, "power_out": 0, "load": 0,
    "soc": 0, "charging": 0, "rms": 0, "temp_panel": 0
}

_hydro = {
    "voltage": 0, "current": 0, "power_out": 0, "load": 0,
    "flow_rate": 0, "pressure": 0, "pump_state": 0, "powerbank": 0
}

# Pump Generator (powers the water pump)
_pgen = {
    "running": 0,
    "voltage": 0, "current": 0, "power_out": 0, "load": 0,
    "rpm": 0, "frequency": 0, "gen_temp": 0,
    "fuel_pct": 72,
    "bat_voltage": 24,
    "oil_pressure": 0, "vibration": 0,
    "fault_voltage": 0, "fault_current": 0,
    "fault_rpm_low": 0, "fault_rpm_high": 0,
    "fault_fuel": 0, "fault_temp": 0,
    "fault_oil_pressure": 0, "fault_vibration": 0,
    "fault_freq_high": 0, "fault_freq_low": 0,
    "fault_reset": 0,
    "mode_auto": 0, "mode_manual": 0, "mode_off": 1,
}

# Main Generator (backup when hydro can't meet demand)
_gen = {
    "running": 0,
    "voltage": 0, "current": 0, "power_out": 0, "load": 0,
    "rpm": 0, "frequency": 0, "gen_temp": 0,
    "fuel_pct": 72,
    "bat_voltage": 24,
    "oil_pressure": 0, "vibration": 0,
    "fault_voltage": 0, "fault_current": 0,
    "fault_rpm_low": 0, "fault_rpm_high": 0,
    "fault_fuel": 0, "fault_temp": 0,
    "fault_oil_pressure": 0, "fault_vibration": 0,
    "fault_freq_high": 0, "fault_freq_low": 0,
    "fault_reset": 0,
    "mode_auto": 0, "mode_manual": 0, "mode_off": 1,
}

_pgen_pending = {"cmd": ""}
_gen_pending = {"cmd": ""}

# ── Prefixed key → (target dict, field) mapping ─────────
_SOLAR_PREFIX = {
    "solar_voltage": "voltage", "solar_irradiance": "irradiance",
    "solar_power": "power_out", "solar_load": "load",
    "solar_soc": "soc",
    "solar_rms": "rms", "solar_temp_panel": "temp_panel",
}

_HYDRO_PREFIX = {
    "hydro_voltage": "voltage", "hydro_current": "current",
    "hydro_power": "power_out", "hydro_load": "load",
    "hydro_flow_rate": "flow_rate", "hydro_pressure": "pressure",
    "hydro_pump_state": "pump_state", "hydro_powerbank": "powerbank",
}

_PGEN_PREFIX = {
    "pgen_running": "running",
    "pgen_voltage": "voltage", "pgen_current": "current",
    "pgen_power": "power_out", "pgen_load": "load",
    "pgen_rpm": "rpm", "pgen_frequency": "frequency",
    "pgen_temp": "gen_temp",
    "pgen_fuel": "fuel_pct",
    "pgen_bat_voltage": "bat_voltage",
    "pgen_oil_pressure": "oil_pressure", "pgen_vibration": "vibration",
    "pgen_fault_voltage": "fault_voltage", "pgen_fault_current": "fault_current",
    "pgen_fault_rpm_low": "fault_rpm_low", "pgen_fault_rpm_high": "fault_rpm_high",
    "pgen_fault_fuel": "fault_fuel", "pgen_fault_temp": "fault_temp",
    "pgen_fault_oil_pressure": "fault_oil_pressure", "pgen_fault_vibration": "fault_vibration",
    "pgen_fault_freq_high": "fault_freq_high", "pgen_fault_freq_low": "fault_freq_low",
    "pgen_fault_reset": "fault_reset",
    "pgen_mode_auto": "mode_auto", "pgen_mode_manual": "mode_manual", "pgen_mode_off": "mode_off",
}

_GEN_PREFIX = {
    "gen_running": "running",
    "gen_voltage": "voltage", "gen_current": "current",
    "gen_power": "power_out", "gen_load": "load",
    "gen_rpm": "rpm", "gen_frequency": "frequency",
    "gen_temp": "gen_temp",
    "gen_fuel": "fuel_pct",
    "gen_bat_voltage": "bat_voltage",
    "gen_oil_pressure": "oil_pressure", "gen_vibration": "vibration",
    "gen_fault_voltage": "fault_voltage", "gen_fault_current": "fault_current",
    "gen_fault_rpm_low": "fault_rpm_low", "gen_fault_rpm_high": "fault_rpm_high",
    "gen_fault_fuel": "fault_fuel", "gen_fault_temp": "fault_temp",
    "gen_fault_oil_pressure": "fault_oil_pressure", "gen_fault_vibration": "fault_vibration",
    "gen_fault_freq_high": "fault_freq_high", "gen_fault_freq_low": "fault_freq_low",
    "gen_fault_reset": "fault_reset",
    "gen_mode_auto": "mode_auto", "gen_mode_manual": "mode_manual", "gen_mode_off": "mode_off",
}

# ── Chart history (server-side rolling arrays) ───────────
_chart_history = {
    "solar_power": [], "solar_load": [],
    "hydro_power": [], "hydro_load": [], "hydro_flow": [],
    "pgen_power": [], "pgen_load": [],
    "gen_power": [], "gen_load": [],
    "overview_solar": [], "overview_hydro": [], "overview_pgen": [], "overview_gen": [],
    "timestamps": [],
}
MAX_CHART_POINTS = 16

# ── Thresholds ───────────────────────────────────────────
_thresholds = {
    "solar": {
        "voltage_high": 250, "voltage_low": 190,
        "rms_high": 280, "rms_low": 200,
        "soc_low": 20,
        "irradiance_high": 1870, "irradiance_low": 900,
        "temp_panel_high": 75, "temp_panel_low": -20,
    },
    "hydro": {
        "pressure_low": 296,
        "flow_rate_low": 1.31,
        "voltage_high": 250, "voltage_low": 190,
    },
    "pgen": {},
    "generator": {},
}

# ── Alert dedup: tracks which conditions are currently active ─
_active_conditions = {}
_prev_states = {
    "charging": None, "pump_state": None,
    "pgen_running": None, "gen_running": None,
    "pgen_fault_reset": None, "gen_fault_reset": None,
}

# ── In-memory alert cache ────────────────────────────────
_alerts_cache = []
_alerts_cache_date = None

# ── Alert file I/O ───────────────────────────────────────
def _today_str():
    return datetime.date.today().strftime("%Y-%m-%d")

def _alert_file(date_str=None):
    if date_str is None:
        date_str = _today_str()
    return os.path.join(ALERTS_DIR, f"alerts_{date_str}.json")

def _load_alerts_for_date(date_str=None):
    global _alerts_cache, _alerts_cache_date
    today = _today_str()
    if date_str is None or date_str == today:
        if _alerts_cache_date == today:
            return list(_alerts_cache)
        path = _alert_file(today)
        if not os.path.exists(path):
            _alerts_cache = []
            _alerts_cache_date = today
            return []
        try:
            with open(path, 'r') as f:
                _alerts_cache = json.load(f)
            _alerts_cache_date = today
            return list(_alerts_cache)
        except (json.JSONDecodeError, IOError):
            _alerts_cache = []
            _alerts_cache_date = today
            return []
    path = _alert_file(date_str)
    if not os.path.exists(path):
        return []
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def _save_alert(alert):
    global _alerts_cache, _alerts_cache_date
    today = _today_str()
    if _alerts_cache_date != today:
        _alerts_cache = []
        _alerts_cache_date = today
    _alerts_cache.append(alert)
    path = _alert_file()
    try:
        with open(path, 'w') as f:
            json.dump(_alerts_cache, f)
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

# ── Alert helpers ────────────────────────────────────────
def _check_range_dedup(source, label, value, key_high, key_low):
    t = _thresholds[source]
    hi = t.get(key_high) if key_high else None
    lo = t.get(key_low) if key_low else None

    cond_key_high = f"{source}:{label}_high"
    cond_key_low  = f"{source}:{label}_low"

    currently_high = (hi is not None) and (value >= hi)
    currently_low  = (lo is not None) and (value <= lo)
    in_normal_band = not currently_high and not currently_low

    was_high = _active_conditions.get(cond_key_high, False)
    was_low  = _active_conditions.get(cond_key_low, False)

    # ── HIGH alert ──
    if currently_high and not was_high:
        _add_alert(source, f"{label} HIGH — {value:.1f} (Threshold: {hi})", "warn")
        _active_conditions[cond_key_high] = True

    # ── LOW alert ──
    if currently_low and not was_low:
        _add_alert(source, f"{label} LOW — {value:.1f} (threshold: {lo})", "warn")
        _active_conditions[cond_key_low] = True

    # ── Recovery: only when value is between both thresholds ──
    if in_normal_band:
        if was_high:
            _active_conditions[cond_key_high] = False
            _add_alert(source, f"{label} returned to normal — {value:.1f} (Threshold: {hi})", "info")
        if was_low:
            _active_conditions[cond_key_low] = False
            _add_alert(source, f"{label} returned to normal — {value:.1f} (threshold: {lo})", "info")

def _check_state_change(key, new_val, on_msg, off_msg, source):
    prev = _prev_states.get(key)
    if prev is not None and prev != new_val:
        if new_val:
            _add_alert(source, on_msg, "info")
        else:
            _add_alert(source, off_msg, "info")
    _prev_states[key] = new_val

def _generate_gen_fault_alerts(gen_dict, source_label):
    """Generate fault alerts for a generator (pgen or gen)."""
    _gen_fault_map = {
        "fault_voltage":      ("Voltage",        gen_dict["voltage"],      "V"),
        "fault_current":      ("Current",         gen_dict["current"],      "A"),
        "fault_rpm_low":      ("RPM Low",         gen_dict["rpm"],          "RPM"),
        "fault_rpm_high":     ("RPM High",        gen_dict["rpm"],          "RPM"),
        "fault_fuel":         ("Fuel Level",      gen_dict["fuel_pct"],     "%"),
        "fault_temp":         ("Temperature",     gen_dict["gen_temp"],     "°C"),
        "fault_oil_pressure": ("Oil Pressure",    gen_dict["oil_pressure"], "PSI"),
        "fault_vibration":    ("Vibration",       gen_dict["vibration"],    "mm/s"),
        "fault_freq_high":    ("Frequency High",  gen_dict["frequency"],    "Hz"),
        "fault_freq_low":     ("Frequency Low",   gen_dict["frequency"],    "Hz"),
    }
    for fault_key, (label, value, unit) in _gen_fault_map.items():
        cond_key = f"{source_label}:{fault_key}"
        is_fault = bool(gen_dict.get(fault_key, 0))
        was_fault = _active_conditions.get(cond_key, False)
        if is_fault and not was_fault:
            _add_alert(source_label, f"{label} abnormal — {value:.1f} {unit}", "warn")
            _active_conditions[cond_key] = True
        elif not is_fault and was_fault:
            _add_alert(source_label, f"{label} returned to normal — {value:.1f} {unit}", "info")
            _active_conditions[cond_key] = False

def _check_fault_reset(gen_dict, source_label, state_key):
    """Check if fault_reset was triggered (rising edge)."""
    is_reset = bool(gen_dict.get("fault_reset", 0))
    was_reset = _prev_states.get(state_key, False)
    if is_reset and not was_reset:
        _add_alert(source_label, "Fault reset triggered — all faults cleared", "info")
        keys_to_clear = [k for k in _active_conditions if k.startswith(f"{source_label}:fault_")]
        for k in keys_to_clear:
            _active_conditions[k] = False
    _prev_states[state_key] = is_reset

def _generate_alerts():
    # ── Solar ──
    _check_range_dedup("solar", "Solar Voltage", _solar["voltage"],
                       "voltage_high", "voltage_low")
    _check_range_dedup("solar", "Solar RMS", _solar["rms"],
                       "rms_high", "rms_low")
    _check_range_dedup("solar", "Irradiance", _solar["irradiance"],
                       "irradiance_high", "irradiance_low")
    _check_state_change("charging", _solar["charging"],
                        "Battery charging", "Battery not charging", "solar")

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

    _check_range_dedup("solar", "Panel Temp", _solar["temp_panel"],
                       "temp_panel_high", "temp_panel_low")

    # ── Hydro ──
    _check_range_dedup("hydro", "Water Pressure", _hydro["pressure"],
                       None, "pressure_low")
    _check_range_dedup("hydro", "Water Flow Rate", _hydro["flow_rate"],
                       None, "flow_rate_low")
    _check_range_dedup("hydro", "Hydro Voltage", _hydro["voltage"],
                       "voltage_high", "voltage_low")
    _check_state_change("pump_state", _hydro["pump_state"],
                        "Pump started — running", "Pump stopped", "hydro")

    # ── Pump Generator ──
    _check_fault_reset(_pgen, "pgen", "pgen_fault_reset")
    _generate_gen_fault_alerts(_pgen, "pgen")
    _check_state_change("pgen_running", _pgen["running"],
                        "Pump generator started", "Pump generator stopped", "pgen")

    # ── Main Generator ──
    _check_fault_reset(_gen, "generator", "gen_fault_reset")
    _generate_gen_fault_alerts(_gen, "generator")
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
    push("pgen_power", _pgen["power_out"])
    push("pgen_load", _pgen["load"])
    push("gen_power", _gen["power_out"])
    push("gen_load", _gen["load"])
    push("overview_solar", _solar["power_out"])
    push("overview_hydro", _hydro["power_out"])
    push("overview_pgen", _pgen["power_out"])
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
    if filename.endswith(('.css', '.js', '.png', '.jpg', '.svg', '.ico',
                          '.woff2', '.woff', '.ttf')):
        return send_from_directory('.', filename)
    if filename == 'login.html':
        return send_from_directory('.', filename)
    if filename.endswith('.html'):
        if not session.get('logged_in'):
            return redirect('/login.html')
    return send_from_directory('.', filename)

# ══════════════════════════════════════════════════════════
#  API — DATA UPDATE (bridge.py / demo_push.py pushes here)
# ══════════════════════════════════════════════════════════
@app.route('/api/update', methods=['POST'])
def api_update():
    global _chart_update_counter
    data = request.json or {}
    with _lock:
                
        for prefixed_key, field in _SOLAR_PREFIX.items():
            if prefixed_key in data:
                _solar[field] = data[prefixed_key]

        # ── Charging detection: compare SOC over ~5 second window ──
        cur_soc = _solar["soc"]
        soc_history = _prev_states.get("soc_history", [])
        soc_history.append(cur_soc)
        if len(soc_history) > 10:
            old_soc = soc_history.pop(0)
            if cur_soc > old_soc + 0.001:
                _solar["charging"] = 1
            elif cur_soc < old_soc - 0.001:
                _solar["charging"] = 0
        _prev_states["soc_history"] = soc_history

        for prefixed_key, field in _HYDRO_PREFIX.items():
            if prefixed_key in data:
                _hydro[field] = data[prefixed_key]

        for prefixed_key, field in _PGEN_PREFIX.items():
            if prefixed_key in data:
                _pgen[field] = data[prefixed_key]

        for prefixed_key, field in _GEN_PREFIX.items():
            if prefixed_key in data:
                _gen[field] = data[prefixed_key]

        _chart_update_counter += 1
        if _chart_update_counter % 6 == 0:
            _generate_alerts()
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
                       pgen=dict(_pgen), gen=dict(_gen),
                       alerts=today)

@app.route('/api/solar')
@login_required
def api_solar():
    with _lock:
        today = _load_alerts_for_date()
        sa = [a for a in today if a.get("source") == "solar"]
        return jsonify(**_solar, alerts=sa)

@app.route('/api/hydro')
@login_required
def api_hydro():
    with _lock:
        today = _load_alerts_for_date()
        ha = [a for a in today if a.get("source") == "hydro"]
        return jsonify(**_hydro, pgen_running=_pgen["running"], alerts=ha)

@app.route('/api/pgen')
@login_required
def api_pgen():
    with _lock:
        today = _load_alerts_for_date()
        pa = [a for a in today if a.get("source") == "pgen"]
        return jsonify(**_pgen, alerts=pa)

@app.route('/api/generator')
@login_required
def api_generator():
    with _lock:
        today = _load_alerts_for_date()
        ga = [a for a in today if a.get("source") == "generator"]
        return jsonify(**_gen, alerts=ga)

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
#  API — GENERATOR START / SHUTDOWN (pump gen + main gen)
# ══════════════════════════════════════════════════════════
@app.route('/api/pgen_start', methods=['POST'])
@login_required
def pgen_start():
    with _lock:
        _pgen_pending['cmd'] = 'START'
    return jsonify(ok=True)

@app.route('/api/pgen_shutdown', methods=['POST'])
@login_required
def pgen_shutdown():
    with _lock:
        _pgen_pending['cmd'] = 'SHUTDOWN'
    return jsonify(ok=True)

@app.route('/api/pgen_command')
def pgen_command():
    with _lock:
        cmd = _pgen_pending['cmd']
        _pgen_pending['cmd'] = ''
    return jsonify(cmd=cmd)

@app.route('/api/gen_start', methods=['POST'])
@login_required
def gen_start():
    with _lock:
        _gen_pending['cmd'] = 'START'
    return jsonify(ok=True)

@app.route('/api/gen_shutdown', methods=['POST'])
@login_required
def gen_shutdown():
    with _lock:
        _gen_pending['cmd'] = 'SHUTDOWN'
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
    global _alerts_cache, _alerts_cache_date
    path = _alert_file()
    if source == "all":
        _alerts_cache = []
        _alerts_cache_date = _today_str()
        try:
            with open(path, 'w') as f:
                json.dump([], f)
        except IOError:
            pass
    else:
        _alerts_cache = [a for a in _alerts_cache if a.get("source") != source]
        try:
            with open(path, 'w') as f:
                json.dump(_alerts_cache, f)
        except IOError:
            pass
    return jsonify(ok=True)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)