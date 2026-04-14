/* ════════════════════════════════════════════════
   dashboard.js
   Karazhar Minigrid — System Monitor (Overview)
   Live data from Flask + Weather API
   ════════════════════════════════════════════════ */

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
setInterval(fetchWeather, 600000); // refresh every 10 min

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

/* ── Init charts ── */
document.addEventListener('DOMContentLoaded', () => {
  chartSolar = buildChart('chart-solar', solarData, '#f5c842', '#f5c842');
  chartHydro = buildChart('chart-hydro', hydroData, '#3ecfcf', '#3ecfcf');
  chartGen   = buildChart('chart-gen',   genData,   '#ff6b6b', '#ff6b6b');
});

/* ── Poll Flask every 2 seconds ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/data');
    const d = await res.json();

    // Solar row
    setStatVal('.solar-row .stat-item:nth-child(1) .stat-value', d.solar.voltage, 'V');
    setStatVal('.solar-row .stat-item:nth-child(2) .stat-value', d.solar.current, 'A');
    setStatVal('.solar-row .stat-item:nth-child(3) .stat-value', d.solar.power_out, 'kW');

    // Hydro row
    setStatVal('.hydro-row .stat-item:nth-child(1) .stat-value', d.hydro.voltage, 'V');
    setStatVal('.hydro-row .stat-item:nth-child(2) .stat-value', d.hydro.current, 'A');
    setStatVal('.hydro-row .stat-item:nth-child(3) .stat-value', d.hydro.power_out, 'kW');

    // Generator row
    const gv = d.gen.running ? d.gen.voltage : '—';
    const gc = d.gen.running ? d.gen.current : '—';
    const gp = d.gen.running ? d.gen.power_out : 0;
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

    // Alerts
    renderAlerts('.panel-alerts .alerts-list', d.alerts || []);

  } catch (e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);