/* ════════════════════════════════════════════════
   generator.js
   Karazhar Minigrid — Diesel Generator Page
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

/* ── Time labels ── */
function genTimeLabels(n, intervalMin) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(now - (n - 1 - i) * intervalMin * 60 * 1000);
    return `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
  });
}

/* ── Semicircle gauge renderer ── */
function drawGauge(el, value, min, max, color, isStandby = false) {
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

  if (!isStandby) {
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
  }

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
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.font      = '9px JetBrains Mono';
  c.textAlign = 'left';
  c.fillText(min, cx - r - 2, cy + 14);
  c.textAlign = 'right';
  c.fillText(max, cx + r + 2, cy + 14);
}

/* ── Vertical bar updater ── */
function setVBar(barId, valId, pct, displayVal) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (bar) bar.style.height = pct + '%';
  if (val) val.textContent  = displayVal;
}

/* ── Generator state ── */
let generatorRunning = false;

function applyGeneratorState(running) {
  generatorRunning = running;

  const dot      = document.getElementById('gen-status-dot');
  const txt      = document.getElementById('gen-status-text');
  const btn      = document.getElementById('gen-toggle-btn');
  const btnLabel = document.getElementById('gen-btn-label');
  const badge    = document.getElementById('gen-capacity-badge');

  if (running) {
    dot.className = 'gen-status-dot running';
    txt.textContent = 'RUNNING';
    txt.className = 'gen-status-text running-text';
    btn.className = 'gen-toggle-btn active';
    btnLabel.textContent = 'Stop Generator';

    /* Update gauges to running values */
    drawGauge(document.getElementById('gauge-gen-voltage'), 220,  0, 260,  '#ff6b6b');
    drawGauge(document.getElementById('gauge-gen-current'), 182,  0, 300,  '#ff6b6b');
    drawGauge(document.getElementById('gauge-rpm'),        1500,  0, 2000, '#ff6b6b');
    drawGauge(document.getElementById('gauge-freq'),         50, 45,   55, '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-voltage'),  24,  0,   30, '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-current'),  18,  0,   50, '#ff6b6b');

    document.getElementById('gen-voltage-val').textContent = '220';
    document.getElementById('gen-current-val').textContent = '182';
    document.getElementById('rpm-val').textContent         = '1500';
    document.getElementById('freq-val').textContent        = '50.0';
    document.getElementById('bat-voltage-val').textContent = '24';
    document.getElementById('bat-current-val').textContent = '18';

    setVBar('vbar-gen-temp', 'gen-temp-val',  60, '120');  // 120°C on 0–200
    setVBar('vbar-coolant',  'coolant-val',   45, '90');   // 90°C on 0–200
    setVBar('vbar-fuel',     'fuel-val',      72, '72');
    setVBar('vbar-water',    'water-val',     55, '55');

    /* ATS → Generator */
    document.getElementById('ats-grid-badge').className   = 'ats-source-badge standby';
    document.getElementById('ats-grid-badge').textContent = 'STANDBY';
    document.getElementById('ats-gen-badge').className    = 'ats-source-badge running';
    document.getElementById('ats-gen-badge').textContent  = 'ACTIVE';
    document.querySelector('#ats-grid .ats-icon').className   = 'ats-icon ats-icon-standby';
    document.querySelector('#ats-gen-src .ats-icon').className = 'ats-icon ats-icon-running';

  } else {
    dot.className = 'gen-status-dot standby';
    txt.textContent = 'STANDBY';
    txt.className = 'gen-status-text';
    btn.className = 'gen-toggle-btn';
    btnLabel.textContent = 'Start Generator';

    /* Gauges zeroed — standby */
    ['gauge-gen-voltage','gauge-gen-current','gauge-rpm','gauge-freq'].forEach(id => {
      drawGauge(document.getElementById(id), 0, 0, 1, '#ff6b6b', true);
    });
    drawGauge(document.getElementById('gauge-bat-voltage'), 24, 0, 30, '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-current'),  0, 0, 50, '#ff6b6b', true);

    document.getElementById('gen-voltage-val').textContent = '0';
    document.getElementById('gen-current-val').textContent = '0';
    document.getElementById('rpm-val').textContent         = '0';
    document.getElementById('freq-val').textContent        = '0';
    document.getElementById('bat-voltage-val').textContent = '24';
    document.getElementById('bat-current-val').textContent = '0';

    setVBar('vbar-gen-temp', 'gen-temp-val', 0,  '—');
    setVBar('vbar-coolant',  'coolant-val',  0,  '—');
    setVBar('vbar-fuel',     'fuel-val',     72, '72');
    setVBar('vbar-water',    'water-val',    55, '55');

    /* ATS → Grid */
    document.getElementById('ats-grid-badge').className   = 'ats-source-badge active';
    document.getElementById('ats-grid-badge').textContent = 'ACTIVE';
    document.getElementById('ats-gen-badge').className    = 'ats-source-badge standby';
    document.getElementById('ats-gen-badge').textContent  = 'STANDBY';
    document.querySelector('#ats-grid .ats-icon').className    = 'ats-icon ats-icon-active';
    document.querySelector('#ats-gen-src .ats-icon').className = 'ats-icon ats-icon-standby';
  }
}

/* ── Init on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => {

  /* Initial standby state */
  applyGeneratorState(false);

  /* Toggle button */
  document.getElementById('gen-toggle-btn').addEventListener('click', () => {
    applyGeneratorState(!generatorRunning);
  });

  /* ── Power output vs Load demand chart ── */
  const dualCtx = document.getElementById('chart-gen-dual').getContext('2d');

  const gP = dualCtx.createLinearGradient(0, 0, 0, 200);
  gP.addColorStop(0, 'rgba(255,107,107,0.25)');
  gP.addColorStop(1, 'rgba(255,107,107,0)');

  const gL = dualCtx.createLinearGradient(0, 0, 0, 200);
  gL.addColorStop(0, 'rgba(136,136,136,0.15)');
  gL.addColorStop(1, 'rgba(136,136,136,0)');

  /* Generator was off most of the window, briefly ran during outage */
  new Chart(dualCtx, {
    type: 'line',
    data: {
      labels: genTimeLabels(16, 15),
      datasets: [
        {
          label: 'Power Out (kW)',
          data: [0, 0, 0, 0, 0, 0, 0, 0, 40, 38, 40, 39, 0, 0, 0, 0],
          borderColor: '#ff6b6b',
          borderWidth: 2,
          backgroundColor: gP,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#ff6b6b',
          pointHoverBorderColor: '#0a0a0a',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Load (kW)',
          data: [35, 36, 34, 37, 38, 36, 35, 37, 38, 37, 39, 38, 36, 35, 34, 36],
          borderColor: '#888',
          borderWidth: 1.5,
          borderDash: [5, 3],
          backgroundColor: gL,
          fill: true,
          tension: 0.45,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#888',
          pointHoverBorderColor: '#0a0a0a',
          pointHoverBorderWidth: 2,
        }
      ]
    },
    options: CHART_OPTS
  });

});

/* ════════════════════════════════════════════════
   SIMULINK INTEGRATION STUB
   When Flask bridge is running, uncomment below.
   Expected JSON from /api/generator:
   {
     "running": false,
     "voltage": 0, "current": 0, "rpm": 0, "frequency": 0,
     "gen_temp": 0, "coolant_temp": 0,
     "fuel_pct": 72, "water_pct": 55,
     "bat_voltage": 24, "bat_current": 0,
     "ats_source": "grid",
     "alerts": [ { "msg": "...", "time": "09:42:10", "level": "info" } ]
   }

function updateFromFlask(data) {
  applyGeneratorState(data.running);

  if (data.running) {
    drawGauge(document.getElementById('gauge-gen-voltage'), data.voltage,   0, 260,  '#ff6b6b');
    drawGauge(document.getElementById('gauge-gen-current'), data.current,   0, 300,  '#ff6b6b');
    drawGauge(document.getElementById('gauge-rpm'),         data.rpm,       0, 2000, '#ff6b6b');
    drawGauge(document.getElementById('gauge-freq'),        data.frequency, 45, 55,  '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-voltage'), data.bat_voltage, 0, 30, '#ff6b6b');
    drawGauge(document.getElementById('gauge-bat-current'), data.bat_current, 0, 50, '#ff6b6b');

    document.getElementById('gen-voltage-val').textContent  = data.voltage;
    document.getElementById('gen-current-val').textContent  = data.current;
    document.getElementById('rpm-val').textContent          = data.rpm;
    document.getElementById('freq-val').textContent         = data.frequency.toFixed(1);
    document.getElementById('bat-voltage-val').textContent  = data.bat_voltage;
    document.getElementById('bat-current-val').textContent  = data.bat_current;

    setVBar('vbar-gen-temp', 'gen-temp-val', (data.gen_temp   / 200) * 100, data.gen_temp);
    setVBar('vbar-coolant',  'coolant-val',  (data.coolant_temp / 200) * 100, data.coolant_temp);
  }

  setVBar('vbar-fuel',  'fuel-val',  data.fuel_pct,  data.fuel_pct);
  setVBar('vbar-water', 'water-val', data.water_pct, data.water_pct);
}

setInterval(async () => {
  try {
    const res  = await fetch('/api/generator');
    const data = await res.json();
    updateFromFlask(data);
  } catch(e) {
    console.warn('Bridge not connected:', e.message);
  }
}, 2000);
════════════════════════════════════════════════ */