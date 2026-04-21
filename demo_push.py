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
        gv = round(220 + 2 * wave, 1)
        gc = round(182 + 3 * wave2, 1)
        gp = round(40 + 3 * wave, 1)
        gl = round(35 + 5 * wave2, 1)
        grpm = round(1500 + 20 * wave)
        gfreq = round(50.0 + 0.5 * wave, 1)
        gtemp = round(120 + 5 * wave, 1)
        gcool = round(90 + 3 * wave2, 1)
        goil = round(45 + 5 * wave2, 1)
        gvib = round(12 + 3 * wave, 1)
        gbat_cur = 18
    else:
        gv, gc, gp, gl = 0, 0, 0, 0
        grpm, gfreq = 0, 0
        gtemp, gcool = 0, 0
        goil, gvib = 0, 0
        gbat_cur = 0

    payload = {
        # ── Solar (prefixed) ──
        "solar_voltage":     round(218 + 4 * wave, 1),
        "solar_current":     round(89 + 3 * wave2, 1),
        "solar_power":       round(solar_power, 1),
        "solar_load":        round(solar_load, 1),
        "solar_soc":         round(max(0, min(100, 65 + 10 * wave))),
        "solar_charging":    1 if wave > -0.3 else 0,
        "solar_temp_panel":  round(40 + 5 * wave, 1),
        "solar_temp_module": round(46 + 4 * wave2, 1),

        # ── Hydro (prefixed) ──
        "hydro_voltage":     round(230 + 3 * wave, 1),
        "hydro_current":     round(120 + 5 * wave2, 1),
        "hydro_power":       round(hydro_power, 1),
        "hydro_load":        round(hydro_load, 1),
        "hydro_flow_rate":   round(0.57 + 0.03 * wave, 3),
        "hydro_pressure":    round(52 + 3 * wave2, 1),
        "hydro_pump_state":  1,

        # ── Generator (prefixed) ──
        "running":           gen_running,
        "gen_voltage":       gv,
        "gen_current":       gc,
        "gen_power":         gp,
        "gen_load":          gl,
        "gen_rpm":           grpm,
        "gen_frequency":     gfreq,
        "gen_temp":          gtemp,
        "gen_coolant":       gcool,
        "gen_fuel":          max(0, round(72 - tick * 0.01, 1)),
        "gen_water":         55,
        "gen_bat_voltage":   24,
        "gen_bat_current":   gbat_cur,
        "gen_oil_pressure":  goil,
        "gen_vibration":     gvib,

        # ── Generator fault flags (periodic faults when running) ──
        "gen_fault_voltage":      1 if (tick % 60 > 45 and gen_running) else 0,
        "gen_fault_rpm":          1 if (tick % 80 > 70 and gen_running) else 0,
        "gen_fault_coolant":      1 if (tick % 100 > 85 and gen_running) else 0,
        "gen_fault_fuel":         1 if (tick % 90 > 75 and gen_running) else 0,
        "gen_fault_water":        0,
        "gen_fault_bat_voltage":  0,
        "gen_fault_oil_pressure": 1 if (tick % 70 > 60 and gen_running) else 0,
        "gen_fault_vibration":    1 if (tick % 50 > 40 and gen_running) else 0,
    }

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
        faults = []
        if payload.get("gen_fault_voltage"):      faults.append("V")
        if payload.get("gen_fault_rpm"):           faults.append("RPM")
        if payload.get("gen_fault_coolant"):       faults.append("COOL")
        if payload.get("gen_fault_fuel"):          faults.append("FUEL")
        if payload.get("gen_fault_oil_pressure"):  faults.append("OIL")
        if payload.get("gen_fault_vibration"):     faults.append("VIB")
        fault_str = f"  faults=[{','.join(faults)}]" if faults else ""
        print(f"  tick={tick}  solar_pwr={solar_power:.1f}  hydro_pwr={hydro_power:.1f}  gen={'ON' if gen_running else 'OFF'}{fault_str}")

    tick += 1
    time.sleep(POLL)