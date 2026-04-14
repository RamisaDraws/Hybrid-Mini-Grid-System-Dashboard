# ════════════════════════════════════════════════
# app.py
# Karazhar Minigrid — Flask Server
# Serves dashboard + API for Simulink bridge
# ════════════════════════════════════════════════

from flask import Flask, jsonify, request, send_from_directory
import threading, time, os

app = Flask(__name__, static_folder='.', static_url_path='')
_lock = threading.Lock()

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
_alerts = {"solar": [], "hydro": [], "generator": [], "all": []}
MAX_ALERTS = 50
_prev_states = {"charging": None, "pump_state": None, "gen_running": None}

# ── Thresholds (defaults — user updates via API) ─────────
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

# ── Alert helpers ────────────────────────────────────────
def _ts():
    return time.strftime("%H:%M:%S")

def _add_alert(source, msg, level="warn"):
    alert = {"msg": msg, "time": _ts(), "level": level}
    _alerts[source].append(alert)
    _alerts["all"].append(alert)
    if len(_alerts[source]) > MAX_ALERTS:
        _alerts[source] = _alerts[source][-MAX_ALERTS:]
    if len(_alerts["all"]) > MAX_ALERTS * 3:
        _alerts["all"] = _alerts["all"][-(MAX_ALERTS * 3):]

def _check_range(source, label, value, key_high, key_low):
    t = _thresholds[source]
    hi = t.get(key_high)
    lo = t.get(key_low)
    if hi is not None and value > hi:
        _add_alert(source, f"{label} HIGH — {value} (threshold: {hi})", "warn")
    if lo is not None and value < lo:
        _add_alert(source, f"{label} LOW — {value} (threshold: {lo})", "warn")

def _check_state_change(key, new_val, on_msg, off_msg, source):
    prev = _prev_states.get(key)
    if prev is not None and prev != new_val:
        if new_val:
            _add_alert(source, on_msg, "info")
        else:
            _add_alert(source, off_msg, "info")
    _prev_states[key] = new_val

def _generate_alerts():
    _check_range("solar", "Solar Voltage", _solar["voltage"], "voltage_high", "voltage_low")
    _check_state_change("charging", _solar["charging"],
                        "Battery charging", "Battery not charging", "solar")
    _check_range("hydro", "Water Pressure", _hydro["pressure"], "pressure_high", "pressure_low")
    _check_range("hydro", "Hydro Voltage", _hydro["voltage"], "voltage_high", "voltage_low")
    _check_state_change("pump_state", _hydro["pump_state"],
                        "Pump started — running", "Pump stopped", "hydro")
    if _gen["running"]:
        _check_range("generator", "Generator Voltage", _gen["voltage"], "voltage_high", "voltage_low")
        _check_range("generator", "Engine RPM", _gen["rpm"], "rpm_high", "rpm_low")
        _check_range("generator", "Coolant Temp", _gen["coolant_temp"], "coolant_high", "coolant_low")
        _check_range("generator", "Fuel Level", _gen["fuel_pct"], "fuel_high", "fuel_low")
        _check_range("generator", "Water Level", _gen["water_pct"], "water_high", "water_low")
        _check_range("generator", "Battery Voltage", _gen["bat_voltage"], "bat_voltage_high", "bat_voltage_low")
    _check_state_change("gen_running", _gen["running"],
                        "Generator started", "Generator stopped", "generator")

# ══════════════════════════════════════════════════════════
#  STATIC FILE ROUTES
# ══════════════════════════════════════════════════════════
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

# ══════════════════════════════════════════════════════════
#  API — DATA UPDATE (bridge.py pushes here)
# ══════════════════════════════════════════════════════════
@app.route('/api/update', methods=['POST'])
def api_update():
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
    return jsonify(ok=True)

# ══════════════════════════════════════════════════════════
#  API — DATA READ (dashboard pages poll these)
# ══════════════════════════════════════════════════════════
@app.route('/api/data')
def api_data():
    with _lock:
        return jsonify(solar=dict(_solar), hydro=dict(_hydro),
                       gen=dict(_gen), alerts=_alerts["all"][-20:])

@app.route('/api/solar')
def api_solar():
    with _lock:
        return jsonify(**_solar, alerts=_alerts["solar"][-20:])

@app.route('/api/hydro')
def api_hydro():
    with _lock:
        return jsonify(**_hydro, alerts=_alerts["hydro"][-20:])

@app.route('/api/generator')
def api_generator():
    with _lock:
        return jsonify(**_gen, alerts=_alerts["generator"][-20:])

# ══════════════════════════════════════════════════════════
#  API — GENERATOR TOGGLE (bidirectional)
# ══════════════════════════════════════════════════════════
@app.route('/api/gen_toggle', methods=['POST'])
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
def get_thresholds(source):
    if source not in _thresholds:
        return jsonify(error="Unknown source"), 400
    with _lock:
        return jsonify(**_thresholds[source])

@app.route('/api/thresholds/<source>', methods=['POST'])
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
def clear_alerts(source):
    with _lock:
        if source in _alerts:
            _alerts[source] = []
        if source == "all":
            for k in _alerts:
                _alerts[k] = []
    return jsonify(ok=True)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)