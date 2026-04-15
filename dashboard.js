/* ════════════════════════════════════════════════
   dashboard.js
   Karazhar Minigrid — System Monitor (Overview)
   Live data from Flask + Weather API
   ════════════════════════════════════════════════ */

/* ── Auth guard ── */
function handleAuthError(res) {
  if (res.status === 401) { window.location.href = '/login.html'; return true; }
  return false;
}

/* ── Logout ── */
async function doLogout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  window.location.href = '/login.html';
}

/* ── Live clock (Karazhar local = UTC+5 Astana) ── */
function updateClock() {
  const now = new Date();
  const kz = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Almaty' }));
  const timeEl = document.getElementById('live-time');
  const dateEl = document.getElementById('live-date');
  if (!timeEl || !dateEl) return;
  const pad = n => String(n).padStart(2, '0');
  timeEl.textContent = `${pad(kz.getHours())}:${pad(kz.getMinutes())}:${pad(kz.getSeconds())}`;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dateEl.textContent = `${days[kz.getDay()]}, ${pad(kz.getDate())} ${months[kz.getMonth()]} ${kz.getFullYear()}`;
}
updateClock();
setInterval(updateClock, 1000);

/* ── Weather API (Open-Meteo — free, no key) ── */
async function fetchWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.13&longitude=71.37&current_weather=true&timezone=Asia/Almaty';
    const res = await fetch(url);
    const data = await res.json();
    const temp = Math.round(data.current_weather.temperature);
    const el = document.getElementById('weather-temp');
    if (el) el.textContent = `${temp}°C`;
  } catch (e) {
    console.warn('Weather fetch failed:', e.message);
  }
}
fetchWeather();
setInterval(fetchWeather, 600000);

/* ── Chart defaults ── */
const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
      titleColor: '#888', bodyColor: '#e8e8e8',
      titleFont: { family: 'JetBrains Mono', size: 10 },
      bodyFont: { family: 'JetBrains Mono', size: 11 },
      padding: 8, displayColors: false,
    }
  },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
         ticks: { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 6 },
         border: { display: false } },
    y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
         ticks: { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 4 },
         border: { display: false } }
  }
};

/* ── Time labels ── */
function genTimeLabels(n) {
  const labels = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(now - i * 30 * 60 * 1000);
    labels.push(`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`);
  }
  return labels;
}

const labels = genTimeLabels(12);

/* ── Chart data arrays (rolling) ── */
const solarData = new Array(12).fill(0);
const hydroData = new Array(12).fill(0);
const genData   = new Array(12).fill(0);

let chartSolar, chartHydro, chartGen;

function buildChart(id, data, color, fillColor) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 90);
  gradient.addColorStop(0, fillColor + '30');
  gradient.addColorStop(1, fillColor + '00');

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color, borderWidth: 1.5,
        backgroundColor: gradient, fill: true, tension: 0.45,
        pointRadius: 0, pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2,
      }]
    },
    options: { ...CHART_DEFAULTS,
      scales: { ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, min: id === 'chart-gen' ? -1 : undefined }
      }
    }
  });
}

/* ── Push new value into rolling chart ── */
function pushChart(chart, dataArr, val) {
  dataArr.shift();
  dataArr.push(val);
  if (chart) chart.update('none');
}

/* ── Update DOM helper ── */
function setStatVal(selector, val, unit) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = `${val} <span class="stat-unit">${unit}</span>`;
}

/* ── Render alerts ── */
function renderAlerts(containerSelector, alerts) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = '';
  if (!alerts || alerts.length === 0) {
    el.innerHTML = `<div class="alert-item alert-info">
      <div class="alert-dot dot-green"></div>
      <div class="alert-body">
        <span class="alert-msg">No alerts</span>
        <span class="alert-time">—</span>
      </div></div>`;
    return;
  }
  alerts.slice().reverse().forEach(a => {
    const levelClass = a.level === 'warn' ? 'alert-warn' : a.level === 'crit' ? 'alert-crit' : 'alert-info';
    const dotClass = a.level === 'warn' ? 'dot-yellow' : a.level === 'crit' ? 'dot-red' : 'dot-green';
    el.innerHTML += `
      <div class="alert-item ${levelClass}">
        <div class="alert-dot ${dotClass}"></div>
        <div class="alert-body">
          <span class="alert-msg">${a.msg}</span>
          <span class="alert-time">${a.time}</span>
        </div>
      </div>`;
  });
}

/* ── Alert date dropdown ── */
let currentAlertDate = 'today';

async function loadAlertDates() {
  try {
    const res = await fetch('/api/alerts/dates');
    if (handleAuthError(res)) return;
    const data = await res.json();
    const sel = document.getElementById('alert-date-select');
    if (!sel) return;
    sel.innerHTML = '';
    // "Today" option
    const today = new Date().toISOString().slice(0, 10);
    const todayOpt = document.createElement('option');
    todayOpt.value = today;
    todayOpt.textContent = 'Today';
    sel.appendChild(todayOpt);
    // Other dates
    (data.dates || []).forEach(d => {
      if (d === today) return; // skip today (already added)
      const opt = document.createElement('option');
      opt.value = d;
      // Format as DD/MM/YY
      const parts = d.split('-');
      opt.textContent = `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
      sel.appendChild(opt);
    });
  } catch (e) {}
}

async function onAlertDateChange() {
  const sel = document.getElementById('alert-date-select');
  if (!sel) return;
  const dateStr = sel.value;
  try {
    const res = await fetch(`/api/alerts/${dateStr}`);
    if (handleAuthError(res)) return;
    const data = await res.json();
    renderAlerts('.panel-alerts .alerts-list', data.alerts || []);
  } catch (e) {}
}

/* ── Load chart history from server (for tab-switch persistence) ── */
async function loadChartHistory() {
  try {
    const res = await fetch('/api/chart_history');
    if (handleAuthError(res)) return;
    const h = await res.json();
    if (h.overview_solar && h.overview_solar.length > 0) {
      // Pad arrays to 12 points
      const pad = (arr, n) => {
        const a = arr.slice(-n);
        while (a.length < n) a.unshift(0);
        return a;
      };
      const s = pad(h.overview_solar, 12);
      const hy = pad(h.overview_hydro, 12);
      const g = pad(h.overview_gen, 12);
      const ts = pad(h.timestamps, 12);
      for (let i = 0; i < 12; i++) {
        solarData[i] = s[i];
        hydroData[i] = hy[i];
        genData[i] = g[i];
        if (ts[i]) labels[i] = ts[i];
      }
      if (chartSolar) chartSolar.update('none');
      if (chartHydro) chartHydro.update('none');
      if (chartGen) chartGen.update('none');
    }
  } catch (e) { console.warn('Chart history load failed'); }
}

/* ── Init charts ── */
document.addEventListener('DOMContentLoaded', () => {
  chartSolar = buildChart('chart-solar', solarData, '#f5c842', '#f5c842');
  chartHydro = buildChart('chart-hydro', hydroData, '#3ecfcf', '#3ecfcf');
  chartGen   = buildChart('chart-gen',   genData,   '#ff6b6b', '#ff6b6b');

  // Load chart history from server
  loadChartHistory();

  // Load alert date dropdown
  loadAlertDates();
});

/* ── Poll Flask every 2 seconds ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/data');
    if (handleAuthError(res)) return;
    const d = await res.json();

    // Solar row
    setStatVal('.solar-row .stat-item:nth-child(1) .stat-value', Number(d.solar.voltage).toFixed(1), 'V');
    setStatVal('.solar-row .stat-item:nth-child(2) .stat-value', Number(d.solar.current).toFixed(1), 'A');
    setStatVal('.solar-row .stat-item:nth-child(3) .stat-value', Number(d.solar.power_out).toFixed(1), 'kW');

    // Hydro row
    setStatVal('.hydro-row .stat-item:nth-child(1) .stat-value', Number(d.hydro.voltage).toFixed(1), 'V');
    setStatVal('.hydro-row .stat-item:nth-child(2) .stat-value', Number(d.hydro.current).toFixed(1), 'A');
    setStatVal('.hydro-row .stat-item:nth-child(3) .stat-value', Number(d.hydro.power_out).toFixed(1), 'kW');

    // Generator row
    const gv = d.gen.running ? Number(d.gen.voltage).toFixed(1) : '—';
    const gc = d.gen.running ? Number(d.gen.current).toFixed(1) : '—';
    const gp = d.gen.running ? Number(d.gen.power_out).toFixed(1) : '0.0';
    setStatVal('.gen-row .stat-item:nth-child(1) .stat-value', gv, 'V');
    setStatVal('.gen-row .stat-item:nth-child(2) .stat-value', gc, 'A');
    setStatVal('.gen-row .stat-item:nth-child(3) .stat-value', gp, 'kW');

    // Generator status badge
    const genBadge = document.querySelector('.gen-row .status-badge');
    if (genBadge) {
      if (d.gen.running) {
        genBadge.className = 'status-badge status-online';
        genBadge.textContent = 'Running';
      } else {
        genBadge.className = 'status-badge status-standby';
        genBadge.textContent = 'Standby';
      }
    }

    // Push to rolling charts every 6th poll (~12s)
    pollCount++;
    if (pollCount % 6 === 0) {
      pushChart(chartSolar, solarData, d.solar.power_out);
      pushChart(chartHydro, hydroData, d.hydro.power_out);
      pushChart(chartGen,   genData,   d.gen.power_out);
    }

    // Alerts — only update if dropdown shows today
    const sel = document.getElementById('alert-date-select');
    const today = new Date().toISOString().slice(0, 10);
    if (!sel || sel.value === today) {
      renderAlerts('.panel-alerts .alerts-list', d.alerts || []);
    }

  } catch (e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);