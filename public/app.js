/**
 * StegoGauge — Main Application
 *
 * HIDE mode: encode a secret into a dusk skyline SVG, render to PNG.
 * SEEK mode (Gauge): blind pixel detector — zero Pollen cost.
 * SEEK mode (Vision): AI vision seeker via Pollinations API (BYOP).
 *
 * Engine imports (browser-compatible copies in /engine/)
 */

import { encodeSkylineSvg, normaliseSecret } from './engine/skyline.js';
import { analysePixels } from './engine/gauge.js';
import { similarity } from './engine/lattice.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function createToastContainer() {
  const el = document.createElement('div');
  el.className = 'toast-container';
  document.body.appendChild(el);
  return el;
}

function setStatus(el, status) {
  if (!el) return;
  el.style.display = status ? 'block' : 'none';
  el.className = `status-msg ${status}`;
  el.innerHTML = status === 'ok' ? `✓ ${el.dataset.ok || ''}`
    : status === 'err' ? `✗ ${el.dataset.err || ''}`
    : `<span class="spinner"></span> ${el.dataset.info || ''}`;
}

function parsePollenKey() {
  // Check sessionStorage first (from <polli-connect> change event)
  const session = sessionStorage.getItem('pollinations-api-key');
  if (session) return session;
  // Check element for legacy apps
  const el = document.getElementById('polli-connect');
  if (el?.apiKey) return el.apiKey;
  // Fallback: check URL param (user-pasted key)
  return new URLSearchParams(window.location.search).get('pollen') || '';
}

// ─── State ───────────────────────────────────────────────────────────────────

let currentSecret = '';
let currentSvg = '';
let currentCanvasUrl = '';
let seekMode = 'gauge'; // 'gauge' | 'vision'
let apiKey = '';

// ─── DOM refs ────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

// Hide mode elements
const secretInput = $('secret-input');
const stepSlider = $('step-slider');
const stepValue = $('step-value');
const encodeBtn = $('encode-btn');
const encodeStatus = $('encode-status');
const skylinePreview = $('skyline-preview');
const skylineImg = $('skyline-img');
const skylineSvgWrap = $('skyline-svg-wrap');
const skylineSvgCode = $('skyline-svg-code');
const encodeMeta = $('encode-meta');
const encodeActions = $('encode-actions');
const downloadPng = $('download-png');
const copyLink = $('copy-link');

// Seek mode elements
const dropZone = $('drop-zone');
const fileInput = $('file-input');
const urlInput = $('url-input');
const loadUrlBtn = $('load-url-btn');
const gaugeBtn = $('gauge-btn');
const visionBtn = $('vision-btn');
const analyzeBtn = $('analyze-btn');
const analyzeStatus = $('analyze-status');
const resultPreview = $('result-preview');
const resultImg = $('result-img');
const resultOverlay = $('result-overlay');
const overlayCanvas = $('overlay-canvas');
const resultStats = $('result-stats');
const scoreBar = $('score-bar');
const scoreVal = $('score-val');
const detectionResult = $('detection-result');
const decodedBox = $('decoded-box');
const decodedText = $('decoded-text');
const visionBox = $('vision-box');
const visionText = $('vision-text');
const detailDetails = $('detail-details');
const detectionDetail = $('detection-detail');

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  // Load Pollen key from connect component
  const connectEl = document.getElementById('polli-connect');
  if (connectEl) {
    connectEl.addEventListener('change', (e) => {
      apiKey = e.detail?.apiKey || e.target?.apiKey || '';
      sessionStorage.setItem('pollinations-api-key', apiKey);
      updateAuthStatus();
    });
    // Try to read existing key
    if (connectEl.apiKey) {
      apiKey = connectEl.apiKey;
      sessionStorage.setItem('pollinations-api-key', apiKey);
    }
  }
  apiKey = parsePollenKey();
  updateAuthStatus();

  // Slider
  stepSlider.addEventListener('input', () => {
    stepValue.textContent = stepSlider.value;
  });

  // Encode button
  encodeBtn.addEventListener('click', handleEncode);

  // Download PNG
  downloadPng.addEventListener('click', () => {
    if (!currentCanvasUrl) return;
    const a = document.createElement('a');
    a.href = currentCanvasUrl;
    a.download = `stego-gauge-${Date.now()}.png`;
    a.click();
  });

  // Copy link
  copyLink.addEventListener('click', async () => {
    if (!currentSvg) return;
    // Encode SVG as data URL for sharing
    const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      await navigator.clipboard.writeText(url);
      showToast('SVG copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  // Drop zone
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleImageFile(e.target.files[0]);
  });

  // URL input
  loadUrlBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    try {
      await loadImageFromUrl(url);
    } catch (err) {
      showToast('Failed to load image', 'error');
    }
  });

  // Mode toggle
  gaugeBtn.addEventListener('click', () => setSeekMode('gauge'));
  visionBtn.addEventListener('click', () => setSeekMode('vision'));

  // Analyze button
  analyzeBtn.addEventListener('click', handleAnalyze);

  // Load demo image on start
  loadDemoImage();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function updateAuthStatus() {
  const connectEl = document.getElementById('polli-connect');
  const statusEl = document.getElementById('auth-status-pill');
  if (!statusEl) return;
  if (apiKey) {
    statusEl.textContent = '● Connected';
    statusEl.style.color = 'var(--success)';
  } else {
    statusEl.textContent = '○ Offline Mode';
    statusEl.style.color = 'var(--text-muted)';
  }
}

// ─── Seek Mode Toggle ────────────────────────────────────────────────────────

function setSeekMode(mode) {
  seekMode = mode;
  gaugeBtn.classList.toggle('active', mode === 'gauge');
  visionBtn.classList.toggle('active', mode === 'vision');
  analyzeBtn.disabled = !currentImageData;
}

// ─── Image Handling ───────────────────────────────────────────────────────────

let currentImageData = null;

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      currentImageData = { src: e.target.result, width: img.naturalWidth, height: img.naturalHeight };
      displaySeekImage();
      analyzeBtn.disabled = false;
      showToast('Image loaded', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function loadImageFromUrl(url) {
  // Fetch as blob to avoid CORS issues with <img>
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      currentImageData = { src: reader.result, width: img.naturalWidth, height: img.naturalHeight };
      displaySeekImage();
      analyzeBtn.disabled = false;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(blob);
}

function displaySeekImage() {
  if (!currentImageData) return;
  resultImg.src = currentImageData.src;
  resultPreview.classList.remove('hidden');
  resultOverlay.classList.add('hidden');
  resultStats.classList.add('hidden');
}

function loadDemoImage() {
  // Generate a demo skyline with known secret
  const demoSecret = 'MEET AT DAWN';
  const { svg } = encodeSkylineSvg(demoSecret);
  currentSvg = svg;
  currentSecret = demoSecret;

  // Render to canvas
  const canvas = $('render-canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    currentCanvasUrl = dataUrl;
    currentImageData = { src: dataUrl, width: img.naturalWidth, height: img.naturalHeight };
    displaySeekImage();
    analyzeBtn.disabled = false;
    // Show in seek preview
    displaySeekImage();
  };
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// ─── Encode ──────────────────────────────────────────────────────────────────

async function handleEncode() {
  const secret = secretInput.value.trim();
  if (!secret) {
    setStatus(encodeStatus, 'err');
    encodeStatus.dataset.err = 'Please enter a message';
    return;
  }

  encodeBtn.disabled = true;
  setStatus(encodeStatus, 'info');
  encodeStatus.dataset.info = 'Generating skyline...';

  try {
    const step = parseInt(stepSlider.value);
    const result = encodeSkylineSvg(secret, { step });
    currentSvg = result.svg;
    currentSecret = result.text;

    // Render to canvas
    const canvas = $('render-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(result.svg)))}`;
    });

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    currentCanvasUrl = canvas.toDataURL('image/png');

    // Update UI
    skylineImg.src = currentCanvasUrl;
    skylinePreview.classList.remove('hidden');
    skylineSvgCode.textContent = result.svg;
    skylineSvgWrap.classList.remove('hidden');
    encodeMeta.classList.remove('hidden');
    encodeActions.classList.remove('hidden');

    // Update meta
    $('meta-symbols').textContent = result.text;
    $('meta-buildings').textContent = result.plan.length;
    $('meta-step').textContent = `${step}px`;
    $('meta-size').textContent = `${canvas.width}×${canvas.height}`;

    setStatus(encodeStatus, 'ok');
    encodeStatus.dataset.ok = `Encoded ${result.text.length} symbols into ${result.plan.length} buildings`;

    showToast('Skyline generated!', 'success');
  } catch (err) {
    setStatus(encodeStatus, 'err');
    encodeStatus.dataset.err = err.message || 'Encoding failed';
    showToast('Encoding failed', 'error');
  } finally {
    encodeBtn.disabled = false;
  }
}

// ─── Seek / Analyze ──────────────────────────────────────────────────────────

async function handleAnalyze() {
  if (!currentImageData) return;

  analyzeBtn.disabled = true;
  setStatus(analyzeStatus, 'info');
  analyzeStatus.dataset.info = seekMode === 'gauge' ? 'Analyzing pixels...' : 'Sending to AI vision...';

  try {
    if (seekMode === 'gauge') {
      await analyzeWithGauge();
    } else {
      await analyzeWithVision();
    }
  } catch (err) {
    setStatus(analyzeStatus, 'err');
    analyzeStatus.dataset.err = err.message || 'Analysis failed';
    showToast('Analysis failed', 'error');
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function analyzeWithGauge() {
  // Convert image data URL to raw pixels
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = currentImageData.src;
  });

  const canvas = $('render-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  // Run the blind detector
  const result = analysePixels(data, width, height, 4);

  // Update UI
  resultStats.classList.remove('hidden');
  scoreBar.style.width = `${Math.min(100, result.score * 100)}%`;
  scoreVal.textContent = result.score.toFixed(3);

  if (result.score >= 0.85) {
    detectionResult.textContent = '✓ Message Detected';
    detectionResult.className = 'result-badge pass';
    decodedBox.classList.remove('hidden');
    decodedText.textContent = result.text || '(empty)';
  } else if (result.score >= 0.5) {
    detectionResult.textContent = '~ Weak Signal';
    detectionResult.className = 'result-badge warn';
    if (result.text) {
      decodedBox.classList.remove('hidden');
      decodedText.textContent = result.text;
    }
  } else {
    detectionResult.textContent = '✗ No Message Found';
    detectionResult.className = 'result-badge fail';
    decodedBox.classList.add('hidden');
  }

  // Show details
  detailDetails.classList.remove('hidden');
  detectionDetail.innerHTML = `
    <dl>
      <dt>Objects found</dt><dd>${result.objects?.length ?? 0}</dt>
      <dt>Ground row</dt><dd>${result.groundRow ?? '—'}</dt>
      <dt>Fit step</dt><dd>${result.fit?.step?.toFixed(2) ?? '—'}</dt>
      <dt>Snap rate</dt><dd>${result.fit?.snapRate?.toFixed(2) ?? '—'}</dt>
      <dt>Residual</dt><dd>${result.fit?.residual?.toFixed(3) ?? '—'}</dt>
      <dt>Reason</dt><dd>${result.reason}</dd>
    </dl>
  `;

  // Draw overlay
  drawDetectionOverlay(result);

  setStatus(analyzeStatus, 'ok');
  analyzeStatus.dataset.ok = result.score >= 0.85 ? `Score ${result.score.toFixed(3)} — message detected` : 'No significant signal';
  showToast(result.score >= 0.85 ? 'Message detected!' : 'No message found', result.score >= 0.85 ? 'success' : 'error');
}

function drawDetectionOverlay(result) {
  if (!result.objects || result.objects.length === 0) return;

  const img = new Image();
  img.src = currentImageData.src;
  img.onload = () => {
    const canvas = overlayCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Get ground row position (normalized)
    const groundY = (result.groundRow / img.naturalHeight) * canvas.height;

    // Draw buildings
    ctx.strokeStyle = 'rgba(255, 208, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 208, 0, 0.15)';

    for (const obj of result.objects) {
      const x = (obj.x0 / img.naturalWidth) * canvas.width;
      const w = ((obj.x1 - obj.x0) / img.naturalWidth) * canvas.width;
      const h = (obj.height / img.naturalHeight) * canvas.height;
      const y = groundY - h;

      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      // Label with height
      ctx.fillStyle = 'rgba(255, 208, 0, 0.9)';
      ctx.font = '10px monospace';
      ctx.fillText(`h=${obj.height}`, x + 2, y + 12);
      ctx.fillStyle = 'rgba(255, 208, 0, 0.15)';
    }

    // Draw ground line
    ctx.strokeStyle = 'rgba(255, 208, 0, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    resultOverlay.classList.remove('hidden');
  };
}

async function analyzeWithVision() {
  if (!apiKey) {
    setStatus(analyzeStatus, 'err');
    analyzeStatus.dataset.err = 'Please connect with Pollen first';
    showToast('Connect with Pollen to use AI vision', 'error');
    return;
  }

  // Prepare the prompt
  const prompt = `Analyze this image for hidden steganographic messages. Specifically, look for:
- Building heights that encode letters (A=1..Z=26)
- Any patterns in structural elements that might carry encoded information
- Report what you find or confirm nothing is hidden.

Return ONLY the hidden message if found, or "NO MESSAGE FOUND" if nothing is detected.`;

  try {
    // Upload image to Pollinations
    const base64Img = currentImageData.src.split(',')[1];
    const resp = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'anthropic/claude-fable-5.1',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: currentImageData.src } }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const message = data.choices?.[0]?.message?.content || '(no response)';

    // Update UI
    resultStats.classList.remove('hidden');
    visionBox.classList.remove('hidden');
    visionText.textContent = message;
    decodedBox.classList.add('hidden');

    // Try to extract a code-like message
    const codeMatch = message.match(/\b[A-Z0-9\s]{3,}\b/);
    if (codeMatch) {
      detectionResult.textContent = '~ AI Found Possible Message';
      detectionResult.className = 'result-badge warn';
      decodedBox.classList.remove('hidden');
      decodedText.textContent = codeMatch[0].trim();
    } else {
      detectionResult.textContent = '~ AI Vision Response';
      detectionResult.className = 'result-badge warn';
    }

    detailDetails.classList.add('hidden');
    setStatus(analyzeStatus, 'ok');
    analyzeStatus.dataset.ok = 'AI vision analysis complete';
    showToast('Analysis complete', 'success');
  } catch (err) {
    setStatus(analyzeStatus, 'err');
    analyzeStatus.dataset.err = err.message;
    showToast('Vision analysis failed', 'error');
  }
}

// ─── Benchmark Table ─────────────────────────────────────────────────────────

// Recovery rates measured by tests/roundtrip.mjs across 21 secrets
// (18/21 recovered at sim>=0.9, uniform across all distortion types).
// The 3 failures are single-character secrets (X, ABC) — too few buildings
// to fit a lattice. All control images score 0 (zero false positives).
const BENCHMARK = [
  { distortion: 'PNG 1×',     png1: 86, png75: 86, png50: 86, jpeg82: 86, jpeg55: 86, jpegResize: 86, blur: 86 },
  { distortion: 'PNG 75%',    png1: 86, png75: 86, png50: 86, jpeg82: 86, jpeg55: 86, jpegResize: 86, blur: 86 },
  { distortion: 'PNG 50%',    png1: 86, png75: 86, png50: 86, jpeg82: 86, jpeg55: 86, jpegResize: 86, blur: 86 },
  { distortion: 'JPEG 82%',   png1: 86, png75: 86, png50: 86, jpeg82: 86, jpeg55: 86, jpegResize: 86, blur: 86 },
  { distortion: 'JPEG 55%',   png1: 86, png75: 86, png50: 86, jpeg82: 86, jpeg55: 86, jpegResize: 86, blur: 86 },
  { distortion: 'JPEG 55% + resize', png1: 86, png75: 86, png50: 86, jpeg82: 86, jpeg55: 86, jpegResize: 86, blur: 86 },
  { distortion: 'Blur 0.6',   png1: 86, png75: 86, png50: 86, jpeg82: 86, jpeg55: 86, jpegResize: 86, blur: 86 },
];

function renderBenchmark() {
  const body = $('benchmark-body');
  if (!body) return;
  body.innerHTML = BENCHMARK.map(r => `
    <tr>
      <td>${r.distortion}</td>
      <td class="pass-cell">${r.png1}%</td>
      <td class="pass-cell">${r.png75}%</td>
      <td class="pass-cell">${r.png50}%</td>
      <td class="pass-cell">${r.jpeg82}%</td>
      <td class="pass-cell">${r.jpeg55}%</td>
      <td class="pass-cell">${r.jpegResize}%</td>
      <td class="pass-cell">${r.blur}%</td>
    </tr>
  `).join('');
}

// ─── Boot ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  init();
  renderBenchmark();
});
