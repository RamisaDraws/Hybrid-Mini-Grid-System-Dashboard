/* ════════════════════════════════════════════════
   hydro.js
   Karazhar Minigrid — In-Pipe Hydro Page (Live)
   ════════════════════════════════════════════════ */

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

function genTimeLabels(n, intervalMin) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(now - (n - 1 - i) * intervalMin * 60 * 1000);
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  });
}

/* ── Gauge ── */
function drawGauge(el, value, min, max, color) {
  const c = el.getContext('2d');
  const W = el.width, H = el.height;
  const cx = W/2, cy = H-4, r = Math.min(W/2, H)-14, lw = 12;
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
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.font = '9px JetBrains Mono';
  c.textAlign = 'left'; c.fillText(min, cx-r-2, cy+14);
  c.textAlign = 'right'; c.fillText(max, cx+r+2, cy+14);
}

/* ── Rolling data ── */
const flowData  = new Array(16).fill(0);
const powerData = new Array(16).fill(0);
const loadData  = new Array(16).fill(0);
let flowChart, dualChart;

function renderAlerts(alerts) {
  const el = document.querySelector('.hydro-alerts .alerts-list');
  if (!el) return;
  el.innerHTML = '';
  alerts.slice().reverse().forEach(a => {
    const lc = a.level === 'warn' ? 'alert-warn' : a.level === 'crit' ? 'alert-crit' : 'alert-info';
    const dc = a.level === 'warn' ? 'dot-yellow' : a.level === 'crit' ? 'dot-red' : 'dot-green';
    el.innerHTML += `<div class="alert-item ${lc}"><div class="alert-dot ${dc}"></div>
      <div class="alert-body"><span class="alert-msg">${a.msg}</span>
      <span class="alert-time">${a.time}</span></div></div>`;
  });
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
      data: { labels: genTimeLabels(16, 15),
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
      data: { labels: genTimeLabels(16, 15),
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

  drawGauge(document.getElementById('gauge-pressure'), 0, 26, 60, '#3ecfcf');
  drawGauge(document.getElementById('gauge-voltage'), 0, 0, 260, '#3ecfcf');
  drawGauge(document.getElementById('gauge-current'), 0, 0, 1500, '#3ecfcf');

  loadThresholds();
});

/* ── Poll ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/hydro');
    const d = await res.json();

    drawGauge(document.getElementById('gauge-pressure'), d.pressure, 26, 60, '#3ecfcf');
    drawGauge(document.getElementById('gauge-voltage'), d.voltage, 0, 260, '#3ecfcf');
    drawGauge(document.getElementById('gauge-current'), d.current, 0, 1500, '#3ecfcf');

    document.getElementById('pressure-val').textContent = d.pressure;
    document.getElementById('voltage-val').textContent = d.voltage;
    document.getElementById('current-val').textContent = d.current;

    // Pump state
    const stateEl = document.getElementById('pump-state-val');
    const iconEl = document.querySelector('.pump-icon-wrap');
    const subEl = document.querySelector('.pump-state-sub');
    if (d.pump_state) {
      if (stateEl) { stateEl.textContent = 'RUNNING'; stateEl.classList.remove('pump-state-off'); }
      if (iconEl) iconEl.className = 'pump-icon-wrap pump-on';
      if (subEl) subEl.textContent = `Turbine active · ${d.flow_rate} m³/s`;
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

    renderAlerts(d.alerts || []);
  } catch (e) { console.warn('Bridge not connected:', e.message); }
}, 2000);

/* ── Thresholds ── */
async function loadThresholds() {
  try {
    const res = await fetch('/api/thresholds/hydro');
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
    await fetch('/api/thresholds/hydro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const btn = document.getElementById('thresh-save-btn');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save Thresholds', 1500); }
  } catch (e) {}
}