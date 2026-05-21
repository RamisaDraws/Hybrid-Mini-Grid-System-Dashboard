/* ════════════════════════════════════════════════
   dashboard.js
   Karazhar Minigrid — System Monitor (Overview)
   Live data from Flask
   ════════════════════════════════════════════════ */

/* ── Theme toggle ── */
function getTheme() { return localStorage.getItem('karazhar-theme') || 'dark'; }
function applyTheme(theme) {
  if (theme === 'light') document.body.classList.add('light');
  else document.body.classList.remove('light');
  localStorage.setItem('karazhar-theme', theme);
  const iframe = document.getElementById('map-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'themeChange', theme: theme }, '*');
  }
}
function toggleTheme() {
  const current = getTheme();
  applyTheme(current === 'dark' ? 'light' : 'dark');
  if (chartSolar) { chartSolar.destroy(); chartSolar = buildChart('chart-solar', solarData, getChartColor('solar'), getChartColor('solar')); }
  if (chartHydro) { chartHydro.destroy(); chartHydro = buildChart('chart-hydro', hydroData, getChartColor('hydro'), getChartColor('hydro')); }
  if (chartPgen)  { chartPgen.destroy();  chartPgen  = buildChart('chart-pgen',  pgenData,  getChartColor('pgen'),  getChartColor('pgen'));  }
  if (chartGen)   { chartGen.destroy();   chartGen   = buildChart('chart-gen',   genData,   getChartColor('gen'),   getChartColor('gen'));   }
}
function getChartColor(type) {
  const style = getComputedStyle(document.body);
  if (type === 'solar') return style.getPropertyValue('--solar').trim();
  if (type === 'hydro') return style.getPropertyValue('--hydro').trim();
  if (type === 'pgen')  return style.getPropertyValue('--pgen').trim();
  if (type === 'gen')   return style.getPropertyValue('--gen').trim();
  return '#888';
}
function isLight() { return document.body.classList.contains('light'); }
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

/* ── Live clock ── */
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
const solarData = new Array(12).fill(0);
const hydroData = new Array(12).fill(0);
const pgenData  = new Array(12).fill(0);
const genData   = new Array(12).fill(0);

let chartSolar, chartHydro, chartPgen, chartGen;

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
        data, borderColor: color, borderWidth: 1.5,
        backgroundColor: gradient, fill: true, tension: 0.45,
        pointRadius: 0, pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: isLight() ? '#ffffff' : '#0a0a0a', pointHoverBorderWidth: 2,
      }]
    },
    options: { ...CHART_DEFAULTS,
      scales: { ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, min: (id === 'chart-gen' || id === 'chart-pgen') ? -1 : undefined }
      }
    }
  });
}

function pushChart(chart, dataArr, val) {
  dataArr.shift(); dataArr.push(val);
  if (chart) chart.update('none');
}

function setStatVal(selector, val, unit) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.innerHTML = `${val} <span class="stat-unit">${unit}</span>`;
}

function renderAlerts(containerSelector, alerts) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = '';
  if (!alerts || alerts.length === 0) {
    el.innerHTML = `<div class="alert-item alert-info">
      <div class="alert-dot dot-green"></div>
      <div class="alert-body"><span class="alert-msg">No alerts</span>
        <span class="alert-time">—</span></div></div>`;
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
        </div></div>`;
  });
}

/* ── Alert date dropdowns ── */
async function loadAlertDates() {
  try {
    const res = await fetch('/api/alerts/dates');
    if (handleAuthError(res)) return;
    const data = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    ['solar', 'hydro', 'pgen', 'gen'].forEach(src => {
      const sel = document.getElementById('alert-date-' + src);
      if (!sel) return;
      sel.innerHTML = '';
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
    });
  } catch (e) {}
}

async function onAlertDateChange(source) {
  const selId = source === 'generator' ? 'alert-date-gen' : 'alert-date-' + source;
  const listId = source === 'generator' ? 'alerts-list-gen' : 'alerts-list-' + source;
  const sel = document.getElementById(selId);
  if (!sel) return;
  try {
    const res = await fetch(`/api/alerts/${sel.value}?source=${source}`);
    if (handleAuthError(res)) return;
    const data = await res.json();
    renderAlerts('#' + listId, data.alerts || []);
  } catch (e) {}
}

/* ── Load chart history ── */
async function loadChartHistory() {
  try {
    const res = await fetch('/api/chart_history');
    if (handleAuthError(res)) return;
    const h = await res.json();
    if (h.overview_solar && h.overview_solar.length > 0) {
      const pad = (arr, n) => { const a = arr.slice(-n); while (a.length < n) a.unshift(0); return a; };
      const s = pad(h.overview_solar, 12);
      const hy = pad(h.overview_hydro, 12);
      const pg = pad(h.overview_pgen || [], 12);
      const g = pad(h.overview_gen, 12);
      const ts = pad(h.timestamps, 12);
      for (let i = 0; i < 12; i++) {
        solarData[i] = s[i]; hydroData[i] = hy[i];
        pgenData[i] = pg[i]; genData[i] = g[i];
        if (ts[i]) labels[i] = ts[i];
      }
      if (chartSolar) chartSolar.update('none');
      if (chartHydro) chartHydro.update('none');
      if (chartPgen) chartPgen.update('none');
      if (chartGen) chartGen.update('none');
    }
  } catch (e) { console.warn('Chart history load failed'); }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  chartSolar = buildChart('chart-solar', solarData, getChartColor('solar'), getChartColor('solar'));
  chartHydro = buildChart('chart-hydro', hydroData, getChartColor('hydro'), getChartColor('hydro'));
  chartPgen  = buildChart('chart-pgen',  pgenData,  getChartColor('pgen'),  getChartColor('pgen'));
  chartGen   = buildChart('chart-gen',   genData,   getChartColor('gen'),   getChartColor('gen'));
  loadChartHistory();
  loadAlertDates();
});

/* ── Poll Flask every 2s ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/data');
    if (handleAuthError(res)) return;
    const d = await res.json();

    // Solar row
    setStatVal('.solar-row .stat-item:nth-child(1) .stat-value', Number(d.solar.voltage).toFixed(1), 'V');
    setStatVal('.solar-row .stat-item:nth-child(2) .stat-value', Number(d.solar.irradiance).toFixed(0), 'W/m²');
    setStatVal('.solar-row .stat-item:nth-child(3) .stat-value', Number(d.solar.power_out).toFixed(1), 'W');

    // Hydro row
    setStatVal('.hydro-row .stat-item:nth-child(1) .stat-value', Number(d.hydro.voltage).toFixed(1), 'V');
    setStatVal('.hydro-row .stat-item:nth-child(2) .stat-value', Number(d.hydro.current).toFixed(1), 'A');
    setStatVal('.hydro-row .stat-item:nth-child(3) .stat-value', Number(d.hydro.power_out).toFixed(1), 'kW');

    // Pump gen row
    const pgv = d.pgen.running ? Number(d.pgen.voltage).toFixed(1) : '—';
    const pgc = d.pgen.running ? Number(d.pgen.current).toFixed(1) : '—';
    const pgp = d.pgen.running ? Number(d.pgen.power_out).toFixed(1) : '0.0';
    setStatVal('.pgen-row .stat-item:nth-child(1) .stat-value', pgv, 'V');
    setStatVal('.pgen-row .stat-item:nth-child(2) .stat-value', pgc, 'A');
    setStatVal('.pgen-row .stat-item:nth-child(3) .stat-value', pgp, 'kW');
    const pgenBadge = document.querySelector('.pgen-row .status-badge');
    if (pgenBadge) {
      if (d.pgen.running) { pgenBadge.className = 'status-badge status-online'; pgenBadge.textContent = 'Running'; }
      else { pgenBadge.className = 'status-badge status-standby'; pgenBadge.textContent = 'Standby'; }
    }

    // Main gen row
    const gv = d.gen.running ? Number(d.gen.voltage).toFixed(1) : '—';
    const gc = d.gen.running ? Number(d.gen.current).toFixed(1) : '—';
    const gp = d.gen.running ? Number(d.gen.power_out).toFixed(1) : '0.0';
    setStatVal('.gen-row .stat-item:nth-child(1) .stat-value', gv, 'V');
    setStatVal('.gen-row .stat-item:nth-child(2) .stat-value', gc, 'A');
    setStatVal('.gen-row .stat-item:nth-child(3) .stat-value', gp, 'kW');
    const genBadge = document.querySelector('.gen-row .status-badge');
    if (genBadge) {
      if (d.gen.running) { genBadge.className = 'status-badge status-online'; genBadge.textContent = 'Running'; }
      else { genBadge.className = 'status-badge status-standby'; genBadge.textContent = 'Standby'; }
    }

    // Charts
    pollCount++;
    if (pollCount % 6 === 0) {
      pushChart(chartSolar, solarData, d.solar.power_out);
      pushChart(chartHydro, hydroData, d.hydro.power_out);
      pushChart(chartPgen,  pgenData,  d.pgen.power_out);
      pushChart(chartGen,   genData,   d.gen.power_out);
    }

    // Alerts — 4 panels
    const today = new Date().toISOString().slice(0, 10);
    const allAlerts = d.alerts || [];
    const solarAlerts = allAlerts.filter(a => a.source === 'solar');
    const hydroAlerts = allAlerts.filter(a => a.source === 'hydro');
    const pgenAlerts  = allAlerts.filter(a => a.source === 'pgen');
    const genAlerts   = allAlerts.filter(a => a.source === 'generator');

    const selSolar = document.getElementById('alert-date-solar');
    if (!selSolar || selSolar.value === today) renderAlerts('#alerts-list-solar', solarAlerts);
    const selHydro = document.getElementById('alert-date-hydro');
    if (!selHydro || selHydro.value === today) renderAlerts('#alerts-list-hydro', hydroAlerts);
    const selPgen = document.getElementById('alert-date-pgen');
    if (!selPgen || selPgen.value === today) renderAlerts('#alerts-list-pgen', pgenAlerts);
    const selGen = document.getElementById('alert-date-gen');
    if (!selGen || selGen.value === today) renderAlerts('#alerts-list-gen', genAlerts);

    checkAlertSound(allAlerts);
  } catch (e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);