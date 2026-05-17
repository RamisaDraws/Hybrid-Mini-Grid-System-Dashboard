# ════════════════════════════════════════════════
# bridge.py
# Karazhar Minigrid — Simulink ↔ Flask Bridge
#
# Reads all signals from simulink_output.mat
# Handles generator start/shutdown via state files
# POSTs everything to Flask /api/update
# ════════════════════════════════════════════════

import time, os, requests, struct
import scipy.io as sio
import math

# ── Configuration ────────────────────────────────────────
SERVER     = "http://127.0.0.1:5000"
POLL       = 0.5   # seconds between loops

# File paths
BASE     = os.path.dirname(os.path.abspath(__file__)) + "/"
MAT_FILE = os.path.join(BASE, "..", "simulink_output.mat")
SOLAR_MAT_FILE  = os.path.join(BASE, "..", "solar_output.mat")


# Pump generator state files (binary int32, read by Simulink)
PGEN_START    = BASE + "pgen_start.txt"
PGEN_SHUTDOWN = BASE + "pgen_shutdown.txt"

# Main generator state files (binary int32, read by Simulink)
GEN_START     = BASE + "gen_start.txt"
GEN_SHUTDOWN  = BASE + "gen_shutdown.txt"

# ── Variable mapping: .mat field name → Flask API key ────
# Solar signals
SOLAR_VARS = {
    "solar_voltage":     "solar_voltage",
    "solar_irradiance":  "solar_irradiance",
    "solar_power":       "solar_power",
    "solar_load":        "solar_load",
    "solar_soc":         "solar_soc",
    "solar_charging":    "solar_charging",
    "solar_temp_panel":  "solar_temp_panel",
    "solar_rms":         "solar_rms",
}

# Hydro signals
HYDRO_VARS = {
    "hydro_voltage":     "hydro_voltage",
    "hydro_current":     "hydro_current",
    "hydro_power":       "hydro_power",
    "hydro_load":        "hydro_load",
    "hydro_flow_rate":   "hydro_flow_rate",
    "hydro_pressure":    "hydro_pressure",
    "hydro_pump_state":  "hydro_pump_state",
    "hydro_powerbank":   "hydro_powerbank",
}

# Pump generator signals (pgen_running comes from .mat — Simulink is source of truth)
PGEN_VARS = {
    "pgen_running":             "pgen_running",
    "pgen_voltage":             "pgen_voltage",
    "pgen_current":             "pgen_current",
    "pgen_power":               "pgen_power",
    "pgen_load":                "pgen_load",
    "pgen_rpm":                 "pgen_rpm",
    "pgen_frequency":           "pgen_frequency",
    "pgen_temp":                "pgen_temp",
    "pgen_fuel":                "pgen_fuel",
    "pgen_bat_voltage":         "pgen_bat_voltage",
    "pgen_bat_current":         "pgen_bat_current",
    "pgen_oil_pressure":        "pgen_oil_pressure",
    "pgen_vibration":           "pgen_vibration",
    "pgen_fault_voltage":       "pgen_fault_voltage",
    "pgen_fault_current":       "pgen_fault_current",
    "pgen_fault_rpm_low":       "pgen_fault_rpm_low",
    "pgen_fault_rpm_high":      "pgen_fault_rpm_high",
    "pgen_fault_fuel":          "pgen_fault_fuel",
    "pgen_fault_temp":          "pgen_fault_temp",
    "pgen_fault_oil_pressure":  "pgen_fault_oil_pressure",
    "pgen_fault_vibration":     "pgen_fault_vibration",
    "pgen_fault_reset":         "pgen_fault_reset",
    "pgen_mode_auto":           "pgen_mode_auto",
    "pgen_mode_manual":         "pgen_mode_manual",
    "pgen_mode_off":            "pgen_mode_off",
}

# Main generator signals (gen_running comes from .mat — Simulink is source of truth)
GEN_VARS = {
    "gen_running":              "gen_running",
    "gen_voltage":              "gen_voltage",
    "gen_current":              "gen_current",
    "gen_power":                "gen_power",
    "gen_load":                 "gen_load",
    "gen_rpm":                  "gen_rpm",
    "gen_frequency":            "gen_frequency",
    "gen_temp":                 "gen_temp",
    "gen_fuel":                 "gen_fuel",
    "gen_bat_voltage":          "gen_bat_voltage",
    "gen_bat_current":          "gen_bat_current",
    "gen_oil_pressure":         "gen_oil_pressure",
    "gen_vibration":            "gen_vibration",
    "gen_fault_voltage":        "gen_fault_voltage",
    "gen_fault_current":        "gen_fault_current",
    "gen_fault_rpm_low":        "gen_fault_rpm_low",
    "gen_fault_rpm_high":       "gen_fault_rpm_high",
    "gen_fault_fuel":           "gen_fault_fuel",
    "gen_fault_temp":           "gen_fault_temp",
    "gen_fault_oil_pressure":   "gen_fault_oil_pressure",
    "gen_fault_vibration":      "gen_fault_vibration",
    "gen_fault_reset":          "gen_fault_reset",
    "gen_mode_auto":            "gen_mode_auto",
    "gen_mode_manual":          "gen_mode_manual",
    "gen_mode_off":             "gen_mode_off",
}

# ── File I/O helpers ─────────────────────────────────────
def write_state_file(path, state):
    """Write generator state as binary int32 for Simulink fread."""
    with open(path, 'wb') as f:
        f.write(struct.pack('i', state))

def push_to_server(payload):
    try:
        requests.post(f"{SERVER}/api/update", json=payload, timeout=3)
    except Exception as e:
        print(f"[PUSH ERR] {e}")

def poll_web_command(endpoint):
    """Check if the web dashboard sent a generator command (START or SHUTDOWN)."""
    try:
        r = requests.get(f"{SERVER}{endpoint}", timeout=3)
        cmd = r.json().get("cmd", "")
        if cmd in ("START", "SHUTDOWN"):
            return cmd
        return None
    except:
        return None

def read_mat():
    """Read all signals from both .mat files written by Simulink."""
    try:
        result = {}

        if os.path.exists(MAT_FILE):
            mat = sio.loadmat(MAT_FILE)
            all_keys = list(HYDRO_VARS.keys()) + list(PGEN_VARS.keys()) + list(GEN_VARS.keys())
            for mat_key in all_keys:
                if mat_key in mat:
                    result[mat_key] = float(mat[mat_key].flat[0])

        if os.path.exists(SOLAR_MAT_FILE):
            solar_mat = sio.loadmat(SOLAR_MAT_FILE)
            for mat_key in SOLAR_VARS.keys():
                if mat_key in solar_mat:
                    result[mat_key] = float(solar_mat[mat_key].flat[0])

        return result if result else None
    except Exception as e:
        print(f"[MAT ERR] {e}")
        return None

# ── Init ─────────────────────────────────────────────────
# All state files start at 0 (generator off, no shutdown command)
write_state_file(PGEN_START, 0)
write_state_file(PGEN_SHUTDOWN, 0)
write_state_file(GEN_START, 0)
write_state_file(GEN_SHUTDOWN, 0)
print(f"Bridge running → {SERVER}  (Ctrl+C to stop)")
print(f"MAT file: {MAT_FILE}")
print(f"Pump gen files: {PGEN_START}, {PGEN_SHUTDOWN}")
print(f"Main gen files: {GEN_START}, {GEN_SHUTDOWN}")

# ── Main loop ────────────────────────────────────────────
while True:
    # ── Pump generator commands from web ──
    pgen_cmd = poll_web_command("/api/pgen_command")
    if pgen_cmd == "START":
        write_state_file(PGEN_START, 1)
        write_state_file(PGEN_SHUTDOWN, 0)
        print("[WEB] Pump gen START → start=1, shutdown=0")
    elif pgen_cmd == "SHUTDOWN":
        write_state_file(PGEN_SHUTDOWN, 1)
        write_state_file(PGEN_START, 0)
        print("[WEB] Pump gen SHUTDOWN → start=0, shutdown=1")

    # ── Main generator commands from web ──
    gen_cmd = poll_web_command("/api/gen_command")
    if gen_cmd == "START":
        write_state_file(GEN_START, 1)
        write_state_file(GEN_SHUTDOWN, 0)
        print("[WEB] Main gen START → start=1, shutdown=0")
    elif gen_cmd == "SHUTDOWN":
        write_state_file(GEN_SHUTDOWN, 1)
        write_state_file(GEN_START, 0)
        print("[WEB] Main gen SHUTDOWN → start=0, shutdown=1")

    # Build payload — no local state, everything from .mat
    payload = {}

    # Read Simulink signals from .mat
    t0 = time.time()
    signals = read_mat()
    print(f"  mat read: {time.time() - t0:.3f}s")
    if signals:
        for mat_key, api_key in SOLAR_VARS.items():
            if mat_key in signals:
                payload[api_key] = signals[mat_key]

        for mat_key, api_key in HYDRO_VARS.items():
            if mat_key in signals:
                payload[api_key] = signals[mat_key]

        for mat_key, api_key in PGEN_VARS.items():
            if mat_key in signals:
                payload[api_key] = signals[mat_key]

        for mat_key, api_key in GEN_VARS.items():
            if mat_key in signals:
                payload[api_key] = signals[mat_key]

        sv = signals.get("solar_voltage", 0)
        hv = signals.get("hydro_voltage", 0)
        pgv = signals.get("pgen_voltage", 0)
        gv = signals.get("gen_voltage", 0)
        pg_run = signals.get("pgen_running", 0)
        g_run = signals.get("gen_running", 0)
        print(f"  Solar V={sv:.1f}  Hydro V={hv:.1f}  PGen V={pgv:.1f}  Gen V={gv:.1f}  "
              f"PGen={'ON' if pg_run else 'OFF'}  Gen={'ON' if g_run else 'OFF'}")

    # Sanitize NaN/Inf before JSON POST
    for k, v in payload.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            payload[k] = 0

    push_to_server(payload)
    time.sleep(POLL)