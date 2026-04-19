/* ════════════════════════════════════════════════
   hydro.js
   Karazhar Minigrid — In-Pipe Hydro Page (Live)
   ════════════════════════════════════════════════ */

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

/* ── Hamburger ── */
const hamburgerBtn = document.getElementById('hamburger-btn');
const mobileNav    = document.getElementById('mobile-nav');
hamburgerBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));
mobileNav.querySelectorAll('.nav-link').forEach(l =>
  l.addEventListener('click', () => mobileNav.classList.remove('open'))
);

/* ── Weather ── */
async function fetchWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.13&longitude=71.37&current_weather=true&timezone=Asia/Almaty';
    const res = await fetch(url);
    const data = await res.json();
    const el = document.getElementById('weather-temp');
    if (el) el.textContent = Math.round(data.current_weather.temperature) + '°C';
  } catch (e) {}
}
fetchWeather(); setInterval(fetchWeather, 600000);

/* ── Chart options ── */
const CHART_OPTS = {
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
      titleColor: '#888', bodyColor: '#e8e8e8',
      titleFont: { family: 'JetBrains Mono', size: 10 },
      bodyFont: { family: 'JetBrains Mono', size: 11 },
      padding: 8, displayColors: true,
      callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(2)}` }
    }
  },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
         ticks: { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 8 },
         border: { display: false } },
    y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
         ticks: { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 5 },
         border: { display: false } }
  }
};

const chartLabels = Array.from({ length: 16 }, () => '--:--');

/* ── Gauge ── */
function drawGauge(el, value, min, max, color) {
  const c = el.getContext('2d');
  const W = el.width, H = el.height;
  const cx = W/2, cy = H-25, r = Math.min(W/2, H)-14, lw = 12;
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.arc(cx, cy, r, Math.PI, 0, false);
  c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  const frac = Math.max(0, Math.min(1, (value-min)/(max-min)));
  c.beginPath(); c.arc(cx, cy, r, Math.PI, Math.PI + frac*Math.PI, false);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round';
  c.shadowColor = color; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;
  c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i/10)*Math.PI;
    c.beginPath();
    c.moveTo(cx+(r-lw/2-2)*Math.cos(a), cy+(r-lw/2-2)*Math.sin(a));
    c.lineTo(cx+(r+lw/2+2)*Math.cos(a), cy+(r+lw/2+2)*Math.sin(a));
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '11px JetBrains Mono';
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
  alerts.slice().reverse().forEach(a => {
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
document.addEventListener('DOMContentLoaded', () => {
  // Flow rate chart
  const flowCtx = document.getElementById('chart-flow-rate');
  if (flowCtx) {
    const c = flowCtx.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 130);
    g.addColorStop(0, 'rgba(62,207,207,0.28)'); g.addColorStop(1, 'rgba(62,207,207,0)');
    flowChart = new Chart(c, {
      type: 'line',
      data: { labels: chartLabels,
        datasets: [{ label: 'Flow Rate (m³/s)', data: flowData, borderColor: '#3ecfcf', borderWidth: 2,
          backgroundColor: g, fill: true, tension: 0.45, pointRadius: 0,
          pointHoverRadius: 4, pointHoverBackgroundColor: '#3ecfcf',
          pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2 }] },
      options: { ...CHART_OPTS, scales: { ...CHART_OPTS.scales,
        y: { ...CHART_OPTS.scales.y, min: 0.3, max: 0.8 } } }
    });
  }

  // Power vs Load chart
  const dualCtx = document.getElementById('chart-hydro-dual');
  if (dualCtx) {
    const c = dualCtx.getContext('2d');
    const gP = c.createLinearGradient(0, 0, 0, 220);
    gP.addColorStop(0, 'rgba(62,207,207,0.28)'); gP.addColorStop(1, 'rgba(62,207,207,0)');
    const gL = c.createLinearGradient(0, 0, 0, 220);
    gL.addColorStop(0, 'rgba(255,107,107,0.18)'); gL.addColorStop(1, 'rgba(255,107,107,0)');
    dualChart = new Chart(c, {
      type: 'line',
      data: { labels: chartLabels,
        datasets: [
          { label: 'Power Out (kW)', data: powerData, borderColor: '#3ecfcf', borderWidth: 2,
            backgroundColor: gP, fill: true, tension: 0.45, pointRadius: 0,
            pointHoverRadius: 4, pointHoverBackgroundColor: '#3ecfcf',
            pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2 },
          { label: 'Load (kW)', data: loadData, borderColor: '#ff6b6b', borderWidth: 1.5,
            borderDash: [5, 3], backgroundColor: gL, fill: true, tension: 0.45,
            pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#ff6b6b',
            pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2 }
        ] },
      options: CHART_OPTS
    });
  }

  drawGauge(document.getElementById('gauge-pressure'), 0, 0, 64, '#3ecfcf');
  drawGauge(document.getElementById('gauge-voltage'), 0, 0, 440, '#3ecfcf');
  drawGauge(document.getElementById('gauge-current'), 0, 0, 300, '#3ecfcf');

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

    drawGauge(document.getElementById('gauge-pressure'), d.pressure, 0, 64, '#3ecfcf');
    drawGauge(document.getElementById('gauge-voltage'), d.voltage, 0, 440, '#3ecfcf');
    drawGauge(document.getElementById('gauge-current'), d.current, 0, 300, '#3ecfcf');

    document.getElementById('pressure-val').textContent = Number(d.pressure).toFixed(1);
    document.getElementById('voltage-val').textContent = Number(d.voltage).toFixed(1);
    document.getElementById('current-val').textContent = Number(d.current).toFixed(1);

    // Pump state
    const stateEl = document.getElementById('pump-state-val');
    const iconEl = document.querySelector('.pump-icon-wrap');
    const subEl = document.querySelector('.pump-state-sub');
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