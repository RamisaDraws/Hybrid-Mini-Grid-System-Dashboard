/* ════════════════════════════════════════════════
   solar.js
   Karazhar Minigrid — Solar PV Page (Live)
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

/* ── Live clock (Karazhar = Asia/Almaty) ── */
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

/* ── Weather API (ambient temp) ── */
let ambientTemp = -4;
async function fetchWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=51.13&longitude=71.37&current_weather=true&timezone=Asia/Almaty';
    const res = await fetch(url);
    const data = await res.json();
    ambientTemp = Math.round(data.current_weather.temperature);
    const el = document.getElementById('weather-temp');
    if (el) el.textContent = `${ambientTemp}°C`;
    const ambEl = document.getElementById('ambient-temp-val');
    if (ambEl) ambEl.textContent = `${ambientTemp}°C`;
    const ambBar = document.getElementById('ambient-temp-bar');
    if (ambBar) {
      const pct = Math.max(0, Math.min(100, ((ambientTemp + 30) / 80) * 100));
      ambBar.style.height = pct + '%';
    }
  } catch (e) { console.warn('Weather fetch failed:', e.message); }
}
fetchWeather();
setInterval(fetchWeather, 600000);

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

/* ── Gauge renderer ── */
function drawGauge(el, value, max, color) {
  const c = el.getContext('2d');
  const W = el.width, H = el.height;
  const cx = W / 2, cy = H - 25;
  const r = Math.min(W / 2, H) - 14, lw = 12;
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.arc(cx, cy, r, Math.PI, 0, false);
  c.strokeStyle = 'rgba(255,255,255,0.06)'; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
  const frac = Math.max(0, Math.min(1, value / max));
  c.beginPath(); c.arc(cx, cy, r, Math.PI, Math.PI + frac * Math.PI, false);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round';
  c.shadowColor = color; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;
  c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    c.beginPath();
    c.moveTo(cx + (r - lw/2 - 2) * Math.cos(a), cy + (r - lw/2 - 2) * Math.sin(a));
    c.lineTo(cx + (r + lw/2 + 2) * Math.cos(a), cy + (r + lw/2 + 2) * Math.sin(a));
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '12px JetBrains Mono';
  c.textAlign = 'left'; c.fillText('0', cx - r - 2, cy + 25);
  c.textAlign = 'right'; c.fillText(max, cx + r + 10, cy + 25);
}

/* ── Chart data (rolling) ── */
const powerData = new Array(16).fill(0);
const loadData  = new Array(16).fill(0);
let solarChart;

/* ── Alerts ── */
function renderAlerts(alerts) {
  const el = document.querySelector('.solar-alerts .alerts-list');
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
    const res = await fetch(`/api/alerts/${sel.value}?source=solar`);
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
    if (h.solar_power && h.solar_power.length > 0) {
      const pad = (arr, n) => { const a = arr.slice(-n); while (a.length < n) a.unshift(0); return a; };
      const sp = pad(h.solar_power, 16);
      const sl = pad(h.solar_load, 16);
      const ts = pad(h.timestamps, 16);
      for (let i = 0; i < 16; i++) {
        powerData[i] = sp[i];
        loadData[i] = sl[i];
        if (ts[i]) chartLabels[i] = ts[i];
      }
      if (solarChart) {
        solarChart.data.labels = chartLabels;
        solarChart.update('none');
      }
    }
  } catch (e) { console.warn('Chart history load failed'); }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  const ctx = document.getElementById('chart-solar-dual');
  if (ctx) {
    const c = ctx.getContext('2d');
    const gP = c.createLinearGradient(0, 0, 0, 220);
    gP.addColorStop(0, 'rgba(245,200,66,0.28)'); gP.addColorStop(1, 'rgba(245,200,66,0)');
    const gL = c.createLinearGradient(0, 0, 0, 220);
    gL.addColorStop(0, 'rgba(255,107,107,0.18)'); gL.addColorStop(1, 'rgba(255,107,107,0)');

    solarChart = new Chart(c, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          { label: 'Power Out (kW)', data: powerData, borderColor: '#f5c842', borderWidth: 2,
            backgroundColor: gP, fill: true, tension: 0.45, pointRadius: 0,
            pointHoverRadius: 4, pointHoverBackgroundColor: '#f5c842',
            pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2 },
          { label: 'Load (kW)', data: loadData, borderColor: '#ff6b6b', borderWidth: 1.5,
            borderDash: [5, 3], backgroundColor: gL, fill: true, tension: 0.45,
            pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: '#ff6b6b',
            pointHoverBorderColor: '#0a0a0a', pointHoverBorderWidth: 2 }
        ]
      },
      options: CHART_OPTS
    });
  }

  drawGauge(document.getElementById('gauge-voltage'), 0, 260, '#f5c842');
  drawGauge(document.getElementById('gauge-current'), 0, 100, '#f5c842');

  loadChartHistory();
  loadThresholds();
  loadAlertDates();
});

/* ── Poll Flask every 2s ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/solar');
    if (handleAuthError(res)) return;
    const d = await res.json();

    drawGauge(document.getElementById('gauge-voltage'), d.voltage, 260, '#f5c842');
    drawGauge(document.getElementById('gauge-current'), d.current, 100, '#f5c842');
    const vEl = document.getElementById('voltage-val');
    const cEl = document.getElementById('current-val');
    if (vEl) vEl.textContent = Number(d.voltage).toFixed(1);
    if (cEl) cEl.textContent = Number(d.current).toFixed(1);

    // SOC
    const socEl = document.getElementById('soc-val');
    const socBar = document.getElementById('soc-bar');
    if (socEl) socEl.textContent = Number(d.soc).toFixed(1) + '%';
    if (socBar) socBar.style.width = d.soc + '%';

    // Charging
    const chargeIcon = document.querySelector('.charging-icon');
    const chargeText = document.querySelector('.charging-status span:last-child');
    if (chargeIcon) chargeIcon.className = 'charging-icon ' + (d.charging ? 'charging-on' : 'charging-off');
    if (chargeText) chargeText.textContent = d.charging ? 'Charging' : 'Not Charging';

    // Temps
    const panelEl = document.getElementById('panel-temp-val');
    const moduleEl = document.getElementById('module-temp-val');
    if (panelEl) panelEl.textContent = Number(d.temp_panel).toFixed(1) + '°C';
    if (moduleEl) moduleEl.textContent = Number(d.temp_module).toFixed(1) + '°C';

    const panelBar = document.getElementById('panel-temp-bar');
    if (panelBar) panelBar.style.height = Math.max(0, Math.min(100, ((d.temp_panel + 20) / 100) * 100)) + '%';
    const moduleBar = document.getElementById('module-temp-bar');
    if (moduleBar) moduleBar.style.height = Math.max(0, Math.min(100, ((d.temp_module + 20) / 100) * 100)) + '%';

    // Rolling chart
    pollCount++;
    if (pollCount % 3 === 0) {
      powerData.shift(); powerData.push(d.power_out);
      loadData.shift(); loadData.push(d.load);
      if (solarChart) solarChart.update('none');
    }

    // Alerts — only update if dropdown shows today
    const sel = document.getElementById('alert-date-select');
    const today = new Date().toISOString().slice(0, 10);
    if (!sel || sel.value === today) {
      checkAlertSound(d.alerts);
      renderAlerts(d.alerts || []);
    }
  } catch (e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);

/* ── Threshold controls ── */
async function loadThresholds() {
  try {
    const res = await fetch('/api/thresholds/solar');
    if (handleAuthError(res)) return;
    const t = await res.json();
    Object.keys(t).forEach(k => {
      const el = document.getElementById('thresh-' + k);
      if (el) el.value = t[k];
    });
  } catch (e) { console.warn('Threshold load failed'); }
}

async function saveThresholds() {
  const payload = {};
  document.querySelectorAll('.threshold-input').forEach(el => {
    const key = el.id.replace('thresh-', '');
    payload[key] = parseFloat(el.value) || 0;
  });
  try {
    const res = await fetch('/api/thresholds/solar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (handleAuthError(res)) return;
    const btn = document.getElementById('thresh-save-btn');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save Thresholds', 1500); }
  } catch (e) { console.warn('Threshold save failed'); }
}