/* ════════════════════════════════════════════════
   village_map.js
   Pani Para Village — Interactive Map Logic
   ════════════════════════════════════════════════

   How it works:
   - Each PNG hotspot layer is the same canvas size as the base image.
   - pointer-events: none in CSS means the container div receives all
     mouse events instead of individual <img> elements.
   - On mousemove/click, we do a canvas alpha hit-test: each PNG is drawn
     into an offscreen <canvas>, then we read the alpha value at the
     cursor's position. Alpha > 10 = visible pixel = that layer is the hit.
   - We test layers from top (last in DOM) to bottom (first), returning
     the first opaque hit. This correctly handles overlapping shapes.
   - NOTE: canvas.getImageData() requires the page to be served over HTTP
     (e.g. Flask dev server or Render). It will not work when the HTML is
     opened directly as a file:// URL due to browser security restrictions.
   ════════════════════════════════════════════════ */

/* ── Theme sync from parent (index.html) ── */
function applyThemeFromParent(theme) {
  if (theme === 'light') document.body.classList.add('light');
  else document.body.classList.remove('light');
}
// Listen for theme change messages from parent
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'themeChange') {
    applyThemeFromParent(e.data.theme);
  }
});
// On load, check parent's stored theme
try {
  const saved = localStorage.getItem('karazhar-theme');
  if (saved) applyThemeFromParent(saved);
} catch (e) {}

const hotspots   = Array.from(document.querySelectorAll('.hotspot-layer'));
const legendItems = document.querySelectorAll('.legend-item');
const container   = document.getElementById('mapContainer');

// ── Offscreen canvas cache ──────────────────────────────────────────────────
// key: data-id string → value: HTMLCanvasElement with the image drawn on it
const canvasCache = new Map();

function buildCanvas(img) {
    const c = document.createElement('canvas');
    c.width  = img.naturalWidth  || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
}

function getAlpha(img, relX, relY) {
    let c = canvasCache.get(img.dataset.id);
    if (!c) {
        try {
            c = buildCanvas(img);
            canvasCache.set(img.dataset.id, c);
        } catch (e) {
            // Tainted canvas (CORS) — treat pixel as opaque so click still works
            return 255;
        }
    }
    const px = Math.floor(relX * c.width);
    const py = Math.floor(relY * c.height);
    try {
        return c.getContext('2d').getImageData(px, py, 1, 1).data[3]; // alpha channel
    } catch (e) {
        return 255;
    }
}

function getRelativePos(img, event) {
    const rect = img.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top)  / rect.height
    };
}

// Pre-build canvases as soon as images are loaded
hotspots.forEach(img => {
    if (img.complete) {
        try { canvasCache.set(img.dataset.id, buildCanvas(img)); } catch (e) {}
    } else {
        img.addEventListener('load', () => {
            try { canvasCache.set(img.dataset.id, buildCanvas(img)); } catch (e) {}
        });
    }
});

// ── Hit testing ─────────────────────────────────────────────────────────────
// Returns the topmost hotspot layer whose pixel at (event.clientX, event.clientY)
// is not transparent. Returns null if cursor is over empty space.
function hitTestLayers(event) {
    for (let i = hotspots.length - 1; i >= 0; i--) {
        const img = hotspots[i];
        const pos = getRelativePos(img, event);
        if (pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1) continue;
        if (getAlpha(img, pos.x, pos.y) > 10) return img;
    }
    return null;
}

// ── Hover handling ───────────────────────────────────────────────────────────
let hoveredLayer = null;

container.addEventListener('mousemove', (e) => {
    const hit = hitTestLayers(e);
    if (hit === hoveredLayer) return; // no change

    if (hoveredLayer) hoveredLayer.classList.remove('hovered');
    hoveredLayer = hit;

    if (hoveredLayer) {
        hoveredLayer.classList.add('hovered');
        container.style.cursor = 'pointer';
    } else {
        container.style.cursor = 'default';
    }
});

container.addEventListener('mouseleave', () => {
    if (hoveredLayer) hoveredLayer.classList.remove('hovered');
    hoveredLayer = null;
    container.style.cursor = 'default';
});

// ── Click handling ───────────────────────────────────────────────────────────
container.addEventListener('click', (e) => {
    const hit = hitTestLayers(e);
    if (!hit) return;

    openModal(hit);
});

// ── Modal helpers ────────────────────────────────────────────────────────────
function openModal(layer) {
    const modalEl = document.getElementById(layer.dataset.modal);
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Update active states
    setActive(layer.dataset.id);
}

function setActive(id) {
    hotspots.forEach(l => l.classList.remove('active'));
    legendItems.forEach(l => l.classList.remove('active'));

    const layer = hotspots.find(h => h.dataset.id === id);
    if (layer) layer.classList.add('active');

    const legendItem = document.querySelector(`.legend-item[data-target="${id}"]`);
    if (legendItem) legendItem.classList.add('active');
}

// ── Legend click ─────────────────────────────────────────────────────────────
legendItems.forEach(item => {
    item.addEventListener('click', () => {
        const layer = hotspots.find(h => h.dataset.id === item.dataset.target);
        if (layer) openModal(layer);
    });
});

// ── Clear active state when any modal closes ─────────────────────────────────
document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('hidden.bs.modal', () => {
        hotspots.forEach(l => l.classList.remove('active'));
        legendItems.forEach(l => l.classList.remove('active'));
    });
});