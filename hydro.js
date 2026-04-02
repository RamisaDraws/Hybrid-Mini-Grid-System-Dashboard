/* ════════════════════════════════════════════════
   hydro.js
   Karazhar Minigrid — In-Pipe Hydro Page
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
        label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(2)}`
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

/* ── Time label generators ── */
function genTimeLabels(n, intervalMin) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(now - (n - 1 - i) * intervalMin * 60 * 1000);
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  });
}

/* ── Semicircle gauge renderer ──
   Shared with solar.js pattern — draws a half-arc gauge.
── */
function drawGauge(el, value, min, max, color) {
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
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillEnd  = Math.PI + fraction * Math.PI;
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
  c.fillText(min, cx - r - 2, cy + 14);
  c.textAlign  = 'right';
  c.fillText(max, cx + r + 2, cy + 14);
}

/* ── Init on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Flow rate chart (center top, full width) ── */
  const flowCtx = document.getElementById('chart-flow-rate').getContext('2d');
  const flowGrad = flowCtx.createLinearGradient(0, 0, 0, 130);
  flowGrad.addColorStop(0, 'rgba(62,207,207,0.28)');
  flowGrad.addColorStop(1, 'rgba(62,207,207,0)');

  const flowData = [
    0.57, 0.58, 0.59, 0.58, 0.57, 0.58, 0.60, 0.59,
    0.58, 0.57, 0.56, 0.58, 0.59, 0.58, 0.57, 0.58
  ];

  new Chart(flowCtx, {
    type: 'line',
    data: {
      labels: genTimeLabels(16, 15),
      datasets: [{
        label: 'Flow Rate (m³/s)',
        data: flowData,
        borderColor: '#3ecfcf',
        borderWidth: 2,
        backgroundColor: flowGrad,
        fill: true,
        tension: 0.45,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#3ecfcf',
        pointHoverBorderColor: '#0a0a0a',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      ...CHART_OPTS,
      scales: {
        ...CHART_OPTS.scales,
        y: {
          ...CHART_OPTS.scales.y,
          min: 0.45,
          max: 0.65,
        }
      }
    }
  });

  /* ── Power output vs Load demand chart (left col) ── */
  const dualCtx = document.getElementById('chart-hydro-dual').getContext('2d');

  const gP = dualCtx.createLinearGradient(0, 0, 0, 220);
  gP.addColorStop(0, 'rgba(62,207,207,0.28)');
  gP.addColorStop(1, 'rgba(62,207,207,0)');

  const gL = dualCtx.createLinearGradient(0, 0, 0, 220);
  gL.addColorStop(0, 'rgba(255,107,107,0.18)');
  gL.addColorStop(1, 'rgba(255,107,107,0)');

  new Chart(dualCtx, {
    type: 'line',
    data: {
      labels: genTimeLabels(16, 15),
      datasets: [
        {
          label: 'Power Out (kW)',
          data: [248, 250, 251, 249, 250, 252, 250, 249, 251, 250, 248, 250, 252, 251, 249, 250],
          borderColor: '#3ecfcf',
          borderWidth: 2,
          backgroundColor: gP,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#3ecfcf',
          pointHoverBorderColor: '#0a0a0a',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Load (kW)',
          data: [180, 190, 200, 195, 205, 210, 200, 185, 195, 210, 200, 190, 205, 215, 200, 195],
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

  /* ── Gauges ── */
  // Pressure: range 26–60 m, current 52 m
  drawGauge(document.getElementById('gauge-pressure'), 52, 26, 60, '#3ecfcf');

  // Voltage: 0–260 V, current 220 V
  drawGauge(document.getElementById('gauge-voltage'), 220, 0, 260, '#3ecfcf');

  // Current: 0–1500 A, current 1136 A
  drawGauge(document.getElementById('gauge-current'), 1136, 0, 1500, '#3ecfcf');

});

/* ════════════════════════════════════════════════
   SIMULINK INTEGRATION STUB
   When Flask bridge is running, uncomment below.
   Expected JSON from /api/hydro:
   {
     "voltage": 220,
     "current": 1136,
     "power": 250,
     "flow_rate": 0.58,
     "pressure": 52,
     "pump_running": true,
     "alerts": [ { "msg": "...", "time": "09:42:10", "level": "info" } ]
   }

function updateFromFlask(data) {
  // Gauges
  drawGauge(document.getElementById('gauge-pressure'), data.pressure, 26, 60, '#3ecfcf');
  drawGauge(document.getElementById('gauge-voltage'),  data.voltage,  0, 260, '#3ecfcf');
  drawGauge(document.getElementById('gauge-current'),  data.current,  0, 1500, '#3ecfcf');

  // Numeric labels
  document.getElementById('pressure-val').textContent = data.pressure;
  document.getElementById('voltage-val').textContent  = data.voltage;
  document.getElementById('current-val').textContent  = data.current;

  // Pump state
  const stateEl = document.getElementById('pump-state-val');
  const iconEl  = document.querySelector('.pump-icon-wrap');
  if (data.pump_running) {
    stateEl.textContent = 'RUNNING';
    stateEl.classList.remove('pump-state-off');
    iconEl.className = 'pump-icon-wrap pump-on';
  } else {
    stateEl.textContent = 'STOPPED';
    stateEl.classList.add('pump-state-off');
    iconEl.className = 'pump-icon-wrap pump-off';
  }
}

setInterval(async () => {
  try {
    const res  = await fetch('/api/hydro');
    const data = await res.json();
    updateFromFlask(data);
  } catch(e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);
════════════════════════════════════════════════ */