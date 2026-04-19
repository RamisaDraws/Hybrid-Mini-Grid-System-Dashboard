# ════════════════════════════════════════════════
# demo_push.py
# Karazhar Minigrid — Test without MATLAB
#
# Simulates all signals with gentle oscillation.
# Run instead of bridge.py to test the dashboard
# without Simulink/MATLAB.
#
# Usage:
#   Terminal 1: python app.py
#   Terminal 2: python demo_push.py
#   Browser:    http://127.0.0.1:5000
# ════════════════════════════════════════════════

import time, math, requests, random

SERVER = "http://127.0.0.1:5000"
POLL   = 1.0  # seconds

tick = 0
gen_running = 0

print(f"Demo push running → {SERVER}  (Ctrl+C to stop)")

while True:
    t = tick * 0.1
    # Gentle sine oscillation
    wave = math.sin(t)
    wave2 = math.sin(t * 0.7)

    # ── Solar signals ──
    solar_power = max(0, 15 + 5 * wave)
    solar_load  = max(0, 13 + 4 * wave2)

    # ── Hydro signals ──
    hydro_power = 248 + 4 * wave
    hydro_load  = 195 + 15 * wave2

    # ── Generator signals (only meaningful when running) ──
    if gen_running:
        gv, gc, gp = 220, 182, 40
        grpm, gfreq = 1500, 50.0
        gtemp, gcool = 120, 90
        goil = 45 + 5 * wave2      # Oil pressure: ~40–50 PSI
        gvib = 12 + 3 * wave       # Vibration: ~9–15 mm/s
    else:
        gv, gc, gp = 0, 0, 0
        grpm, gfreq = 0, 0
        gtemp, gcool = 0, 0
        goil, gvib = 0, 0

    payload = {
        # Solar
        "voltage": round(218 + 4 * wave, 1),
        "current": round(89 + 3 * wave2, 1),
        "power_out": round(solar_power, 1),
        "load": round(solar_load, 1),
        "soc": round(max(0, min(100, 65 + 10 * wave))),
        "charging": 1 if wave > -0.3 else 0,
        "temp_panel": round(40 + 5 * wave, 1),
        "temp_module": round(46 + 4 * wave2, 1),
        # Hydro
        "flow_rate": round(0.57 + 0.03 * wave, 3),
        "pressure": round(52 + 3 * wave2, 1),
        "pump_state": 1,
        # Generator
        "running": gen_running,
        "rpm": grpm,
        "frequency": gfreq,
        "gen_temp": gtemp,
        "coolant_temp": gcool,
        "fuel_pct": max(0, 72 - tick * 0.01),
        "water_pct": 55,
        "bat_voltage": 24,
        "bat_current": 18 if gen_running else 0,
        "oil_pressure": round(goil, 1),
        "vibration": round(gvib, 1),
    }

    # Override hydro voltage/current/power from the hydro-specific keys
    payload["voltage"] = round(218 + 4 * wave, 1)     # last write wins — solar page uses this
    payload["current"] = round(89 + 3 * wave2, 1)

    try:
        requests.post(f"{SERVER}/api/update", json=payload, timeout=3)
    except Exception as e:
        print(f"[ERR] {e}")

    # Check for web toggle
    try:
        r = requests.get(f"{SERVER}/api/gen_command", timeout=3)
        if r.json().get("cmd") == "TOGGLE":
            gen_running = 1 - gen_running
            print(f"[WEB] Generator toggled → {'RUNNING' if gen_running else 'STANDBY'}")
    except:
        pass

    if tick % 10 == 0:
        print(f"  tick={tick}  solar_pwr={solar_power:.1f}  hydro_pwr={hydro_power:.1f}  gen={'ON' if gen_running else 'OFF'}")

    tick += 1
    time.sleep(POLL)