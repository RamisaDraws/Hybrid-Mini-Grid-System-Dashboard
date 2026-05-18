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
pgen_running = 0
gen_running  = 0

print(f"Demo push running → {SERVER}  (Ctrl+C to stop)")

while True:
    t = tick * 0.1
    wave  = math.sin(t)
    wave2 = math.sin(t * 0.7)

    # ── Solar signals ──
    solar_power = max(0, 15 + 5 * wave)
    solar_load  = max(0, 13 + 4 * wave2)

    # ── Hydro signals ──
    hydro_power = 248 + 4 * wave
    hydro_load  = 195 + 15 * wave2

    # ── Pump generator signals ──
    if pgen_running:
        pgv = round(220 + 2 * wave, 1)
        pgc = round(120 + 3 * wave2, 1)
        pgp = round(30 + 3 * wave, 1)
        pgrpm = round(1500 + 20 * wave)
        pgfreq = round(50.0 + 0.5 * wave, 1)
        pgtemp = round(110 + 5 * wave, 1)
        pgoil = round(45 + 5 * wave2, 1)
        pgvib = round(10 + 3 * wave, 1)
    else:
        pgv, pgc, pgp = 0, 0, 0
        pgrpm, pgfreq = 0, 0
        pgtemp = 0
        pgoil, pgvib = 0, 0

    # ── Main generator signals ──
    if gen_running:
        gv = round(220 + 2 * wave, 1)
        gc = round(182 + 3 * wave2, 1)
        gp = round(40 + 3 * wave, 1)
        grpm = round(1500 + 20 * wave)
        gfreq = round(50.0 + 0.5 * wave, 1)
        gtemp = round(120 + 5 * wave, 1)
        goil = round(45 + 5 * wave2, 1)
        gvib = round(12 + 3 * wave, 1)
    else:
        gv, gc, gp = 0, 0, 0
        grpm, gfreq = 0, 0
        gtemp = 0
        goil, gvib = 0, 0

    payload = {
        # ── Solar (prefixed) ──
        "solar_voltage":     round(218 + 4 * wave, 1),
        "solar_irradiance":  round(950 + 200 * wave, 1),
        "solar_power":       round(solar_power, 1),
        "solar_load":        round(solar_load, 1),
        "solar_soc":         round(max(0, min(100, 65 + 10 * wave))),
        "solar_charging":    1 if wave > -0.3 else 0,
        "solar_temp_panel":  round(40 + 5 * wave, 1),
        "solar_rms":         round(240 + 8 * wave, 1),

        # ── Hydro (prefixed) ──
        "hydro_voltage":     round(230 + 3 * wave, 1),
        "hydro_current":     round(120 + 5 * wave2, 1),
        "hydro_power":       round(hydro_power, 1),
        "hydro_load":        round(hydro_load, 1),
        "hydro_flow_rate":   round(2.8 + 0.15 * wave, 3),
        "hydro_pressure":    round(350 + 30 * wave2, 1),
        "hydro_pump_state":  1,
        "hydro_powerbank":  random.uniform(5000, 15000),

        # ── Pump generator (prefixed) ──
        "pgen_running":          pgen_running,
        "pgen_voltage":          pgv,
        "pgen_current":          pgc,
        "pgen_power":            pgp,
        "pgen_load":             round(hydro_load, 1),
        "pgen_rpm":              pgrpm,
        "pgen_frequency":        pgfreq,
        "pgen_temp":             pgtemp,
        "pgen_fuel":             max(0, round(72 - tick * 0.01, 1)),
        "pgen_bat_voltage":      24,
        "pgen_oil_pressure":     pgoil,
        "pgen_vibration":        pgvib,
        "pgen_fault_voltage":      1 if (tick % 60 > 45 and pgen_running) else 0,
        "pgen_fault_current":      1 if (tick % 75 > 65 and pgen_running) else 0,
        "pgen_fault_rpm_low":      1 if (tick % 80 > 70 and pgen_running) else 0,
        "pgen_fault_rpm_high":     1 if (tick % 85 > 75 and pgen_running) else 0,
        "pgen_fault_fuel":         1 if (tick % 90 > 75 and pgen_running) else 0,
        "pgen_fault_temp":         1 if (tick % 100 > 85 and pgen_running) else 0,
        "pgen_fault_oil_pressure": 1 if (tick % 70 > 60 and pgen_running) else 0,
        "pgen_fault_vibration":    1 if (tick % 50 > 40 and pgen_running) else 0,
        "pgen_fault_freq_high":    1 if (tick % 95 > 80 and pgen_running) else 0,
        "pgen_fault_freq_low":     1 if (tick % 110 > 95 and pgen_running) else 0,
        "pgen_fault_reset":        0,
        "pgen_mode_auto":          0,
        "pgen_mode_manual":        1,
        "pgen_mode_off":           0,

        # ── Main generator (prefixed) ──
        "gen_running":           gen_running,
        "gen_voltage":           gv,
        "gen_current":           gc,
        "gen_power":             gp,
        "gen_load":              round(hydro_load, 1),
        "gen_rpm":               grpm,
        "gen_frequency":         gfreq,
        "gen_temp":              gtemp,
        "gen_fuel":              max(0, round(70 - tick * 0.008, 1)),
        "gen_bat_voltage":       24,
        "gen_oil_pressure":      goil,
        "gen_vibration":         gvib,
        "gen_fault_voltage":      1 if (tick % 65 > 50 and gen_running) else 0,
        "gen_fault_current":      1 if (tick % 78 > 68 and gen_running) else 0,
        "gen_fault_rpm_low":      1 if (tick % 82 > 72 and gen_running) else 0,
        "gen_fault_rpm_high":     1 if (tick % 88 > 78 and gen_running) else 0,
        "gen_fault_fuel":         1 if (tick % 92 > 78 and gen_running) else 0,
        "gen_fault_temp":         1 if (tick % 105 > 90 and gen_running) else 0,
        "gen_fault_oil_pressure": 1 if (tick % 72 > 62 and gen_running) else 0,
        "gen_fault_vibration":    1 if (tick % 55 > 45 and gen_running) else 0,
        "gen_fault_freq_high":    1 if (tick % 98 > 83 and gen_running) else 0,
        "gen_fault_freq_low":     1 if (tick % 115 > 100 and gen_running) else 0,
        "gen_fault_reset":        0,
        "gen_mode_auto":          0,
        "gen_mode_manual":        1,
        "gen_mode_off":           0,
    }

    try:
        requests.post(f"{SERVER}/api/update", json=payload, timeout=3)
    except Exception as e:
        print(f"[ERR] {e}")

    # Check for web commands (START / SHUTDOWN)
    try:
        r = requests.get(f"{SERVER}/api/pgen_command", timeout=3)
        cmd = r.json().get("cmd", "")
        if cmd == "START":
            pgen_running = 1
            print(f"[WEB] Pump gen START → RUNNING")
        elif cmd == "SHUTDOWN":
            pgen_running = 0
            print(f"[WEB] Pump gen SHUTDOWN → STANDBY")
    except:
        pass

    try:
        r = requests.get(f"{SERVER}/api/gen_command", timeout=3)
        cmd = r.json().get("cmd", "")
        if cmd == "START":
            gen_running = 1
            print(f"[WEB] Main gen START → RUNNING")
        elif cmd == "SHUTDOWN":
            gen_running = 0
            print(f"[WEB] Main gen SHUTDOWN → STANDBY")
    except:
        pass

    if tick % 10 == 0:
        print(f"  tick={tick}  solar_pwr={solar_power:.1f}  hydro_pwr={hydro_power:.1f}  "
              f"pgen={'ON' if pgen_running else 'OFF'}  gen={'ON' if gen_running else 'OFF'}")

    tick += 1
    time.sleep(POLL)