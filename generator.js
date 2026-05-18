/* ════════════════════════════════════════════════
   generator.js
   Karazhar Minigrid — Main Generator Page (Live)
   ════════════════════════════════════════════════ */

/* ── Theme ── */
function getTheme() { return localStorage.getItem('karazhar-theme') || 'dark'; }
function applyTheme(theme) {
  if (theme === 'light') document.body.classList.add('light');
  else document.body.classList.remove('light');
  localStorage.setItem('karazhar-theme', theme);
}
function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  if (dualChart) { dualChart.destroy(); dualChart = null; initGenChart(); }
}
function isLight() { return document.body.classList.contains('light'); }
function getGenColor() { return getComputedStyle(document.body).getPropertyValue('--gen').trim(); }
applyTheme(getTheme());

/* ── Auth ── */
function handleAuthError(res) {
  if (res.status === 401) { window.location.href = '/login.html'; return true; }
  return false;
}
async function doLogout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  window.location.href = '/login.html';
}

/* ── Live clock ── */
(function () {
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const now = new Date();
    const kz = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Almaty' }));
    const t = document.getElementById('live-time');
    const d = document.getElementById('live-date');
    if (t) t.textContent = `${pad(kz.getHours())}:${pad(kz.getMinutes())}:${pad(kz.getSeconds())}`;
    if (d) {
      const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      d.textContent = `${D[kz.getDay()]}, ${pad(kz.getDate())} ${M[kz.getMonth()]} ${kz.getFullYear()}`;
    }
  }
  tick(); setInterval(tick, 1000);
})();

/* ── Alert audio ── */
let _prevAlertCount = -1;
function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}
function checkAlertSound(alerts) {
  const count = (alerts || []).length;
  if (_prevAlertCount >= 0 && count > _prevAlertCount) playAlertBeep();
  _prevAlertCount = count;
}

/* ── Hamburger ── */
const hamburgerBtn = document.getElementById('hamburger-btn');
const mobileNav    = document.getElementById('mobile-nav');
hamburgerBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));
mobileNav.querySelectorAll('.nav-link').forEach(l =>
  l.addEventListener('click', () => mobileNav.classList.remove('open'))
);

/* ── Chart options ── */
function getChartOpts() {
  const s = getComputedStyle(document.body);
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: s.getPropertyValue('--chart-tooltip-bg').trim(),
        borderColor: s.getPropertyValue('--chart-tooltip-border').trim(), borderWidth: 1,
        titleColor: s.getPropertyValue('--chart-tooltip-title').trim(),
        bodyColor: s.getPropertyValue('--chart-tooltip-body').trim(),
        titleFont: { family: 'JetBrains Mono', size: 12 },
        bodyFont: { family: 'JetBrains Mono', size: 13 },
        padding: 8, displayColors: true,
        callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} kW` }
      }
    },
    scales: {
      x: { grid: { color: s.getPropertyValue('--chart-grid').trim(), drawBorder: false },
           ticks: { color: s.getPropertyValue('--chart-tick').trim(), font: { family: 'JetBrains Mono', size: 11 }, maxTicksLimit: 8 },
           border: { display: false } },
      y: { grid: { color: s.getPropertyValue('--chart-grid').trim(), drawBorder: false },
           ticks: { color: s.getPropertyValue('--chart-tick').trim(), font: { family: 'JetBrains Mono', size: 11 }, maxTicksLimit: 5 },
           border: { display: false } }
    }
  };
}

const chartLabels = Array.from({ length: 16 }, () => '--:--');

/* ── Gauge ── */
function drawGauge(el, value, min, max, color) {
  if (!el) return;
  const c = el.getContext('2d');
  const W = el.width, H = el.height;
  const cx = W / 2, cy = H - 25;
  const r = Math.min(W / 2, H) - 14, lw = 12;
  const s = getComputedStyle(document.body);
  const trackColor = s.getPropertyValue('--gauge-track').trim();
  const tickColor  = s.getPropertyValue('--gauge-tick').trim();
  const labelColor = s.getPropertyValue('--gauge-label').trim();
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.arc(cx, cy, r, Math.PI, 0, false);
  c.strokeStyle = trackColor; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  const range = max - min;
  const frac = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;
  c.beginPath(); c.arc(cx, cy, r, Math.PI, Math.PI + frac * Math.PI, false);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round';
  if (!isLight()) { c.shadowColor = color; c.shadowBlur = 10; }
  c.stroke(); c.shadowBlur = 0;
  c.strokeStyle = tickColor; c.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    c.beginPath();
    c.moveTo(cx + (r - lw/2 - 2) * Math.cos(a), cy + (r - lw/2 - 2) * Math.sin(a));
    c.lineTo(cx + (r + lw/2 + 2) * Math.cos(a), cy + (r + lw/2 + 2) * Math.sin(a));
    c.stroke();
  }
  c.fillStyle = labelColor; c.font = '13px JetBrains Mono';
  c.textAlign = 'left'; c.fillText(min, cx - r - 2, cy + 25);
  c.textAlign = 'right'; c.fillText(max, cx + r + 12, cy + 25);
}

function setVBar(barId, valId, pct, displayVal) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (bar) bar.style.height = pct + '%';
  if (val) val.textContent = displayVal;
}

/* ── Rolling chart data ── */
const powerOutData = new Array(16).fill(0);
const loadDemandData = new Array(16).fill(0);
let dualChart;
let _currentRunning = 0;

/* ── Apply generator state to UI ── */
function applyState(d) {
  _currentRunning = d.running;
  const running = d.running;
  const dot = document.getElementById('gen-status-dot');
  const txt = document.getElementById('gen-status-text');
  const btn = document.getElementById('gen-toggle-btn');
  const btnLabel = document.getElementById('gen-btn-label');
  const gc = getGenColor();

  if (running) {
    if (dot) dot.className = 'gen-status-dot running';
    if (txt) { txt.textContent = 'RUNNING'; txt.className = 'gen-status-text running-text'; }
    if (btn) btn.className = 'gen-toggle-btn active';
    if (btnLabel) btnLabel.textContent = 'Stop Generator';

    drawGauge(document.getElementById('gauge-gen-voltage'), d.voltage, 0, 500, gc);
    drawGauge(document.getElementById('gauge-gen-current'), d.current, 0, 600, gc);
    drawGauge(document.getElementById('gauge-vibration'), d.vibration, 0, 60, gc);
    drawGauge(document.getElementById('gauge-oil-pressure'), d.oil_pressure, 0, 80, gc);
    drawGauge(document.getElementById('gauge-rpm'), d.rpm, 0, 2000, gc);
    drawGauge(document.getElementById('gauge-freq'), d.frequency, 0, 60, gc);
    drawGauge(document.getElementById('gauge-bat-voltage'), d.bat_voltage, 0, 30, gc);

    document.getElementById('gen-voltage-val').textContent = Number(d.voltage).toFixed(1);
    document.getElementById('gen-current-val').textContent = Number(d.current).toFixed(1);
    document.getElementById('vibration-val').textContent = Number(d.vibration).toFixed(1);
    document.getElementById('oil-pressure-val').textContent = Number(d.oil_pressure).toFixed(1);
    document.getElementById('rpm-val').textContent = Number(d.rpm).toFixed(0);
    document.getElementById('freq-val').textContent = Number(d.frequency).toFixed(1);
    document.getElementById('bat-voltage-val').textContent = Number(d.bat_voltage).toFixed(1);

    setVBar('vbar-gen-temp', 'gen-temp-val', (d.gen_temp / 200) * 100, Number(d.gen_temp).toFixed(1));

    // ATS → Generator
    document.getElementById('ats-grid-badge').className = 'ats-source-badge standby';
    document.getElementById('ats-grid-badge').textContent = 'STANDBY';
    document.getElementById('ats-gen-badge').className = 'ats-source-badge running';
    document.getElementById('ats-gen-badge').textContent = 'ACTIVE';
    document.querySelector('#ats-grid .ats-icon').className = 'ats-icon ats-icon-standby';
    document.querySelector('#ats-gen-src .ats-icon').className = 'ats-icon ats-icon-running';
  } else {
    if (dot) dot.className = 'gen-status-dot standby';
    if (txt) { txt.textContent = 'STANDBY'; txt.className = 'gen-status-text'; }
    if (btn) btn.className = 'gen-toggle-btn';
    if (btnLabel) btnLabel.textContent = 'Start Generator';

    ['gauge-gen-voltage','gauge-gen-current','gauge-rpm','gauge-freq','gauge-vibration','gauge-oil-pressure'].forEach(id => {
      drawGauge(document.getElementById(id), 0, 0, 1, gc, true);
    });
    drawGauge(document.getElementById('gauge-bat-voltage'), d.bat_voltage, 0, 30, gc);

    document.getElementById('gen-voltage-val').textContent = '0';
    document.getElementById('gen-current-val').textContent = '0';
    document.getElementById('vibration-val').textContent = '0';
    document.getElementById('oil-pressure-val').textContent = '0';
    document.getElementById('rpm-val').textContent = '0';
    document.getElementById('freq-val').textContent = '0';
    document.getElementById('bat-voltage-val').textContent = Number(d.bat_voltage).toFixed(1);

    setVBar('vbar-gen-temp', 'gen-temp-val', 0, '—');

    // ATS → Grid
    document.getElementById('ats-grid-badge').className = 'ats-source-badge active';
    document.getElementById('ats-grid-badge').textContent = 'ACTIVE';
    document.getElementById('ats-gen-badge').className = 'ats-source-badge standby';
    document.getElementById('ats-gen-badge').textContent = 'STANDBY';
    document.querySelector('#ats-grid .ats-icon').className = 'ats-icon ats-icon-active';
    document.querySelector('#ats-gen-src .ats-icon').className = 'ats-icon ats-icon-standby';
  }

  // Always update fuel
  setVBar('vbar-fuel', 'fuel-val', d.fuel_pct, Number(d.fuel_pct).toFixed(1));

  // 3-mode display: auto / manual / off
  const modeBadge = document.getElementById('gen-mode-badge');
  const isManual = d.mode_manual === 1;
  const isAuto = d.mode_auto === 1;
  const isOff = d.mode_off === 1;
  if (modeBadge) {
    if (isAuto)       { modeBadge.textContent = 'AUTO';   modeBadge.className = 'gen-mode-badge auto'; }
    else if (isManual) { modeBadge.textContent = 'MANUAL'; modeBadge.className = 'gen-mode-badge manual'; }
    else if (isOff)    { modeBadge.textContent = 'OFF';    modeBadge.className = 'gen-mode-badge off'; }
    else               { modeBadge.textContent = 'OFF'; modeBadge.className = 'gen-mode-badge'; }
  }
  // Start/Stop only in manual mode
  if (btn) {
    btn.disabled = !isManual;
    btn.title = isManual ? '' : 'Switch to MANUAL mode in Simulink to control remotely';
  }
  const noteEl = document.querySelector('.gen-control-note');
  if (noteEl) {
    if (isAuto) noteEl.textContent = 'Auto mode — remote control disabled';
    else if (isOff) noteEl.textContent = 'Generator OFF mode — remote control disabled';
    else noteEl.textContent = 'Admin access required';
  }

  // Fault reset indicator
  const faultResetEl = document.getElementById('gen-fault-reset');
  if (faultResetEl) {
    faultResetEl.style.display = d.fault_reset ? 'block' : 'none';
  }
}

/* ── Alerts ── */
function renderAlerts(alerts) {
  const el = document.querySelector('.gen-alerts .alerts-list');
  if (!el) return;
  el.innerHTML = '';
  if (!alerts || alerts.length === 0) {
    el.innerHTML = `<div class="alert-item alert-info"><div class="alert-dot dot-green"></div>
      <div class="alert-body"><span class="alert-msg">No alerts</span>
      <span class="alert-time">—</span></div></div>`;
    return;
  }
  alerts.slice(-20).reverse().forEach(a => {
    const lc = a.level === 'warn' ? 'alert-warn' : a.level === 'crit' ? 'alert-crit' : 'alert-info';
    const dc = a.level === 'warn' ? 'dot-yellow' : a.level === 'crit' ? 'dot-red' : 'dot-green';
    el.innerHTML += `<div class="alert-item ${lc}"><div class="alert-dot ${dc}"></div>
      <div class="alert-body"><span class="alert-msg">${a.msg}</span>
      <span class="alert-time">${a.time}</span></div></div>`;
  });
}

/* ── Alert date dropdown ── */
async function loadAlertDates() {
  try {
    const res = await fetch('/api/alerts/dates');
    if (handleAuthError(res)) return;
    const data = await res.json();
    const sel = document.getElementById('alert-date-select');
    if (!sel) return;
    sel.innerHTML = '';
    const today = new Date().toISOString().slice(0, 10);
    const todayOpt = document.createElement('option');
    todayOpt.value = today; todayOpt.textContent = 'Today';
    sel.appendChild(todayOpt);
    (data.dates || []).forEach(d => {
      if (d === today) return;
      const opt = document.createElement('option');
      opt.value = d;
      const parts = d.split('-');
      opt.textContent = `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
      sel.appendChild(opt);
    });
  } catch (e) {}
}

async function onAlertDateChange() {
  const sel = document.getElementById('alert-date-select');
  if (!sel) return;
  try {
    const res = await fetch(`/api/alerts/${sel.value}?source=generator`);
    if (handleAuthError(res)) return;
    const data = await res.json();
    renderAlerts(data.alerts || []);
  } catch (e) {}
}

/* ── Load chart history ── */
async function loadChartHistory() {
  try {
    const res = await fetch('/api/chart_history');
    if (handleAuthError(res)) return;
    const h = await res.json();
    if (h.gen_power && h.gen_power.length > 0) {
      const pad = (arr, n) => { const a = arr.slice(-n); while (a.length < n) a.unshift(0); return a; };
      const gp = pad(h.gen_power, 16);
      const gl = pad(h.gen_load || [], 16);
      const ts = pad(h.timestamps, 16);
      for (let i = 0; i < 16; i++) {
        powerOutData[i] = gp[i]; loadDemandData[i] = gl[i];
        if (ts[i]) chartLabels[i] = ts[i];
      }
      if (dualChart) { dualChart.data.labels = chartLabels; dualChart.update('none'); }
    }
  } catch (e) { console.warn('Chart history load failed'); }
}

/* ── Init ── */
function initGenChart() {
  const dualCtx = document.getElementById('chart-gen-dual');
  if (dualCtx) {
    const c = dualCtx.getContext('2d');
    const gc = getGenColor();
    const gP = c.createLinearGradient(0, 0, 0, 200);
    gP.addColorStop(0, gc + '40'); gP.addColorStop(1, gc + '00');
    const gL = c.createLinearGradient(0, 0, 0, 200);
    gL.addColorStop(0, 'rgba(136,136,136,0.15)'); gL.addColorStop(1, 'rgba(136,136,136,0)');
    dualChart = new Chart(c, {
      type: 'line',
      data: { labels: chartLabels,
        datasets: [
          { label: 'Power Out (kW)', data: powerOutData, borderColor: gc, borderWidth: 2,
            backgroundColor: gP, fill: true, tension: 0.4, pointRadius: 0,
            pointHoverRadius: 4, pointHoverBackgroundColor: gc,
            pointHoverBorderColor: isLight() ? '#ffffff' : '#0a0a0a', pointHoverBorderWidth: 2 },
          { label: 'Load (kW)', data: loadDemandData, borderColor: '#888', borderWidth: 1.5,
            borderDash: [5, 3], backgroundColor: gL, fill: true, tension: 0.45,
            pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#888',
            pointHoverBorderColor: isLight() ? '#ffffff' : '#0a0a0a', pointHoverBorderWidth: 2 }
        ] },
      options: getChartOpts()
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('gen-toggle-btn').addEventListener('click', async () => {
    try {
      const endpoint = _currentRunning ? '/api/gen_shutdown' : '/api/gen_start';
      const res = await fetch(endpoint, { method: 'POST' });
      if (handleAuthError(res)) return;
      if (res.status === 403) {
        const data = await res.json();
        console.warn(data.error || 'Not in manual mode');
      }
    } catch (e) { console.warn('Command failed:', e.message); }
  });

  initGenChart();

  applyState({ running: 0, voltage: 0, current: 0, rpm: 0, frequency: 0,
    gen_temp: 0, fuel_pct: 72, bat_voltage: 24,
    power_out: 0, load: 35, vibration: 0, oil_pressure: 0,
    mode_auto: 0, mode_manual: 1, mode_off: 0, fault_reset: 0 });

  loadChartHistory();
  loadAlertDates();
});

/* ── Poll ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/generator');
    if (handleAuthError(res)) return;
    const d = await res.json();
    applyState(d);

    pollCount++;
    if (pollCount % 3 === 0) {
      powerOutData.shift(); powerOutData.push(d.power_out);
      loadDemandData.shift(); loadDemandData.push(d.load);
      if (dualChart) dualChart.update('none');
    }

    const sel = document.getElementById('alert-date-select');
    const today = new Date().toISOString().slice(0, 10);
    if (!sel || sel.value === today) {
      checkAlertSound(d.alerts);
      renderAlerts(d.alerts || []);
    }
  } catch (e) { console.warn('Bridge not connected:', e.message); }
}, 1000);