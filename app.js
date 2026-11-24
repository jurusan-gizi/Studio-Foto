// Studio Pas Foto — semua proses berjalan di perangkat (offline)
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const DPI = 300;
const cm2px = (cm) => Math.round(cm / 2.54 * DPI);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAX_SIDE = 1600;

const SIZES = [
  { id: '2x3', w: 2, h: 3, note: 'Kartu, KTM', head: 0.50, top: 0.10 },
  { id: '3x4', w: 3, h: 4, note: 'Lamaran, ijazah', head: 0.50, top: 0.10 },
  { id: '4x6', w: 4, h: 6, note: 'Ijazah, SK, arsip', head: 0.46, top: 0.10 },
  { id: '3.5x4.5', w: 3.5, h: 4.5, note: 'Paspor, visa', head: 0.72, top: 0.07 },
  { id: '5x5', w: 5, h: 5, note: 'Visa AS (2×2 inci)', head: 0.60, top: 0.10 },
  { id: '2x2.5', w: 2, h: 2.5, note: 'Kartu kecil', head: 0.58, top: 0.09 }
];
const fmtSize = (s) => `${String(s.w).replace('.', ',')}×${String(s.h).replace('.', ',')}`;

const BGS = [
  { id: 'red', n: 'Merah', c: '#d7141a' },
  { id: 'red2', n: 'Merah tua', c: '#b0121a' },
  { id: 'gray', n: 'Abu-abu', c: '#a2a3a6' },
  { id: 'grayg', n: 'Abu gradasi', grad: ['#dcdcdc', '#76777b'] },
  { id: 'gray2', n: 'Abu tua', c: '#6e7074' },
  { id: 'blue', n: 'Biru', c: '#1f5fbf' },
  { id: 'blue2', n: 'Biru muda', c: '#4a90d9' },
  { id: 'white', n: 'Putih', c: '#ffffff' }
];

const PAPERS = [
  { id: '4r', n: '4R (10,2 × 15,2 cm)', w: 10.2, h: 15.2 },
  { id: '3r', n: '3R (8,9 × 12,7 cm)', w: 8.9, h: 12.7 },
  { id: 'a5', n: 'A5 (14,8 × 21 cm)', w: 14.8, h: 21 },
  { id: 'a4', n: 'A4 (21 × 29,7 cm)', w: 21, h: 29.7 },
  { id: 'f4', n: 'F4 / Folio (21,5 × 33 cm)', w: 21.5, h: 33 }
];

const ADJ = [
  { k: 'bright', n: 'Kecerahan', min: -100, max: 100 },
  { k: 'contrast', n: 'Kontras', min: -100, max: 100 },
  { k: 'shadow', n: 'Terangkan bayangan wajah', min: 0, max: 100 },
  { k: 'sat', n: 'Saturasi warna', min: -100, max: 100 },
  { k: 'warm', n: 'Hangat ↔ dingin', min: -50, max: 50 },
  { k: 'smooth', n: 'Haluskan kulit', min: 0, max: 100 },
  { k: 'sharp', n: 'Ketajaman', min: 0, max: 100 }
];
const ADJ0 = () => Object.fromEntries(ADJ.map((a) => [a.k, 0]));

const store = {
  get(k, d) { try { const v = localStorage.getItem('pasfoto.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pasfoto.' + k, JSON.stringify(v)); } catch {} }
};

const S = {
  step: 1, maxStep: 1,
  src: null, srcData: null, w: 0, h: 0,
  maskCv: null, maskCtx: null, autoMask: null, undo: [],
  adj: ADJ0(), adjData: null,
  feather: 1, choke: 2,
  cut: document.createElement('canvas'),
  bg: store.get('bg', { id: 'red' }),
  sizeId: store.get('size', '3x4'),
  tf: null, guide: true,
  paper: store.get('paper', '4r'), counts: {}, cutLines: true, labelOn: false, label: '',
  cleanSpots: store.get('clean', true), rawAlpha: null,
  brushMode: 'pan', brush: 30, zoom: 1
};
const curSize = () => SIZES.find((s) => s.id === S.sizeId) || SIZES[1];

/* ---------- util ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const toBlob = (cv, type = 'image/jpeg', q = 0.95) => new Promise((r) => cv.toBlob(r, type, q));
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function bgName() { return S.bg.id === 'custom' ? 'warna' : (BGS.find((b) => b.id === S.bg.id) || BGS[0]).n.toLowerCase().replace(/\s+/g, '-'); }

async function setJpegDpi(blob) {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[2] === 0xFF && b[3] === 0xE0 && b[6] === 0x4A && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46) {
    b[13] = 1; b[14] = DPI >> 8; b[15] = DPI & 255; b[16] = DPI >> 8; b[17] = DPI & 255;
  }
  return new Blob([b], { type: 'image/jpeg' });
}

/* ---------- langkah ---------- */
function goStep(n) {
  if (n > S.maxStep && n !== 1) return;
  S.step = n;
  $$('.panel').forEach((p) => (p.hidden = +p.dataset.panel !== n));
  $$('#steps button').forEach((b) => { const k = +b.dataset.step; b.classList.toggle('on', k === n); b.disabled = k > S.maxStep; });
  window.scrollTo({ top: 0 });
  if (n === 2) renderBgView();
  if (n === 3) { if (!S.tf) autoFit(); layoutFrame(); renderCrop(); }
  if (n === 4) { ensureCounts(); renderSheet(); renderSingleInfo(); }
}
$('#steps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.disabled) goStep(+b.dataset.step); });
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { const n = +g.dataset.go; if (n > S.maxStep) S.maxStep = n; goStep(n); } });

/* ---------- langkah 1: muat foto ---------- */
async function loadFile(file) {
  if (!file) return;
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); })
      .catch(() => null);
  }
  if (!bmp) { toast('Foto tidak bisa dibuka. Coba format JPG/PNG.'); return; }
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
  S.src = cv; S.w = w; S.h = h; S.srcData = cx.getImageData(0, 0, w, h);
  S.adj = ADJ0(); S.adjData = S.srcData; S.tf = null; S.undo = []; S.maskCtx = null; S.cut.width = 0;
  syncAdjUI();
  setBusy(true, 'Menyiapkan…', 'Sebentar ya.', 0.05);
  S.maxStep = 2; goStep(2);
  await runSegmentation();
}
$('#inCam').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
$('#inGal').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) loadFile(f); });

/* ---------- hapus latar (AI di perangkat) ---------- */
let worker = null;
const publicPath = () => new URL('engine/', location.href).href;
function setBusy(on, title, msg, pct) {
  $('#busy').hidden = !on;
  if (title) $('#busyTitle').textContent = title;
  if (msg != null) $('#busyMsg').textContent = msg;
  if (pct != null) $('#busyBar').style.width = Math.round(pct * 100) + '%';
}
function onProgress(key, cur, tot) {
  if (key.startsWith('fetch')) setBusy(true, 'Memuat mesin AI…', 'Hanya lama saat pertama kali.', tot ? cur / tot : 0);
  else if (key.startsWith('compute')) setBusy(true, 'Menghapus latar…', 'Di HP bisa 10–40 detik, mohon tunggu.', cur >= tot ? 1 : 0.6);
}
function segmentWorker(blob) {
  return new Promise((resolve, reject) => {
    try { if (!worker) worker = new Worker('engine/worker.js', { type: 'module' }); }
    catch (e) { reject(e); return; }
    const w = worker;
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') onProgress(d.key, d.cur, d.tot);
      else if (d.type === 'done') resolve(new Uint8Array(d.buf));
      else if (d.type === 'error') reject(new Error(d.message));
    };
    w.onerror = (e) => { worker = null; reject(new Error(e.message || 'worker gagal')); };
    w.postMessage({ blob, publicPath: publicPath() });
  });
}
async function segmentMain(blob) {
  const m = await import('./engine/bgr.mjs');
  const out = await m.segmentForeground(blob, {
    publicPath: publicPath(), model: 'small', proxyToWorker: false,
    output: { format: 'image/x-alpha8' }, progress: onProgress
  });
  return new Uint8Array(await out.arrayBuffer());
}
async function runSegmentation() {
  setBusy(true, 'Menyiapkan…', 'Sebentar ya.', 0.05);
  const blob = await toBlob(S.src, 'image/png');
  let alpha = null;
  try { alpha = await segmentWorker(blob); }
  catch (e) {
    console.warn('Worker gagal, pakai jalur utama:', e);
    try { setBusy(true, 'Menghapus latar…', 'Tampilan bisa berhenti sejenak.', 0.5); await new Promise((r) => setTimeout(r, 50)); alpha = await segmentMain(blob); }
    catch (e2) { console.error(e2); }
  }
  setBusy(false);
  if (!alpha || alpha.length !== S.w * S.h) {
    toast('Latar gagal dihapus otomatis. Gunakan kuas Hapus secara manual.');
    alpha = new Uint8Array(S.w * S.h).fill(255);
  }
  S.rawAlpha = alpha;
  buildMask();
  S.maxStep = 4; goStep(2);
  updateCut();
}

// buang bercak lepas (sisa dinding bertekstur) & tambal lubang kecil
function cleanAlpha(src, w, h) {
  const n = w * h, a = new Uint8Array(src);
  for (let i = 0; i < n; i++) if (a[i] < 45) a[i] = 0;
  const lab = new Int32Array(n), stack = new Int32Array(n), sizes = [0];
  const label = (isFg, id) => (start) => {
    let sp = 0, cnt = 0; stack[sp++] = start; lab[start] = id;
    while (sp) {
      const p = stack[--sp]; cnt++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !lab[p - 1] && isFg(p - 1)) { lab[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && !lab[p + 1] && isFg(p + 1)) { lab[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && !lab[p - w] && isFg(p - w)) { lab[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && !lab[p + w] && isFg(p + w)) { lab[p + w] = id; stack[sp++] = p + w; }
    }
    return cnt;
  };
  // 1) komponen orang (alpha >= 128)
  const fg = (p) => a[p] >= 128;
  let id = 0;
  for (let p = 0; p < n; p++) if (!lab[p] && fg(p)) { id++; sizes[id] = label(fg, id)(p); }
  if (!id) return a;
  const big = Math.max(...sizes.slice(1));
  const keep = sizes.map((s, i) => i > 0 && s >= big * 0.12);
  // piksel semi-transparan ikut komponen tetangga terdekat yang dipertahankan; selain itu dibuang
  const near = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (lab[p] && keep[lab[p]]) near[p] = 1;
  const R = Math.max(3, Math.round(Math.max(w, h) / 250));
  // dilasi sederhana area yang dipertahankan (box) untuk menjaga tepi rambut halus
  const rowAcc = new Uint16Array(n), dil = new Uint8Array(n);
  for (let y = 0; y < h; y++) { let s = 0; const o = y * w;
    for (let x = -R; x <= R; x++) if (x >= 0 && x < w) s += near[o + x];
    for (let x = 0; x < w; x++) { rowAcc[o + x] = s; if (x - R >= 0) s -= near[o + x - R]; if (x + R + 1 < w) s += near[o + x + R + 1]; } }
  for (let x = 0; x < w; x++) { let s = 0;
    for (let y = -R; y <= R; y++) if (y >= 0 && y < h) s += rowAcc[y * w + x];
    for (let y = 0; y < h; y++) { dil[y * w + x] = s > 0 ? 1 : 0; if (y - R >= 0) s -= rowAcc[(y - R) * w + x]; if (y + R + 1 < h) s += rowAcc[(y + R + 1) * w + x]; } }
  for (let p = 0; p < n; p++) {
    if (a[p] >= 128) { if (!keep[lab[p]]) a[p] = 0; }
    else if (!dil[p]) a[p] = 0;
  }
  // 2) tambal lubang kecil di dalam badan (latar yang tidak menyentuh tepi foto)
  lab.fill(0); const bgIds = [0], touch = [false]; let bid = 0;
  const bg = (p) => a[p] < 128;
  for (let p = 0; p < n; p++) if (!lab[p] && bg(p)) {
    bid++; const cnt = label(bg, bid)(p); bgIds[bid] = cnt; touch[bid] = false;
  }
  for (let x = 0; x < w; x++) { touch[lab[x]] = true; touch[lab[(h - 1) * w + x]] = true; }
  for (let y = 0; y < h; y++) { touch[lab[y * w]] = true; touch[lab[y * w + w - 1]] = true; }
  const holeMax = n * 0.002;
  for (let p = 0; p < n; p++) { const L = lab[p]; if (L && !touch[L] && bgIds[L] < holeMax) a[p] = 255; }
  return a;
}
function buildMask() {
  const alpha = S.cleanSpots ? cleanAlpha(S.rawAlpha, S.w, S.h) : S.rawAlpha;
  const cv = document.createElement('canvas'); cv.width = S.w; cv.height = S.h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const id = ctx.createImageData(S.w, S.h);
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) { id.data[j] = id.data[j + 1] = id.data[j + 2] = 255; id.data[j + 3] = alpha[i]; }
  ctx.putImageData(id, 0, 0);
  S.maskCv = cv; S.maskCtx = ctx; S.autoMask = id; S.undo = [];
}

/* ---------- pengolahan gambar ---------- */
function blur1(src, w, h, r) { // satu kanal, Uint8/Float -> Float32
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let s = 0;
    for (let x = -r; x <= r; x++) s += src[o + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[o + x] = s / d; s += src[o + Math.min(x + r + 1, w - 1)] - src[o + Math.max(x - r, 0)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / d; s += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x]; }
  }
  return out;
}
function splitRGB(data, n) {
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { R[i] = data[j]; G[i] = data[j + 1]; B[i] = data[j + 2]; }
  return [R, G, B];
}
function computeAdjusted() {
  const a = S.adj, w = S.w, h = S.h, n = w * h, src = S.srcData.data;
  if (ADJ.every((x) => !a[x.k])) { S.adjData = S.srcData; return; }
  const gamma = Math.pow(2, -a.bright / 100);
  const c = a.contrast * 1.28, cf = (259 * (c + 255)) / (255 * (259 - c));
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let x = 255 * Math.pow(v / 255, gamma);
    x = cf * (x - 128) + 128;
    x = x + (a.shadow / 100) * 75 * Math.pow(1 - clamp(x, 0, 255) / 255, 2.2);
    lut[v] = x;
  }
  let [R, G, B] = splitRGB(src, n);
  const sat = 1 + a.sat / 100, wm = a.warm * 0.5;
  for (let i = 0; i < n; i++) {
    let r = lut[R[i]], g = lut[G[i]], b = lut[B[i]];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * sat + wm; g = l + (g - l) * sat + wm * 0.15; b = l + (b - l) * sat - wm;
    R[i] = r; G[i] = g; B[i] = b;
  }
  const k = Math.max(1, Math.round(Math.max(w, h) / 800));
  if (a.smooth > 0) {
    const r = 2 * k + 1, T = 26, amt = a.smooth / 100;
    const bR = blur1(R, w, h, r), bG = blur1(G, w, h, r), bB = blur1(B, w, h, r);
    for (let i = 0; i < n; i++) {
      const d = Math.abs((R[i] - bR[i]) * 0.3 + (G[i] - bG[i]) * 0.59 + (B[i] - bB[i]) * 0.11);
      const t = amt * Math.max(0, 1 - d / T);
      R[i] += (bR[i] - R[i]) * t; G[i] += (bG[i] - G[i]) * t; B[i] += (bB[i] - B[i]) * t;
    }
  }
  if (a.sharp > 0) {
    const amt = (a.sharp / 100) * 1.3;
    const bR = blur1(R, w, h, k), bG = blur1(G, w, h, k), bB = blur1(B, w, h, k);
    for (let i = 0; i < n; i++) { R[i] += (R[i] - bR[i]) * amt; G[i] += (G[i] - bG[i]) * amt; B[i] += (B[i] - bB[i]) * amt; }
  }
  const out = new ImageData(w, h), o = out.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) { o[j] = R[i]; o[j + 1] = G[i]; o[j + 2] = B[i]; o[j + 3] = 255; }
  S.adjData = out;
}
function processedAlpha() {
  const w = S.w, h = S.h, n = w * h, m = S.maskCtx.getImageData(0, 0, w, h).data;
  let A = new Float32Array(n);
  for (let i = 0; i < n; i++) A[i] = m[i * 4 + 3];
  const k = Math.max(1, Math.max(w, h) / 900);
  if (S.feather > 0) A = blur1(A, w, h, Math.max(1, Math.round(S.feather * k)));
  const t = S.choke * 11;
  if (t > 0) for (let i = 0; i < n; i++) A[i] = clamp((A[i] - t) / (255 - t) * 255, 0, 255);
  return A;
}
function updateCut() {
  if (!S.maskCtx) return;
  const A = processedAlpha(), src = S.adjData.data, w = S.w, h = S.h;
  const out = new ImageData(w, h), o = out.data;
  for (let i = 0, j = 0; i < A.length; i++, j += 4) { o[j] = src[j]; o[j + 1] = src[j + 1]; o[j + 2] = src[j + 2]; o[j + 3] = A[i]; }
  S.cut.width = w; S.cut.height = h; S.cut.getContext('2d').putImageData(out, 0, 0);
  if (S.step === 2) renderBgView(); else if (S.step === 3) renderCrop(); else if (S.step === 4) renderSheet();
}
const updateCutSoon = debounce(updateCut, 60);
const updateAdjSoon = debounce(() => { computeAdjusted(); updateCut(); }, 110);

function paintBg(ctx, W, H) {
  const b = S.bg.id === 'custom' ? { c: S.bg.c } : (BGS.find((x) => x.id === S.bg.id) || BGS[0]);
  if (b.grad) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, Math.max(W, H) * 0.85);
    g.addColorStop(0, b.grad[0]); g.addColorStop(1, b.grad[1]); ctx.fillStyle = g;
  } else ctx.fillStyle = b.c;
  ctx.fillRect(0, 0, W, H);
}

/* ---------- langkah 2: latar + kuas ---------- */
function renderSwatches() {
  $('#swatches').innerHTML = BGS.map((b) => {
    const bgc = b.grad ? `radial-gradient(circle at 50% 35%,${b.grad[0]},${b.grad[1]})` : b.c;
    return `<button type="button" class="sw${S.bg.id === b.id ? ' on' : ''}" data-bg="${b.id}"><span style="background:${bgc};${b.id === 'white' ? 'box-shadow:inset 0 0 0 1px #ccc' : ''}"></span>${b.n}</button>`;
  }).join('');
}
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bg]'); if (!b) return;
  S.bg = { id: b.dataset.bg }; store.set('bg', S.bg); renderSwatches(); rerender();
});
$('#customColor').addEventListener('input', (e) => { S.bg = { id: 'custom', c: e.target.value }; store.set('bg', S.bg); renderSwatches(); rerender(); });
function rerender() { if (S.step === 2) renderBgView(); else if (S.step === 3) renderCrop(); else if (S.step === 4) renderSheet(); }

const bgCv = $('#bgCanvas');
function renderBgView() {
  if (!S.src) return;
  const sc = $('#bgScroller');
  const avail = Math.min(sc.parentElement.clientWidth - 28, 900);
  const fit = Math.min(avail / S.w, (window.innerHeight * 0.68) / S.h);
  const scale = Math.min(fit, 1.6) * S.zoom;
  if (bgCv.width !== S.w || bgCv.height !== S.h) { bgCv.width = S.w; bgCv.height = S.h; }
  bgCv.style.width = Math.round(S.w * scale) + 'px'; bgCv.style.height = Math.round(S.h * scale) + 'px';
  const ctx = bgCv.getContext('2d');
  paintBg(ctx, S.w, S.h);
  if (S.cut.width) ctx.drawImage(S.cut, 0, 0); else ctx.drawImage(S.src, 0, 0);
}
let bgRaf = 0;
function bgSoon() { if (bgRaf) return; bgRaf = requestAnimationFrame(() => { bgRaf = 0; updateCut(); }); }

$('#brushMode').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  S.brushMode = b.dataset.m; $$('#brushMode button').forEach((x) => x.classList.toggle('on', x === b));
  $('#bgScroller').classList.toggle('pan', S.brushMode === 'pan');
  bgCv.style.cursor = S.brushMode === 'pan' ? 'grab' : 'crosshair';
});
$('#bgScroller').classList.add('pan');
$('#zoomSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  S.zoom = +b.dataset.z; $$('#zoomSeg button').forEach((x) => x.classList.toggle('on', x === b)); renderBgView();
});
const rangeBind = (id, key, fmt, after) => {
  const el = $('#' + id), out = $('#o_' + id);
  el.value = S[key]; if (out) out.textContent = fmt ? fmt(S[key]) : S[key];
  el.addEventListener('input', () => { S[key] = +el.value; if (out) out.textContent = fmt ? fmt(S[key]) : S[key]; after && after(); });
};
rangeBind('feather', 'feather', null, updateCutSoon);
rangeBind('choke', 'choke', null, updateCutSoon);
rangeBind('brush', 'brush');
$('#cleanSpots').checked = S.cleanSpots;
$('#cleanSpots').addEventListener('change', (e) => {
  S.cleanSpots = e.target.checked; store.set('clean', S.cleanSpots);
  if (S.rawAlpha) { buildMask(); S.tf = null; updateCut(); }
});

let painting = false, last = null, panStart = null;
function imgPt(e) { const r = bgCv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (S.w / r.width), y: (e.clientY - r.top) * (S.h / r.height), k: S.w / r.width }; }
function dab(p) {
  const ctx = S.maskCtx, rad = (S.brush / 2) * p.k;
  ctx.save();
  ctx.globalCompositeOperation = S.brushMode === 'erase' ? 'destination-out' : 'source-over';
  const g = ctx.createRadialGradient(p.x, p.y, rad * 0.55, p.x, p.y, rad);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
bgCv.addEventListener('pointerdown', (e) => {
  if (!S.maskCtx) return;
  if (S.brushMode === 'pan') {
    if (e.pointerType === 'mouse') { const sc = $('#bgScroller'); panStart = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop }; bgCv.setPointerCapture(e.pointerId); }
    return;
  }
  e.preventDefault(); bgCv.setPointerCapture(e.pointerId);
  S.undo.push(S.maskCtx.getImageData(0, 0, S.w, S.h)); if (S.undo.length > 12) S.undo.shift();
  painting = true; last = imgPt(e); dab(last); bgSoon();
});
bgCv.addEventListener('pointermove', (e) => {
  if (panStart) { const sc = $('#bgScroller'); sc.scrollLeft = panStart.l - (e.clientX - panStart.x); sc.scrollTop = panStart.t - (e.clientY - panStart.y); return; }
  if (!painting) return;
  const p = imgPt(e), dist = Math.hypot(p.x - last.x, p.y - last.y), step = Math.max(1, (S.brush * p.k) / 6);
  for (let t = step; t <= dist; t += step) dab({ x: last.x + (p.x - last.x) * (t / dist), y: last.y + (p.y - last.y) * (t / dist), k: p.k });
  last = p; bgSoon();
});
const endPaint = () => { painting = false; panStart = null; };
bgCv.addEventListener('pointerup', endPaint); bgCv.addEventListener('pointercancel', endPaint);
$('#undoMask').addEventListener('click', () => { const d = S.undo.pop(); if (!d) { toast('Tidak ada yang bisa dibatalkan.'); return; } S.maskCtx.putImageData(d, 0, 0); updateCut(); });
$('#resetMask').addEventListener('click', () => { if (!S.autoMask) return; S.undo.push(S.maskCtx.getImageData(0, 0, S.w, S.h)); S.maskCtx.putImageData(S.autoMask, 0, 0); updateCut(); toast('Kembali ke hasil otomatis.'); });

/* ---------- langkah 3: ukuran, posisi, penyesuaian ---------- */
function renderSizes() {
  $('#sizes').innerHTML = SIZES.map((s) => {
    const k = 30 / Math.max(s.w, s.h);
    return `<button type="button" class="sz${s.id === S.sizeId ? ' on' : ''}" data-sz="${s.id}"><span class="shape" style="width:${s.w * k}px;height:${s.h * k}px"></span><b>${fmtSize(s)} cm</b><small>${s.note}</small></button>`;
  }).join('');
}
$('#sizes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sz]'); if (!b) return;
  S.sizeId = b.dataset.sz; store.set('size', S.sizeId); renderSizes(); autoFit(); layoutFrame(); renderCrop();
});

function subjectBox() {
  const w = S.w, h = S.h, m = S.maskCtx.getImageData(0, 0, w, h).data;
  const L = new Int32Array(h).fill(-1), R = new Int32Array(h).fill(-1);
  let top = -1, bot = -1;
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1; const o = y * w * 4;
    for (let x = 0; x < w; x++) if (m[o + x * 4 + 3] > 128) { if (l < 0) l = x; r = x; }
    if (l >= 0 && r - l > w * 0.02) { L[y] = l; R[y] = r; if (top < 0) top = y; bot = y; }
  }
  if (top < 0) return null;
  // lebar kepala = lebar terbesar pada baris-baris teratas (sampai ±1× lebar kepala dari ubun-ubun)
  let maxW = 0, sumC = 0, cnt = 0;
  for (let y = top; y <= bot; y++) {
    if (L[y] < 0) continue;
    if (y - top > h * 0.03 && y - top > maxW * 1.0) break;
    maxW = Math.max(maxW, R[y] - L[y]);
    sumC += (L[y] + R[y]) / 2; cnt++;
  }
  return { top, headW: maxW, headCx: cnt ? sumC / cnt : w / 2 };
}
function computeFit(sz) {
  const H = sz.h / sz.w; // satuan: lebar bingkai = 1
  const box = S.maskCtx ? subjectBox() : null;
  let s, cx, cy;
  if (box && box.headW > 10) {
    const headH = box.headW * 1.32;               // perkiraan ubun-ubun → dagu
    let dh = (sz.head * H) / headH * S.h;           // tinggi gambar dalam satuan bingkai
    // jangan sampai tepi bawah foto asli terlihat menggantung di dalam bingkai
    const minDh = H * (1 - sz.top) / Math.max(0.05, 1 - box.top / S.h);
    if (dh < minDh) dh = Math.min(minDh, dh * 1.6);
    s = dh * S.w / S.h;                             // lebar gambar / lebar bingkai
    const dw = s;
    cx = 0.5 + dw / 2 - box.headCx * dw / S.w;
    const cyAbs = sz.top * H + dh / 2 - box.top * dh / S.h;
    cy = cyAbs / H;
  } else {
    s = Math.max(1, (H / (S.h / S.w))); cx = 0.5; cy = 0.5;
  }
  return { s, s0: s, cx, cy, rot: 0 };
}
function autoFit() {
  S.tf = computeFit(curSize());
  $('#zoom').value = 100; $('#o_zoom').textContent = '100%';
  $('#rot').value = 0; $('#o_rot').textContent = '0°';
}
function drawSubject(ctx, W, H) {
  const t = S.tf; if (!t) return;
  const dw = t.s * W, dh = dw * S.h / S.w;
  ctx.save(); ctx.translate(t.cx * W, t.cy * H); ctx.rotate(t.rot * Math.PI / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(S.cut.width ? S.cut : S.src, -dw / 2, -dh / 2, dw, dh); ctx.restore();
}
function renderPhoto(W, H) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); paintBg(ctx, W, H); drawSubject(ctx, W, H); return cv;
}
const cropCv = $('#cropCanvas');
function layoutFrame() {
  const sz = curSize(), box = $('#frameBox'), stage = box.parentElement;
  const maxW = Math.min(stage.clientWidth - 44, 380), maxH = window.innerHeight * 0.58;
  let w = maxW, h = w * sz.h / sz.w; if (h > maxH) { h = maxH; w = h * sz.w / sz.h; }
  box.style.width = Math.round(w) + 'px'; box.style.height = Math.round(h) + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cropCv.width = Math.round(w * dpr); cropCv.height = Math.round(h * dpr);
  drawGuide();
}
function renderCrop() {
  if (!S.tf) return;
  const ctx = cropCv.getContext('2d'); paintBg(ctx, cropCv.width, cropCv.height); drawSubject(ctx, cropCv.width, cropCv.height);
}
function drawGuide() {
  const g = $('#guide'), sz = curSize(); g.style.display = S.guide ? '' : 'none';
  const H = sz.h / sz.w, headH = sz.head, cyH = sz.top + headH / 2;
  const ry = headH / 2 * 100, rx = (headH * H / 1.32) / 2 * 100;
  g.innerHTML = `<g fill="none" stroke="#fff" stroke-width="1.3" vector-effect="non-scaling-stroke" opacity=".9">
    <ellipse cx="50" cy="${cyH * 100}" rx="${rx}" ry="${ry}" stroke-dasharray="5 4"/>
    <line x1="50" y1="0" x2="50" y2="100" stroke-dasharray="2 5" opacity=".6"/>
    <line x1="8" y1="${sz.top * 100}" x2="92" y2="${sz.top * 100}" stroke-dasharray="2 4" opacity=".7"/></g>`;
}
$('#showGuide').addEventListener('change', (e) => { S.guide = e.target.checked; drawGuide(); });
$('#autoFit').addEventListener('click', () => { autoFit(); renderCrop(); });
$('#zoom').addEventListener('input', (e) => { const t = S.tf; if (!t) return; zoomTo(t.s0 * (+e.target.value / 100)); });
$('#rot').addEventListener('input', (e) => { S.tf.rot = +e.target.value; $('#o_rot').textContent = String(S.tf.rot).replace('.', ',') + '°'; renderCrop(); });
function zoomTo(ns) {
  const t = S.tf; ns = clamp(ns, t.s0 * 0.3, t.s0 * 3); const r = ns / t.s;
  t.cx = 0.5 + (t.cx - 0.5) * r; t.cy = 0.5 + (t.cy - 0.5) * r; t.s = ns;
  const pct = Math.round(t.s / t.s0 * 100); $('#zoom').value = pct; $('#o_zoom').textContent = pct + '%'; renderCrop();
}
const ptrs = new Map(); let pinch0 = null;
const fb = $('#frameBox');
fb.addEventListener('pointerdown', (e) => { fb.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: S.tf.s }; } });
fb.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId) || !S.tf) return;
  const p = ptrs.get(e.pointerId), r = fb.getBoundingClientRect();
  if (ptrs.size === 1) { S.tf.cx += (e.clientX - p.x) / r.width; S.tf.cy += (e.clientY - p.y) / r.height; renderCrop(); }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; zoomTo(pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d); }
});
const ptrEnd = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; };
fb.addEventListener('pointerup', ptrEnd); fb.addEventListener('pointercancel', ptrEnd);
fb.addEventListener('wheel', (e) => { e.preventDefault(); if (S.tf) zoomTo(S.tf.s * (e.deltaY < 0 ? 1.05 : 1 / 1.05)); }, { passive: false });

function renderAdjFields() {
  $('#adjFields').innerHTML = ADJ.map((a) => `<label class="field">${a.n} <output id="o_adj_${a.k}">0</output>
    <input type="range" data-adj="${a.k}" min="${a.min}" max="${a.max}" value="0"></label>`).join('');
}
function syncAdjUI() { ADJ.forEach((a) => { const el = $(`[data-adj="${a.k}"]`); if (el) { el.value = S.adj[a.k]; $('#o_adj_' + a.k).textContent = S.adj[a.k]; } }); }
$('#adjFields').addEventListener('input', (e) => {
  const k = e.target.dataset.adj; if (!k) return;
  S.adj[k] = +e.target.value; $('#o_adj_' + k).textContent = S.adj[k]; updateAdjSoon();
});
$('#resetAdj').addEventListener('click', () => { S.adj = ADJ0(); syncAdjUI(); computeAdjusted(); updateCut(); });
$('#autoFix').addEventListener('click', () => {
  if (!S.srcData) return;
  const d = S.srcData.data, m = S.maskCtx.getImageData(0, 0, S.w, S.h).data, hist = new Uint32Array(256);
  let n = 0, sr = 0, sb = 0, sl = 0;
  for (let j = 0; j < d.length; j += 16) {
    if (m[j + 3] < 200) continue;
    const l = Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]);
    hist[l]++; n++; sr += d[j]; sb += d[j + 2]; sl += l;
  }
  if (n < 50) { toast('Orang pada foto belum terdeteksi.'); return; }
  const pct = (p) => { let c = 0; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= n * p) return i; } return 255; };
  const p2 = pct(0.02), p98 = pct(0.98), mean = sl / n, spread = Math.max(1, p98 - p2);
  const g = Math.log(0.52) / Math.log(clamp(mean, 10, 245) / 255);
  S.adj = {
    bright: Math.round(clamp(-100 * Math.log2(g), -35, 40)),
    contrast: Math.round(clamp((215 / spread - 1) * 55, 0, 35)),
    shadow: p2 < 35 ? 25 : 12,
    sat: 8,
    warm: Math.round(clamp((32 - (sr - sb) / n) * 0.6, -25, 25)),
    smooth: 25,
    sharp: 20
  };
  syncAdjUI(); computeAdjusted(); updateCut(); toast('Foto diperbaiki otomatis. Silakan sesuaikan lagi bila perlu.');
});

/* ---------- langkah 4: simpan & cetak ---------- */
function renderSingleInfo() {
  const sz = curSize();
  $('#singleInfo').textContent = `${fmtSize(sz)} cm · ${cm2px(sz.w)}×${cm2px(sz.h)} piksel · 300 dpi · latar ${bgName().replace('-', ' ')}`;
  $('#shareSingle').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([new Blob()], 'a.jpg', { type: 'image/jpeg' })] }));
}
async function singleBlob() { const sz = curSize(); return setJpegDpi(await toBlob(renderPhoto(cm2px(sz.w), cm2px(sz.h)), 'image/jpeg', 0.95)); }
const singleName = () => `pasfoto_${curSize().id}_${bgName()}.jpg`;
$('#dlSingle').addEventListener('click', async () => { download(await singleBlob(), singleName()); toast('Foto diunduh.'); });
$('#shareSingle').addEventListener('click', async () => {
  try { await navigator.share({ files: [new File([await singleBlob()], singleName(), { type: 'image/jpeg' })], title: 'Pas foto' }); } catch {}
});

$('#paper').innerHTML = PAPERS.map((p) => `<option value="${p.id}">${p.n}</option>`).join('');
$('#paper').value = S.paper;
$('#paper').addEventListener('change', (e) => { S.paper = e.target.value; store.set('paper', S.paper); renderSheet(); });
const curPaper = () => PAPERS.find((p) => p.id === S.paper) || PAPERS[0];

function renderCounts() {
  $('#counts').innerHTML = SIZES.map((s) => `<div class="cnt"><span>${fmtSize(s)} cm</span><span class="stp">
    <button type="button" data-c="${s.id}" data-d="-1" aria-label="Kurangi ${fmtSize(s)}">−</button><b>${S.counts[s.id] || 0}</b>
    <button type="button" data-c="${s.id}" data-d="1" aria-label="Tambah ${fmtSize(s)}">+</button></span></div>`).join('');
}
$('#counts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  const id = b.dataset.c; S.counts[id] = Math.max(0, (S.counts[id] || 0) + +b.dataset.d);
  if (+b.dataset.d > 0 && pack(S.counts).overflow) { S.counts[id]--; toast('Kertas sudah penuh.'); }
  renderCounts(); renderSheet();
});
function ensureCounts() { if (!Object.values(S.counts).some((v) => v > 0)) fillMax(); else renderCounts(); }
function fillMax() {
  const id = S.sizeId; let c = S.counts[id] || 0;
  while (c < 200) { const t = { ...S.counts, [id]: c + 1 }; if (pack(t).overflow) break; c++; }
  S.counts[id] = c; renderCounts();
}
$('#fillMax').addEventListener('click', () => { fillMax(); renderSheet(); });
$('#clearCounts').addEventListener('click', () => { S.counts = {}; renderCounts(); renderSheet(); });
$('#cutLines').addEventListener('change', (e) => { S.cutLines = e.target.checked; renderSheet(); });
$('#labelOn').addEventListener('change', (e) => { S.labelOn = e.target.checked; $('#labelTxt').hidden = !S.labelOn; renderSheet(); });
$('#labelTxt').addEventListener('input', debounce((e) => { S.label = e.target.value; renderSheet(); }, 200));

// susun foto di kertas (satuan cm), coba tegak & mendatar
function pack(counts) {
  const p = curPaper(), M = 0.3, GAP = 0.2, LAB = S.labelOn ? 0.45 : 0;
  const items = [];
  SIZES.forEach((s) => { for (let i = 0; i < (counts[s.id] || 0); i++) items.push(s); });
  items.sort((a, b) => b.h - a.h || b.w - a.w);
  const tryOri = (PW, PH) => {
    const pos = []; let x = M, y = M, rowH = 0, overflow = 0;
    for (const s of items) {
      const ih = s.h + LAB;
      if (x + s.w > PW - M + 1e-6) { x = M; y += rowH + GAP; rowH = 0; }
      if (y + ih > PH - M + 1e-6 || s.w > PW - 2 * M) { overflow++; continue; }
      pos.push({ s, x, y }); x += s.w + GAP; rowH = Math.max(rowH, ih);
    }
    return { pos, overflow, PW, PH };
  };
  const a = tryOri(p.w, p.h), b = tryOri(p.h, p.w);
  return b.overflow < a.overflow ? b : a;
}
function drawSheet(scale) { // scale: piksel per cm
  const L = pack(S.counts), cv = document.createElement('canvas');
  cv.width = Math.round(L.PW * scale); cv.height = Math.round(L.PH * scale);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  const cache = {};
  for (const { s, x, y } of L.pos) {
    const W = Math.round(s.w * scale), H = Math.round(s.h * scale);
    if (!cache[s.id]) { const t = S.tf; S.tf = fitFor(s); cache[s.id] = renderPhoto(W, H); S.tf = t; }
    const px = Math.round(x * scale), py = Math.round(y * scale);
    ctx.drawImage(cache[s.id], px, py, W, H);
    if (S.cutLines) { ctx.strokeStyle = '#b9b9b9'; ctx.lineWidth = Math.max(1, scale * 0.012); ctx.strokeRect(px - scale * 0.1, py - scale * 0.1, W + scale * 0.2, H + scale * 0.2 + (S.labelOn ? scale * 0.45 : 0)); }
    if (S.labelOn && S.label) {
      ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = `${Math.round(scale * 0.26)}px system-ui, sans-serif`;
      let txt = S.label; while (ctx.measureText(txt).width > W && txt.length > 3) txt = txt.slice(0, -2) + '…';
      ctx.fillText(txt, px + W / 2, py + H + scale * 0.08);
    }
  }
  return { cv, L };
}
// posisi untuk ukuran lain: pakai posisi otomatis ukuran tsb, kecuali ukuran yang sedang diatur
function fitFor(s) { return s.id === S.sizeId ? S.tf : computeFit(s); }
const sheetCv = $('#sheetCanvas');
function renderSheet() {
  if (!S.tf) return;
  const p = curPaper(), maxPx = 900, scale = maxPx / Math.max(p.w, p.h);
  const { cv, L } = drawSheet(scale);
  sheetCv.width = cv.width; sheetCv.height = cv.height; sheetCv.getContext('2d').drawImage(cv, 0, 0);
  const n = L.pos.length;
  $('#sheetInfo').textContent = n ? `${n} foto di kertas ${p.n}${L.overflow ? ` · ${L.overflow} tidak muat` : ''}` : 'Tambahkan jumlah foto di panel kanan.';
}
async function sheetBlob() { const { cv } = drawSheet(DPI / 2.54); return { blob: await setJpegDpi(await toBlob(cv, 'image/jpeg', 0.93)), cv }; }
$('#dlSheet').addEventListener('click', async () => { toast('Menyiapkan lembar…'); const { blob } = await sheetBlob(); download(blob, `lembar-pasfoto_${S.paper}.jpg`); });
$('#dlPdf').addEventListener('click', async () => {
  toast('Menyiapkan PDF…');
  const { blob, cv } = await sheetBlob(), L = pack(S.counts);
  const pdf = makePdf(new Uint8Array(await blob.arrayBuffer()), cv.width, cv.height, L.PW / 2.54 * 72, L.PH / 2.54 * 72);
  download(pdf, `lembar-pasfoto_${S.paper}.pdf`);
});
$('#printSheet').addEventListener('click', async () => {
  const { blob } = await sheetBlob(), L = pack(S.counts), url = URL.createObjectURL(blob);
  let st = $('#pageStyle'); if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
  st.textContent = `@page{size:${L.PW}cm ${L.PH}cm;margin:0}`;
  const pa = $('#printArea'); pa.innerHTML = `<img alt="" src="${url}" style="width:${L.PW}cm;height:${L.PH}cm">`;
  pa.querySelector('img').onload = () => setTimeout(() => window.print(), 100);
});
function makePdf(jpg, iw, ih, pw, ph) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
  push('%PDF-1.4\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${iw} /Height ${ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

/* ---------- mode offline ---------- */
const pill = $('#offlinePill');
function setPill(txt, cls) { pill.textContent = txt; pill.className = 'pill' + (cls ? ' ' + cls : ''); }
async function prepareOffline() {
  if (!('serviceWorker' in navigator) || !('caches' in window)) { setPill('Offline tidak didukung', 'warn'); return; }
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const base = new URL('engine/', location.href).href;
    const cache = await caches.open('pasfoto-engine-v1');
    let resp = await cache.match(base + 'resources.json');
    if (!resp) { const r = await fetch(base + 'resources.json'); if (!r.ok) throw new Error('resources'); await cache.put(base + 'resources.json', r.clone()); resp = r; }
    const res = await resp.json();
    const files = [...new Set(Object.values(res).flatMap((v) => v.chunks.map((c) => c.hash)))];
    let done = 0;
    for (const f of files) {
      const url = base + f;
      if (!(await cache.match(url))) {
        setPill(`Menyiapkan offline ${Math.round(done / files.length * 100)}%`);
        const r = await fetch(url); if (!r.ok) throw new Error(f); await cache.put(url, r);
      }
      done++;
    }
    setPill('✓ Siap offline', 'ok'); store.set('offline', true);
  } catch (e) {
    console.warn(e);
    setPill(navigator.onLine ? 'Offline belum siap — ketuk untuk ulang' : 'Sambungkan internet sekali untuk mode offline', 'warn');
  }
}
pill.addEventListener('click', () => { if (!pill.classList.contains('ok')) prepareOffline(); else toast('Aplikasi dan mesin AI sudah tersimpan di perangkat ini.'); });

/* ---------- mulai ---------- */
renderSwatches(); renderSizes(); renderAdjFields(); renderCounts();
if (S.bg.id === 'custom' && S.bg.c) $('#customColor').value = S.bg.c;
window.addEventListener('resize', debounce(() => { if (S.step === 2) renderBgView(); if (S.step === 3) { layoutFrame(); renderCrop(); } }, 150));
prepareOffline();
