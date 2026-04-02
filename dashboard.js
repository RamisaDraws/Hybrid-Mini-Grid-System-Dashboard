/* ════════════════════════════════════════════════
   dashboard.js
   Karazhar Minigrid — System Monitor
   ════════════════════════════════════════════════ */

/* ── Live clock ── */
function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('live-time');
  const dateEl = document.getElementById('live-date');
  if (!timeEl || !dateEl) return;

  const pad = n => String(n).padStart(2, '0');
  timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dateEl.textContent = `${days[now.getDay()]}, ${pad(now.getDate())} ${months[now.getMonth()]} ${now.getFullYear()}`;
}
updateClock();
setInterval(updateClock, 1000);

/* ── Chart defaults ── */
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1f1f1f',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleColor: '#888',
      bodyColor: '#e8e8e8',
      titleFont: { family: 'JetBrains Mono', size: 10 },
      bodyFont:  { family: 'JetBrains Mono', size: 11 },
      padding: 8,
      displayColors: false,
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
      ticks: { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 6 },
      border: { display: false }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
      ticks: { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 4 },
      border: { display: false }
    }
  }
};

/* ── Placeholder time labels (last 12 ticks, every 30 min) ── */
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

/* ── Static placeholder data ── */
const solarData  = [4.2, 6.8, 10.1, 13.4, 16.2, 18.0, 19.5, 20.1, 19.8, 18.4, 16.0, 14.2];
const hydroData  = [248, 250, 251, 249, 250, 252, 250, 249, 251, 250, 248, 250];
const genData    = [0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0];

/* ── Helper: gradient fill ── */
function makeGradient(ctx, colorStr, alpha1 = 0.25, alpha2 = 0) {
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 90);
  gradient.addColorStop(0, colorStr.replace(')', `, ${alpha1})`).replace('rgb(', 'rgba('));
  gradient.addColorStop(1, colorStr.replace(')', `, ${alpha2})`).replace('rgb(', 'rgba('));
  return gradient;
}

/* ── Build chart ── */
function buildChart(id, data, color, fillColor) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 90);
  gradient.addColorStop(0, fillColor + '30');
  gradient.addColorStop(1, fillColor + '00');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 1.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.45,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: '#0a0a0a',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          min: id === 'chart-gen' ? -1 : undefined,
        }
      }
    }
  });
}

/* ── Init charts once Chart.js is ready ── */
document.addEventListener('DOMContentLoaded', () => {
  buildChart('chart-solar', solarData,  '#f5c842', '#f5c842');
  buildChart('chart-hydro', hydroData,  '#3ecfcf', '#3ecfcf');
  buildChart('chart-gen',   genData,    '#ff6b6b', '#ff6b6b');
});

/* ════════════════════════════════════════════════
   SIMULINK INTEGRATION STUB
   When Flask bridge is running, uncomment the
   polling loop below. Replace /api/data with
   your actual Flask endpoint.

   Expected JSON shape from Flask:
   {
     "solar":  { "voltage": 220, "current": 91,   "power": 20.0 },
     "hydro":  { "voltage": 220, "current": 1136, "power": 250  },
     "gen":    { "voltage": 0,   "current": 0,    "power": 0,   "status": "standby" },
     "alerts": [ { "msg": "...", "time": "09:42:10", "level": "info" } ]
   }

function updateFromSimulink(data) {
  // Update stat values
  const setVal = (selector, val) => {
    const el = document.querySelector(selector);
    if (el) el.childNodes[0].textContent = val + ' ';
  };
  // ... map data to DOM here
}

setInterval(async () => {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    updateFromSimulink(data);
  } catch(e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);
════════════════════════════════════════════════ */