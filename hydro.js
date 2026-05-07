/* ════════════════════════════════════════════════
   hydro.js
   Karazhar Minigrid — In-Pipe Hydro Page (Live)
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
  const hc = getHydroColor();
  drawGauge(document.getElementById('gauge-pressure'), parseFloat(document.getElementById('pressure-val').textContent) || 0, 0, 500, hc);
  drawGauge(document.getElementById('gauge-voltage'), parseFloat(document.getElementById('voltage-val').textContent) || 0, 0, 440, hc);
  drawGauge(document.getElementById('gauge-current'), parseFloat(document.getElementById('current-val').textContent) || 0, 0, 300, hc);
  if (flowChart) { flowChart.destroy(); flowChart = null; }
  if (dualChart) { dualChart.destroy(); dualChart = null; }
  initHydroCharts();
}
function isLight() { return document.body.classList.contains('light'); }
function getHydroColor() { return getComputedStyle(document.body).getPropertyValue('--hydro').trim(); }
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
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

function checkAlertSound(alerts) {
  const count = (alerts || []).length;
  if (_prevAlertCount >= 0 && count > _prevAlertCount) {
    playAlertBeep();
  }
  _prevAlertCount = count;
}

/* ── Hamburger ── */
const hamburgerBtn = document.getElementById('hamburger-btn');
const mobileNav    = document.getElementById('mobile-nav');
hamburgerBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));
mobileNav.querySelectorAll('.nav-link').forEach(l =>
  l.addEventListener('click', () => mobileNav.classList.remove('open'))
);

/* ── Weather (from Simulink ambient temp, updated via poll) ── */
function updateWeatherFromData(ambientTemp) {
  const el = document.getElementById('weather-temp');
  if (el) el.textContent = Number(ambientTemp).toFixed(1) + '°C';
}

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
        callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(2)}` }
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
  const c = el.getContext('2d');
  const W = el.width, H = el.height;
  const cx = W/2, cy = H-25, r = Math.min(W/2, H)-14, lw = 12;
  const s = getComputedStyle(document.body);
  const trackColor = s.getPropertyValue('--gauge-track').trim();
  const tickColor = s.getPropertyValue('--gauge-tick').trim();
  const labelColor = s.getPropertyValue('--gauge-label').trim();
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.arc(cx, cy, r, Math.PI, 0, false);
  c.strokeStyle = trackColor; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  const frac = Math.max(0, Math.min(1, (value-min)/(max-min)));
  c.beginPath(); c.arc(cx, cy, r, Math.PI, Math.PI + frac*Math.PI, false);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round';
  if (!isLight()) { c.shadowColor = color; c.shadowBlur = 10; }
  c.stroke(); c.shadowBlur = 0;
  c.strokeStyle = tickColor; c.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i/10)*Math.PI;
    c.beginPath();
    c.moveTo(cx+(r-lw/2-2)*Math.cos(a), cy+(r-lw/2-2)*Math.sin(a));
    c.lineTo(cx+(r+lw/2+2)*Math.cos(a), cy+(r+lw/2+2)*Math.sin(a));
    c.stroke();
  }
  c.fillStyle = labelColor; c.font = '13px JetBrains Mono';
  c.textAlign = 'left'; c.fillText(min, cx-r-2, cy+25);
  c.textAlign = 'right'; c.fillText(max, cx+r+8, cy+25);
}

/* ── Rolling data ── */
const flowData  = new Array(16).fill(0);
const powerData = new Array(16).fill(0);
const loadData  = new Array(16).fill(0);
let flowChart, dualChart;

/* ── Alerts ── */
function renderAlerts(alerts) {
  const el = document.querySelector('.hydro-alerts .alerts-list');
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
    const res = await fetch(`/api/alerts/${sel.value}?source=hydro`);
    if (handleAuthError(res)) return;
    const data = await res.json();
    renderAlerts(data.alerts || []);
  } catch (e) {}
}

/* ── Load chart history from server ── */
async function loadChartHistory() {
  try {
    const res = await fetch('/api/chart_history');
    if (handleAuthError(res)) return;
    const h = await res.json();
    if (h.hydro_power && h.hydro_power.length > 0) {
      const pad = (arr, n) => { const a = arr.slice(-n); while (a.length < n) a.unshift(0); return a; };
      const hp = pad(h.hydro_power, 16);
      const hl = pad(h.hydro_load, 16);
      const hf = pad(h.hydro_flow, 16);
      const ts = pad(h.timestamps, 16);
      for (let i = 0; i < 16; i++) {
        powerData[i] = hp[i];
        loadData[i] = hl[i];
        flowData[i] = hf[i];
        if (ts[i]) chartLabels[i] = ts[i];
      }
      if (dualChart) { dualChart.data.labels = chartLabels; dualChart.update('none'); }
      if (flowChart) { flowChart.data.labels = chartLabels; flowChart.update('none'); }
    }
  } catch (e) { console.warn('Chart history load failed'); }
}

/* ── Init ── */
function initHydroCharts() {
  const hc = getHydroColor();
  const gc = getComputedStyle(document.body).getPropertyValue('--gen').trim();
  const CHART_OPTS = getChartOpts();

  const flowCtx = document.getElementById('chart-flow-rate');
  if (flowCtx && !flowChart) {
    const c = flowCtx.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 130);
    g.addColorStop(0, hc + '48'); g.addColorStop(1, hc + '00');
    flowChart = new Chart(c, {
      type: 'line',
      data: { labels: chartLabels,
        datasets: [{ label: 'Flow Rate (m³/s)', data: flowData, borderColor: hc, borderWidth: 2,
          backgroundColor: g, fill: true, tension: 0.45, pointRadius: 0,
          pointHoverRadius: 4, pointHoverBackgroundColor: hc,
          pointHoverBorderColor: isLight() ? '#ffffff' : '#0a0a0a', pointHoverBorderWidth: 2 }] },
      options: { ...CHART_OPTS, scales: { ...CHART_OPTS.scales,
        y: { ...CHART_OPTS.scales.y, min: 0, max: 4 } } }
    });
  }

  const dualCtx = document.getElementById('chart-hydro-dual');
  if (dualCtx && !dualChart) {
    const c = dualCtx.getContext('2d');
    const gP = c.createLinearGradient(0, 0, 0, 220);
    gP.addColorStop(0, hc + '48'); gP.addColorStop(1, hc + '00');
    const gL = c.createLinearGradient(0, 0, 0, 220);
    gL.addColorStop(0, gc + '30'); gL.addColorStop(1, gc + '00');
    dualChart = new Chart(c, {
      type: 'line',
      data: { labels: chartLabels,
        datasets: [
          { label: 'Power Out (kW)', data: powerData, borderColor: hc, borderWidth: 2,
            backgroundColor: gP, fill: true, tension: 0.45, pointRadius: 0,
            pointHoverRadius: 4, pointHoverBackgroundColor: hc,
            pointHoverBorderColor: isLight() ? '#ffffff' : '#0a0a0a', pointHoverBorderWidth: 2 },
          { label: 'Load (kW)', data: loadData, borderColor: gc, borderWidth: 1.5,
            borderDash: [5, 3], backgroundColor: gL, fill: true, tension: 0.45,
            pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: gc,
            pointHoverBorderColor: isLight() ? '#ffffff' : '#0a0a0a', pointHoverBorderWidth: 2 }
        ] },
      options: CHART_OPTS
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initHydroCharts();

  const hc = getHydroColor();
  drawGauge(document.getElementById('gauge-pressure'), 0, 0, 500, hc);
  drawGauge(document.getElementById('gauge-voltage'), 0, 0, 440, hc);
  drawGauge(document.getElementById('gauge-current'), 0, 0, 300, hc);

  loadChartHistory();
  loadThresholds();
  loadAlertDates();
});

/* ── Poll ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/hydro');
    if (handleAuthError(res)) return;
    const d = await res.json();

    const hc = getHydroColor();
    drawGauge(document.getElementById('gauge-pressure'), d.pressure, 0, 500, hc);
    drawGauge(document.getElementById('gauge-voltage'), d.voltage, 0, 440, hc);
    drawGauge(document.getElementById('gauge-current'), d.current, 0, 300, hc);

    document.getElementById('pressure-val').textContent = Number(d.pressure).toFixed(1);
    document.getElementById('voltage-val').textContent = Number(d.voltage).toFixed(1);
    document.getElementById('current-val').textContent = Number(d.current).toFixed(1);

    // Generator status on hydro page
    const genDot = document.getElementById('hydro-gen-dot');
    const genTxt = document.getElementById('hydro-gen-text');
    if (d.gen_running) {
      if (genDot) genDot.className = 'gen-status-dot-hydro running';
      if (genTxt) genTxt.textContent = 'RUNNING';
    } else {
      if (genDot) genDot.className = 'gen-status-dot-hydro standby';
      if (genTxt) genTxt.textContent = 'STANDBY';
    }

    // Pump state
    const stateEl = document.getElementById('pump-state-val');
    const iconEl = document.querySelector('.pump-icon-wrap');
    const subEl = document.querySelector('.pump-state-sub');

    // Weather from Simulink ambient temp
    if (d.ambient_temp !== undefined) updateWeatherFromData(d.ambient_temp);
    if (d.pump_state) {
      if (stateEl) { stateEl.textContent = 'RUNNING'; stateEl.classList.remove('pump-state-off'); }
      if (iconEl) iconEl.className = 'pump-icon-wrap pump-on';
      if (subEl) subEl.textContent = `Turbine active · ${Number(d.flow_rate).toFixed(1)} m³/s`;
    } else {
      if (stateEl) { stateEl.textContent = 'STOPPED'; stateEl.classList.add('pump-state-off'); }
      if (iconEl) iconEl.className = 'pump-icon-wrap pump-off';
      if (subEl) subEl.textContent = 'Turbine offline';
    }

    // Rolling charts
    pollCount++;
    if (pollCount % 3 === 0) {
      flowData.shift(); flowData.push(d.flow_rate);
      powerData.shift(); powerData.push(d.power_out);
      loadData.shift(); loadData.push(d.load);
      if (flowChart) flowChart.update('none');
      if (dualChart) dualChart.update('none');
    }

    // Alerts
    const sel = document.getElementById('alert-date-select');
    const today = new Date().toISOString().slice(0, 10);
    if (!sel || sel.value === today) {
      checkAlertSound(d.alerts);
      renderAlerts(d.alerts || []);
    }
  } catch (e) { console.warn('Bridge not connected:', e.message); }
}, 2000);

/* ── Thresholds ── */
async function loadThresholds() {
  try {
    const res = await fetch('/api/thresholds/hydro');
    if (handleAuthError(res)) return;
    const t = await res.json();
    Object.keys(t).forEach(k => {
      const el = document.getElementById('thresh-' + k);
      if (el) el.value = t[k];
    });
  } catch (e) {}
}

async function saveThresholds() {
  const payload = {};
  document.querySelectorAll('.threshold-input').forEach(el => {
    payload[el.id.replace('thresh-', '')] = parseFloat(el.value) || 0;
  });
  try {
    const res = await fetch('/api/thresholds/hydro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (handleAuthError(res)) return;
    const btn = document.getElementById('thresh-save-btn');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save Thresholds', 1500); }
  } catch (e) {}
}