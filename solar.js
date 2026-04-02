/* ════════════════════════════════════════════════
   solar.js
   Karazhar Minigrid — Solar PV Page
   ════════════════════════════════════════════════ */

/* ── Live clock ── */
(function () {
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const now = new Date();
    const t = document.getElementById('live-time');
    const d = document.getElementById('live-date');
    if (t) t.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    if (d) {
      const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      d.textContent = `${D[now.getDay()]}, ${pad(now.getDate())} ${M[now.getMonth()]} ${now.getFullYear()}`;
    }
  }
  tick();
  setInterval(tick, 1000);
})();

/* ── Hamburger toggle ── */
const hamburgerBtn = document.getElementById('hamburger-btn');
const mobileNav    = document.getElementById('mobile-nav');
hamburgerBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));
mobileNav.querySelectorAll('.nav-link').forEach(l =>
  l.addEventListener('click', () => mobileNav.classList.remove('open'))
);

/* ── Shared Chart.js options ── */
const CHART_OPTS = {
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
      displayColors: true,
      callbacks: {
        label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} kW`
      }
    }
  },
  scales: {
    x: {
      grid:   { color: 'rgba(255,255,255,0.04)', drawBorder: false },
      ticks:  { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 8 },
      border: { display: false }
    },
    y: {
      grid:   { color: 'rgba(255,255,255,0.04)', drawBorder: false },
      ticks:  { color: '#444', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 5 },
      border: { display: false }
    }
  }
};

/* ── Generate time labels (16 points × 15 min) ── */
function genTimeLabels() {
  const now = new Date();
  return Array.from({ length: 16 }, (_, i) => {
    const t = new Date(now - (15 - i) * 15 * 60 * 1000);
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  });
}

/* ── Semicircle gauge renderer ──
   Draws a half-arc gauge on a <canvas> element.
   Params: el (canvas), value (number), max (number), color (CSS string)
── */
function drawGauge(el, value, max, color) {
  const c  = el.getContext('2d');
  const W  = el.width;
  const H  = el.height;
  const cx = W / 2;
  const cy = H - 4;
  const r  = Math.min(W / 2, H) - 14;
  const lw = 12;

  c.clearRect(0, 0, W, H);

  /* Background track */
  c.beginPath();
  c.arc(cx, cy, r, Math.PI, 0, false);
  c.strokeStyle = 'rgba(255,255,255,0.06)';
  c.lineWidth   = lw;
  c.lineCap     = 'round';
  c.stroke();

  /* Filled arc */
  const fillEnd = Math.PI + (value / max) * Math.PI;
  c.beginPath();
  c.arc(cx, cy, r, Math.PI, fillEnd, false);
  c.strokeStyle = color;
  c.lineWidth   = lw;
  c.lineCap     = 'round';
  c.shadowColor = color;
  c.shadowBlur  = 10;
  c.stroke();
  c.shadowBlur  = 0;

  /* Tick marks */
  c.strokeStyle = 'rgba(255,255,255,0.1)';
  c.lineWidth   = 1;
  for (let i = 0; i <= 10; i++) {
    const a  = Math.PI + (i / 10) * Math.PI;
    const x1 = cx + (r - lw / 2 - 2) * Math.cos(a);
    const y1 = cy + (r - lw / 2 - 2) * Math.sin(a);
    const x2 = cx + (r + lw / 2 + 2) * Math.cos(a);
    const y2 = cy + (r + lw / 2 + 2) * Math.sin(a);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  /* Min / max labels */
  c.fillStyle  = 'rgba(255,255,255,0.18)';
  c.font       = '9px JetBrains Mono';
  c.textAlign  = 'left';
  c.fillText('0', cx - r - 2, cy + 14);
  c.textAlign  = 'right';
  c.fillText(max, cx + r + 2, cy + 14);
}

/* ── Init on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => {

  /* Dual-line chart */
  const ctx = document.getElementById('chart-solar-dual').getContext('2d');

  const gP = ctx.createLinearGradient(0, 0, 0, 220);
  gP.addColorStop(0, 'rgba(245,200,66,0.28)');
  gP.addColorStop(1, 'rgba(245,200,66,0)');

  const gL = ctx.createLinearGradient(0, 0, 0, 220);
  gL.addColorStop(0, 'rgba(255,107,107,0.18)');
  gL.addColorStop(1, 'rgba(255,107,107,0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: genTimeLabels(),
      datasets: [
        {
          label: 'Power Out (kW)',
          data: [14.2, 16.0, 18.4, 19.8, 20.1, 19.5, 18.0, 16.2, 13.4, 10.1, 6.8, 4.2, 8.5, 14.8, 18.2, 20.0],
          borderColor: '#f5c842',
          borderWidth: 2,
          backgroundColor: gP,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#f5c842',
          pointHoverBorderColor: '#0a0a0a',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Load (kW)',
          data: [12.0, 13.5, 15.0, 16.8, 17.2, 16.5, 15.8, 14.0, 12.5, 11.0, 9.5, 8.0, 9.2, 12.0, 15.5, 17.8],
          borderColor: '#ff6b6b',
          borderWidth: 1.5,
          borderDash: [5, 3],
          backgroundColor: gL,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#ff6b6b',
          pointHoverBorderColor: '#0a0a0a',
          pointHoverBorderWidth: 2,
        }
      ]
    },
    options: CHART_OPTS
  });

  /* Gauges */
  drawGauge(document.getElementById('gauge-voltage'), 220, 260, '#f5c842');
  drawGauge(document.getElementById('gauge-current'),  91, 100, '#f5c842');

});

/* ════════════════════════════════════════════════
   SIMULINK INTEGRATION STUB
   When Flask bridge is running, uncomment below.
   Expected JSON from /api/solar:
   {
     "voltage": 220, "current": 91, "power": 20.0,
     "soc": 67, "charging": true,
     "temp_ambient": -4, "temp_panel": 42, "temp_module": 48,
     "alerts": [ { "msg": "...", "time": "09:42:10", "level": "info" } ]
   }

function updateFromFlask(data) {
  document.getElementById('voltage-val').childNodes[0].textContent = data.voltage + ' ';
  document.getElementById('current-val').childNodes[0].textContent = data.current + ' ';
  document.getElementById('soc-val').textContent = data.soc + '%';
  document.getElementById('soc-bar').style.width = data.soc + '%';

  const chargeEl = document.getElementById('charging-status');
  chargeEl.querySelector('span').textContent = data.charging ? 'Charging' : 'Not Charging';
  chargeEl.querySelector('.charging-icon').className =
    'charging-icon ' + (data.charging ? 'charging-on' : 'charging-off');

  document.getElementById('panel-temp-val').textContent = data.temp_panel + '°C';

  drawGauge(document.getElementById('gauge-voltage'), data.voltage, 260, '#f5c842');
  drawGauge(document.getElementById('gauge-current'), data.current, 100, '#f5c842');
}

setInterval(async () => {
  try {
    const res  = await fetch('/api/solar');
    const data = await res.json();
    updateFromFlask(data);
  } catch(e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);
════════════════════════════════════════════════ */