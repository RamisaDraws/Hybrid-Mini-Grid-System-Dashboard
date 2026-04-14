/* ════════════════════════════════════════════════
   solar.js
   Karazhar Minigrid — Solar PV Page (Live)
   ════════════════════════════════════════════════ */

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
    // Update ambient temp display
    const ambEl = document.getElementById('ambient-temp-val');
    if (ambEl) ambEl.textContent = `${ambientTemp}°C`;
    // Update ambient bar
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

function genTimeLabels() {
  const now = new Date();
  return Array.from({ length: 16 }, (_, i) => {
    const t = new Date(now - (15 - i) * 15 * 60 * 1000);
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  });
}

/* ── Gauge renderer ── */
function drawGauge(el, value, max, color) {
  const c = el.getContext('2d');
  const W = el.width, H = el.height;
  const cx = W / 2, cy = H - 4;
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
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.font = '9px JetBrains Mono';
  c.textAlign = 'left'; c.fillText('0', cx - r - 2, cy + 14);
  c.textAlign = 'right'; c.fillText(max, cx + r + 2, cy + 14);
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
        labels: genTimeLabels(),
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

  // Load thresholds
  loadThresholds();
});

/* ── Poll Flask every 2s ── */
let pollCount = 0;
setInterval(async () => {
  try {
    const res = await fetch('/api/solar');
    const d = await res.json();

    // Gauges
    drawGauge(document.getElementById('gauge-voltage'), d.voltage, 260, '#f5c842');
    drawGauge(document.getElementById('gauge-current'), d.current, 100, '#f5c842');

    // Gauge value labels
    const vEl = document.getElementById('voltage-val');
    const cEl = document.getElementById('current-val');
    if (vEl) vEl.textContent = d.voltage;
    if (cEl) cEl.textContent = d.current;

    // SOC
    const socEl = document.getElementById('soc-val');
    const socBar = document.getElementById('soc-bar');
    if (socEl) socEl.textContent = d.soc + '%';
    if (socBar) socBar.style.width = d.soc + '%';

    // Charging
    const chargeIcon = document.querySelector('.charging-icon');
    const chargeText = document.querySelector('.charging-status span:last-child');
    if (chargeIcon) chargeIcon.className = 'charging-icon ' + (d.charging ? 'charging-on' : 'charging-off');
    if (chargeText) chargeText.textContent = d.charging ? 'Charging' : 'Not Charging';

    // Temperatures (panel + module from Simulink)
    const panelEl = document.getElementById('panel-temp-val');
    const moduleEl = document.getElementById('module-temp-val');
    if (panelEl) panelEl.textContent = d.temp_panel + '°C';
    if (moduleEl) moduleEl.textContent = d.temp_module + '°C';

    // Panel temp bar
    const panelBar = document.getElementById('panel-temp-bar');
    if (panelBar) {
      const pct = Math.max(0, Math.min(100, ((d.temp_panel + 20) / 100) * 100));
      panelBar.style.height = pct + '%';
    }
    // Module temp bar
    const moduleBar = document.getElementById('module-temp-bar');
    if (moduleBar) {
      const pct = Math.max(0, Math.min(100, ((d.temp_module + 20) / 100) * 100));
      moduleBar.style.height = pct + '%';
    }

    // Rolling chart
    pollCount++;
    if (pollCount % 3 === 0) {
      powerData.shift(); powerData.push(d.power_out);
      loadData.shift(); loadData.push(d.load);
      if (solarChart) solarChart.update('none');
    }

    // Alerts
    renderAlerts(d.alerts || []);
  } catch (e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);

/* ── Threshold controls ── */
async function loadThresholds() {
  try {
    const res = await fetch('/api/thresholds/solar');
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
    await fetch('/api/thresholds/solar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const btn = document.getElementById('thresh-save-btn');
    if (btn) { btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = 'Save Thresholds', 1500); }
  } catch (e) { console.warn('Threshold save failed'); }
}