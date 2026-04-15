/* ════════════════════════════════════════════════
   generator.js
   Karazhar Minigrid — Generator Page (Live)
   Bidirectional toggle + all gauges
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
      callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} kW` }
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
function drawGauge(el, value, min, max, color, isStandby) {
  if (!el) return;
  const c = el.getContext('2d');
  const W = el.width, H = el.height;
  const cx = W/2, cy = H-4, r = Math.min(W/2, H)-14, lw = 12;
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.arc(cx, cy, r, Math.PI, 0, false);
  c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  if (!isStandby) {
    const frac = Math.max(0, Math.min(1, (value-min)/(max-min)));
    c.beginPath(); c.arc(cx, cy, r, Math.PI, Math.PI+frac*Math.PI, false);
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round';
    c.shadowColor = color; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;
  }
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

/* ── Apply generator state to UI ── */
function applyState(d) {
  const running = d.running;
  const dot = document.getElementById('gen-status-dot');
  const txt = document.getElementById('gen-status-text');
  const btn = document.getElementById('gen-toggle-btn');
  const btnLabel = document.getElementById('gen-btn-label');

  if (running) {
    if (dot) dot.className = 'gen-status-dot running';
    if (txt) { txt.textContent = 'RUNNING'; txt.className = 'gen-status-text running-text'; }
    if (btn) btn.className = 'gen-toggle-btn active';
    if (btnLabel) btnLabel.textContent = 'Stop Generator';

    drawGauge(document.getElementById('gauge-gen-voltage'), d.voltage, 0, 260, '#ff6b6b');
    drawGauge(document.getElementById('gauge-gen-current'), d.current, 0, 300, '#ff6b6b');
    drawGauge(document.getElementById('gauge-rpm'), d.rpm, 0, 2000, '#ff6b6b');
    drawGauge(document.getElementById('gauge-freq'), d.frequency, 45, 55, '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-voltage'), d.bat_voltage, 0, 30, '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-current'), d.bat_current, 0, 50, '#ff6b6b');

    document.getElementById('gen-voltage-val').textContent = Number(d.voltage).toFixed(1);
    document.getElementById('gen-current-val').textContent = Number(d.current).toFixed(1);
    document.getElementById('rpm-val').textContent = Number(d.rpm).toFixed(0);
    document.getElementById('freq-val').textContent = Number(d.frequency).toFixed(1);
    document.getElementById('bat-voltage-val').textContent = Number(d.bat_voltage).toFixed(1);
    document.getElementById('bat-current-val').textContent = Number(d.bat_current).toFixed(1);

    setVBar('vbar-gen-temp', 'gen-temp-val', (d.gen_temp/200)*100, Number(d.gen_temp).toFixed(1));
    setVBar('vbar-coolant', 'coolant-val', (d.coolant_temp/200)*100, Number(d.coolant_temp).toFixed(1));

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

    ['gauge-gen-voltage','gauge-gen-current','gauge-rpm','gauge-freq'].forEach(id => {
      drawGauge(document.getElementById(id), 0, 0, 1, '#ff6b6b', true);
    });
    drawGauge(document.getElementById('gauge-bat-voltage'), d.bat_voltage, 0, 30, '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-current'), 0, 0, 50, '#ff6b6b', true);

    document.getElementById('gen-voltage-val').textContent = '0';
    document.getElementById('gen-current-val').textContent = '0';
    document.getElementById('rpm-val').textContent = '0';
    document.getElementById('freq-val').textContent = '0';
    document.getElementById('bat-voltage-val').textContent = Number(d.bat_voltage).toFixed(1);
    document.getElementById('bat-current-val').textContent = '0';

    setVBar('vbar-gen-temp', 'gen-temp-val', 0, '—');
    setVBar('vbar-coolant', 'coolant-val', 0, '—');

    // ATS → Grid
    document.getElementById('ats-grid-badge').className = 'ats-source-badge active';
    document.getElementById('ats-grid-badge').textContent = 'ACTIVE';
    document.getElementById('ats-gen-badge').className = 'ats-source-badge standby';
    document.getElementById('ats-gen-badge').textContent = 'STANDBY';
    document.querySelector('#ats-grid .ats-icon').className = 'ats-icon ats-icon-active';
    document.querySelector('#ats-gen-src .ats-icon').className = 'ats-icon ats-icon-standby';
  }

  // Always update fuel/water
  setVBar('vbar-fuel', 'fuel-val', d.fuel_pct, Number(d.fuel_pct).toFixed(1));
  setVBar('vbar-water', 'water-val', d.water_pct, Number(d.water_pct).toFixed(1));
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
    const res = await fetch(`/api/alerts/${sel.value}?source=generator`);
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
    if (h.gen_power && h.gen_power.length > 0) {
      const pad = (arr, n) => { const a = arr.slice(-n); while (a.length < n) a.unshift(0); return a; };
      const gp = pad(h.gen_power, 16);
      const gl = pad(h.gen_load, 16);
      const ts = pad(h.timestamps, 16);
      for (let i = 0; i < 16; i++) {
        powerOutData[i] = gp[i];
        loadDemandData[i] = gl[i];
        if (ts[i]) chartLabels[i] = ts[i];
      }
      if (dualChart) { dualChart.data.labels = chartLabels; dualChart.update('none'); }
    }
  } catch (e) { console.warn('Chart history load failed'); }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  // Toggle button → send to Flask
  document.getElementById('gen-toggle-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/gen_toggle', { method: 'POST' });
      if (handleAuthError(res)) return;
    } catch (e) { console.warn('Toggle failed:', e.message); }
  });

  // Dual chart
  const dualCtx = document.getElementById('chart-gen-dual');
  if (dualCtx) {
    const c = dualCtx.getContext('2d');
    const gP = c.createLinearGradient(0, 0, 0, 200);
    gP.addColorStop(0, 'rgba(255,107,107,0.25)'); gP.addColorStop(1, 'rgba(255,107,107,0)');
    const gL = c.createLinearGradient(0, 0, 0, 200);
    gL.addColorStop(0, 'rgba(136,136,136,0.15)'); gL.addColorStop(1, 'rgba(136,136,136,0)');

    dualChart = new Chart(c, {
      type: 'line',
      data: { labels: chartLabels,
        datasets: [
          { label: 'Power Out (kW)', data: powerOutData, borderColor: '#ff6b6b', borderWidth: 2,
            backgroundColor: gP, fill: true, tension: 0.4, pointRadius: 0,
            pointHoverRadius: 4, pointHoverBackgroundColor: '#ff6b6b',
            pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2 },
          { label: 'Load (kW)', data: loadDemandData, borderColor: '#888', borderWidth: 1.5,
            borderDash: [5, 3], backgroundColor: gL, fill: true, tension: 0.45,
            pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#888',
            pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2 }
        ] },
      options: CHART_OPTS
    });
  }

  // Init standby
  applyState({ running: 0, voltage: 0, current: 0, rpm: 0, frequency: 0,
    gen_temp: 0, coolant_temp: 0, fuel_pct: 72, water_pct: 55,
    bat_voltage: 24, bat_current: 0, power_out: 0, load: 35 });

  loadChartHistory();
  loadThresholds();
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
    const res = await fetch('/api/thresholds/generator');
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
    const res = await fetch('/api/thresholds/generator', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (handleAuthError(res)) return;
    const btn = document.getElementById('thresh-save-btn');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save Thresholds', 1500); }
  } catch (e) {}
}