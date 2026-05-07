/* ════════════════════════════════════════════════
   dashboard.js
   Karazhar Minigrid — System Monitor (Overview)
   Live data from Flask + Weather API
   ════════════════════════════════════════════════ */

/* ── Theme toggle ── */
function getTheme() {
  return localStorage.getItem('karazhar-theme') || 'dark';
}
function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light');
  } else {
    document.body.classList.remove('light');
  }
  localStorage.setItem('karazhar-theme', theme);
  // Notify iframe (village map) of theme change
  const iframe = document.getElementById('map-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'themeChange', theme: theme }, '*');
  }
}
function toggleTheme() {
  const current = getTheme();
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Rebuild charts with new colors
  if (chartSolar) { chartSolar.destroy(); chartSolar = buildChart('chart-solar', solarData, getChartColor('solar'), getChartColor('solar')); }
  if (chartHydro) { chartHydro.destroy(); chartHydro = buildChart('chart-hydro', hydroData, getChartColor('hydro'), getChartColor('hydro')); }
  if (chartGen)   { chartGen.destroy();   chartGen   = buildChart('chart-gen',   genData,   getChartColor('gen'),   getChartColor('gen'));   }
}
// Helper: get computed color from CSS variable
function getChartColor(type) {
  const style = getComputedStyle(document.body);
  if (type === 'solar') return style.getPropertyValue('--solar').trim();
  if (type === 'hydro') return style.getPropertyValue('--hydro').trim();
  if (type === 'gen')   return style.getPropertyValue('--gen').trim();
  return '#888';
}
function isLight() { return document.body.classList.contains('light'); }

// Apply saved theme on load
applyTheme(getTheme());

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

/* ── Weather (from Simulink ambient temp, updated via poll) ── */
function updateWeatherFromData(ambientTemp) {
  const el = document.getElementById('weather-temp');
  if (el) el.textContent = Number(ambientTemp).toFixed(1) + '°C';
}

/* ── Chart defaults ── */
function getChartDefaults() {
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
        padding: 8, displayColors: false,
      }
    },
    scales: {
      x: { grid: { color: s.getPropertyValue('--chart-grid').trim(), drawBorder: false },
           ticks: { color: s.getPropertyValue('--chart-tick').trim(), font: { family: 'JetBrains Mono', size: 11 }, maxTicksLimit: 6 },
           border: { display: false } },
      y: { grid: { color: s.getPropertyValue('--chart-grid').trim(), drawBorder: false },
           ticks: { color: s.getPropertyValue('--chart-tick').trim(), font: { family: 'JetBrains Mono', size: 11 }, maxTicksLimit: 4 },
           border: { display: false } }
    }
  };
}

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
  const CHART_DEFAULTS = getChartDefaults();

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
        pointHoverBorderColor: isLight() ? '#ffffff' : '#0a0a0a', pointHoverBorderWidth: 2,
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

/* ── Render alerts into a specific container ── */
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
  alerts.slice(-10).reverse().forEach(a => {
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

/* ── Alert date dropdowns (one per source) ── */
async function loadAlertDates() {
  try {
    const res = await fetch('/api/alerts/dates');
    if (handleAuthError(res)) return;
    const data = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    ['solar', 'hydro', 'gen'].forEach(src => {
      const sel = document.getElementById('alert-date-' + src);
      if (!sel) return;
      sel.innerHTML = '';
      const todayOpt = document.createElement('option');
      todayOpt.value = today;
      todayOpt.textContent = 'Today';
      sel.appendChild(todayOpt);
      (data.dates || []).forEach(d => {
        if (d === today) return;
        const opt = document.createElement('option');
        opt.value = d;
        const parts = d.split('-');
        opt.textContent = `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
        sel.appendChild(opt);
      });
    });
  } catch (e) {}
}

async function onAlertDateChange(source) {
  const selId = source === 'generator' ? 'alert-date-gen' : 'alert-date-' + source;
  const listId = source === 'generator' ? 'alerts-list-gen' : 'alerts-list-' + source;
  const sel = document.getElementById(selId);
  if (!sel) return;
  const dateStr = sel.value;
  try {
    const res = await fetch(`/api/alerts/${dateStr}?source=${source}`);
    if (handleAuthError(res)) return;
    const data = await res.json();
    renderAlerts('#' + listId, data.alerts || []);
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
  const sc = getChartColor('solar');
  const hc = getChartColor('hydro');
  const gc = getChartColor('gen');
  chartSolar = buildChart('chart-solar', solarData, sc, sc);
  chartHydro = buildChart('chart-hydro', hydroData, hc, hc);
  chartGen   = buildChart('chart-gen',   genData,   gc, gc);

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

    // Weather from Simulink ambient temp
    if (d.ambient_temp !== undefined) updateWeatherFromData(d.ambient_temp);

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

    // Alerts — split by source into 3 panels, only update if dropdown shows today
    const today = new Date().toISOString().slice(0, 10);
    const allAlerts = d.alerts || [];

    const solarAlerts = allAlerts.filter(a => a.source === 'solar');
    const hydroAlerts = allAlerts.filter(a => a.source === 'hydro');
    const genAlerts = allAlerts.filter(a => a.source === 'generator');

    const selSolar = document.getElementById('alert-date-solar');
    if (!selSolar || selSolar.value === today) {
      renderAlerts('#alerts-list-solar', solarAlerts);
    }
    const selHydro = document.getElementById('alert-date-hydro');
    if (!selHydro || selHydro.value === today) {
      renderAlerts('#alerts-list-hydro', hydroAlerts);
    }
    const selGen = document.getElementById('alert-date-gen');
    if (!selGen || selGen.value === today) {
      renderAlerts('#alerts-list-gen', genAlerts);
    }

    checkAlertSound(allAlerts);

  } catch (e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);