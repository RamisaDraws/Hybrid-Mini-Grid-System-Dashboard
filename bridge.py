# ════════════════════════════════════════════════
# bridge.py
# Karazhar Minigrid — Simulink ↔ Flask Bridge
#
# Reads all signals from simulink_output.mat
# Handles generator toggle via state.txt / cmd_from_sim.txt
# POSTs everything to Flask /api/update
# ════════════════════════════════════════════════

import time, os, requests, struct
import scipy.io as sio

# ── Configuration ────────────────────────────────────────
# Update SERVER to your Render URL when deploying remotely
SERVER     = "http://127.0.0.1:5000"
POLL       = 0.5   # seconds between loops

# File paths — update these to match your machine
BASE       = "C:/Users/ramis/Documents/miniGridKarazhar/"
SIM_CMD    = BASE + "cmd_from_sim.txt"
STATE_FILE = BASE + "state.txt"
MAT_FILE   = "C:/Users/ramis/OneDrive - Swinburne Sarawak/Documents/MATLAB/miniGridTest/simulink_output.mat"

# ── Variable mapping: .mat field name → Flask API key ────
# Solar signals
SOLAR_VARS = {
    "solar_voltage":     "voltage",
    "solar_current":     "current",
    "solar_power":       "power_out",
    "solar_load":        "load",
    "solar_soc":         "soc",
    "solar_charging":    "charging",
    "solar_temp_panel":  "temp_panel",
    "solar_temp_module": "temp_module",
}

# Hydro signals
HYDRO_VARS = {
    "hydro_voltage":     "voltage",
    "hydro_current":     "current",
    "hydro_power":       "power_out",
    "hydro_load":        "load",
    "hydro_flow_rate":   "flow_rate",
    "hydro_pressure":    "pressure",
    "hydro_pump_state":  "pump_state",
}

# Generator signals
GEN_VARS = {
    "gen_voltage":       "voltage",
    "gen_current":       "current",
    "gen_power":         "power_out",
    "gen_load":          "load",
    "gen_rpm":           "rpm",
    "gen_frequency":     "frequency",
    "gen_temp":          "gen_temp",
    "gen_coolant":       "coolant_temp",
    "gen_fuel":          "fuel_pct",
    "gen_water":         "water_pct",
    "gen_bat_voltage":   "bat_voltage",
    "gen_bat_current":   "bat_current",
    "gen_oil_pressure":  "oil_pressure",
    "gen_vibration":     "vibration",
    # Fault flags from Simulink fault detection
    "gen_fault_voltage":      "fault_voltage",
    "gen_fault_rpm":          "fault_rpm",
    "gen_fault_coolant":      "fault_coolant",
    "gen_fault_fuel":         "fault_fuel",
    "gen_fault_water":        "fault_water",
    "gen_fault_bat_voltage":  "fault_bat_voltage",
    "gen_fault_oil_pressure": "fault_oil_pressure",
    "gen_fault_vibration":    "fault_vibration",
    # Auto/Manual mode
    "gen_mode":               "mode",
}

# Generator state (toggle)
gen_state = 0

# ── File I/O helpers ─────────────────────────────────────
def clear_sim_cmd():
    with open(SIM_CMD, 'w') as f:
        f.write('')

def write_gen_state(s):
    """Write generator state as binary int32 for Simulink fread."""
    with open(STATE_FILE, 'wb') as f:
        f.write(struct.pack('i', s))

def push_to_server(payload):
    try:
        requests.post(f"{SERVER}/api/update", json=payload, timeout=3)
    except Exception as e:
        print(f"[PUSH ERR] {e}")

def poll_web_toggle():
    """Check if the web dashboard sent a generator toggle command."""
    try:
        r = requests.get(f"{SERVER}/api/gen_command", timeout=3)
        cmd = r.json().get("cmd", "")
        return cmd == "TOGGLE"
    except:
        return False

def poll_sim_toggle():
    """Check if Simulink Push Button wrote TOGGLE to cmd_from_sim.txt."""
    try:
        if not os.path.exists(SIM_CMD):
            return False
        with open(SIM_CMD, 'r') as f:
            content = f.read().strip()
        if content == "TOGGLE":
            clear_sim_cmd()
            return True
    except:
        pass
    return False

def read_mat():
    """Read all signals from the .mat file written by Simulink."""
    try:
        if not os.path.exists(MAT_FILE):
            return None
        mat = sio.loadmat(MAT_FILE)
        result = {}
        # Extract each variable, taking the latest value
        for mat_key in list(SOLAR_VARS.keys()) + list(HYDRO_VARS.keys()) + list(GEN_VARS.keys()):
            if mat_key in mat:
                result[mat_key] = float(mat[mat_key].flat[0])
        return result
    except Exception as e:
        print(f"[MAT ERR] {e}")
        return None

# ── Init ─────────────────────────────────────────────────
write_gen_state(gen_state)
clear_sim_cmd()
push_to_server({"running": gen_state})
print(f"Bridge running → {SERVER}  (Ctrl+C to stop)")
print(f"MAT file: {MAT_FILE}")
print(f"State file: {STATE_FILE}")
print(f"Sim cmd file: {SIM_CMD}")

# ── Main loop ────────────────────────────────────────────
while True:
    toggled = False

    # Check for generator toggle from Simulink
    if poll_sim_toggle():
        print("[SIM] Generator toggle detected")
        toggled = True

    # Check for generator toggle from web dashboard
    if poll_web_toggle():
        print("[WEB] Generator toggle detected")
        toggled = True

    # Flip generator state if toggled
    if toggled:
        gen_state = 1 - gen_state
        write_gen_state(gen_state)
        print(f"  → Generator state now: {'RUNNING' if gen_state else 'STANDBY'}")

    # Build payload — always include generator running state
    payload = {"running": gen_state}

    # Read Simulink signals from .mat
    signals = read_mat()
    if signals:
        # Map solar signals — send prefixed keys (e.g. "solar_voltage")
        for mat_key in SOLAR_VARS:
            if mat_key in signals:
                payload[mat_key] = signals[mat_key]

        # Map hydro signals — send prefixed keys (e.g. "hydro_voltage")
        for mat_key in HYDRO_VARS:
            if mat_key in signals:
                payload[mat_key] = signals[mat_key]

        # Map generator signals — send prefixed keys (e.g. "gen_voltage")
        for mat_key in GEN_VARS:
            if mat_key in signals:
                payload[mat_key] = signals[mat_key]

        # Print summary
        sv = signals.get("solar_voltage", 0)
        hv = signals.get("hydro_voltage", 0)
        gv = signals.get("gen_voltage", 0)
        print(f"  Solar V={sv:.1f}  Hydro V={hv:.1f}  Gen V={gv:.1f}  GenState={'ON' if gen_state else 'OFF'}")

    push_to_server(payload)
    time.sleep(POLL)