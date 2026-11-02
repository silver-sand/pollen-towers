// Pollen Towers — AI-Run Companies
// Quest #17999

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const FLOOR_HEIGHT = 3;
const FLOOR_SIZE = 4;
const TOTAL_FLOORS = 12;
const POLLEN_API = 'https://api.pollinations.ai';
const POLLINATIONS_KEY = import.meta.env?.POLLEN_KEY || '';

// ─── State ────────────────────────────────────────────────────────────────────
let currentFloor = 0;
let autoRotate = false;
let pollenKey = '';
let companies = [];
let decisions = [];
let selectedCompany = null;
let raycaster, mouse, hoveredFloor = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas = document.getElementById('tower-canvas');
const floorLabel = document.getElementById('floor-label');
const prevBtn = document.getElementById('prev-floor');
const nextBtn = document.getElementById('next-floor');
const floorDots = document.getElementById('floor-dots');
const rotateBtn = document.getElementById('rotate-btn');
const connectBtn = document.getElementById('connect-btn');
const decisionPanel = document.getElementById('decision-queue');
const decisionCount = document.getElementById('decision-count');
const decisionList = document.getElementById('decision-list');
const companyGrid = document.getElementById('company-grid');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const rentBtn = document.getElementById('rent-btn');
const rentStatus = document.getElementById('rent-status');
const companyModal = document.getElementById('office-modal');
const officeDetail = document.getElementById('office-detail');
const toastContainer = document.getElementById('toast-container');

// ─── Three.js setup ───────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f18);
scene.fog = new THREE.FogExp2(0x0d0f18, 0.018);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(14, 12, 14);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 8;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.85;
controls.target.set(0, 15, 0);

// ─── Lights ───────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.0);
dirLight.position.set(10, 25, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 60;
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 35;
dirLight.shadow.camera.bottom = -5;
scene.add(dirLight);

const pointLight = new THREE.PointLight(0xfbbf24, 0.5, 30);
pointLight.position.set(-5, 20, 5);
scene.add(pointLight);

// ─── Raycaster ────────────────────────────────────────────────────────────────
raycaster = new THREE.Raycaster();
mouse = new THREE.Vector2();

// ─── Build tower ──────────────────────────────────────────────────────────────
const floorMeshes = [];
const floorGroup = new THREE.Group();
scene.add(floorGroup);

function createTower() {
  // Foundation / ground
  const groundGeo = new THREE.BoxGeometry(20, 0.5, 20);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -0.25;
  ground.receiveShadow = true;
  scene.add(ground);

  // Elevator core (central column)
  const coreGeo = new THREE.BoxGeometry(1.2, TOTAL_FLOORS * FLOOR_HEIGHT, 1.2);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x2a2f45,
    roughness: 0.3,
    metalness: 0.8,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = (TOTAL_FLOORS * FLOOR_HEIGHT) / 2;
  core.castShadow = true;
  core.receiveShadow = true;
  scene.add(core);

  // Create floors
  for (let i = 0; i < TOTAL_FLOORS; i++) {
    const isOccupied = i < companies.length;
    const company = companies[i];
    const color = isOccupied
      ? (company.color || 0x34d399)
      : 0x1e2235;

    // Floor slab
    const floorGeo = new THREE.BoxGeometry(FLOOR_SIZE, 0.3, FLOOR_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: isOccupied ? 0.3 : 0.1,
      emissive: isOccupied ? color : 0x000000,
      emissiveIntensity: isOccupied ? 0.15 : 0,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    const y = 0.15 + i * FLOOR_HEIGHT;
    floorMesh.position.y = y;
    floorMesh.castShadow = true;
    floorMesh.receiveShadow = true;
    floorMesh.userData = { floor: i, isOccupied, company };
    floorGroup.add(floorMesh);
    floorMeshes.push(floorMesh);

    if (isOccupied && company) {
      // Windows / light strips on occupied floors
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.6,
      });

      for (let side = 0; side < 4; side++) {
        for (let w = 0; w < 3; w++) {
          const winGeo = new THREE.BoxGeometry(0.6, 0.8, 0.05);
          const win = new THREE.Mesh(winGeo, windowMat);
          const offset = (w - 1) * 1.1;
          if (side === 0) { win.position.set(offset, y + 0.5, FLOOR_SIZE / 2 + 0.03); }
          else if (side === 1) { win.position.set(offset, y + 0.5, -FLOOR_SIZE / 2 - 0.03); }
          else if (side === 2) { win.position.set(FLOOR_SIZE / 2 + 0.03, y + 0.5, offset); win.rotation.y = Math.PI / 2; }
          else { win.position.set(-FLOOR_SIZE / 2 - 0.03, y + 0.5, offset); win.rotation.y = Math.PI / 2; }
          floorGroup.add(win);
        }
      }

      // Roof overhang
      const roofGeo = new THREE.BoxGeometry(FLOOR_SIZE + 0.4, 0.15, FLOOR_SIZE + 0.4);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.6 });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = y + 1.0;
      roof.castShadow = true;
      floorGroup.add(roof);
    }
  }

  // Spire on top
  const spireGeo = new THREE.ConeGeometry(0.3, 3, 8);
  const spireMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.2 });
  const spire = new THREE.Mesh(spireGeo, spireMat);
  spire.position.y = TOTAL_FLOORS * FLOOR_HEIGHT + 1.5;
  spire.castShadow = true;
  scene.add(spire);

  // Spire light
  const spireLight = new THREE.PointLight(0xfbbf24, 1, 15);
  spireLight.position.copy(spire.position);
  scene.add(spireLight);
}

// ─── Starfield ────────────────────────────────────────────────────────────────
function createStars() {
  const starGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(2000);
  for (let i = 0; i < 2000; i++) {
    positions[i] = (Math.random() - 0.5) * 150;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 1));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(starGeo, starMat));
}

// ─── Initialize ───────────────────────────────────────────────────────────────
function init() {
  createStars();
  loadCompanies();
  createTower();
  buildFloorDots();
  updateNav();
  setupEvents();
  render();
}

// ─── Companies ────────────────────────────────────────────────────────────────
function loadCompanies() {
  const saved = localStorage.getItem('pollen-towers-companies');
  if (saved) {
    companies = JSON.parse(saved);
    return;
  }
  // Seed with demo companies
  companies = [
    { id: 1, name: 'Nexus Research', brief: 'AI-powered market research and competitive analysis for startups.', status: 'active', color: 0x34d399,
      agents: ['ResearchBot', 'Analyst'], floor: 1,
      jobs: [{ title: 'Competitive report for fintech sector', status: 'done' }, { title: 'Market sizing: AI dev tools', status: 'pending' }] },
    { id: 2, name: 'CodeForge Studios', brief: 'Rapid prototyping and MVP development using agentic workflows.', status: 'active', color: 0x60a5fa,
      agents: ['DevAgent', 'QA-Agent'], floor: 2,
      jobs: [{ title: 'Build dashboard for SaaS client', status: 'pending' }, { title: 'API integration tests', status: 'done' }] },
    { id: 3, name: 'GreenLeaf Analytics', brief: 'Sustainability metrics tracking and ESG reporting automation.', status: 'idle', color: 0x34d399,
      agents: ['DataAgent', 'ReportBot'], floor: 3,
      jobs: [{ title: 'Q4 ESG report generation', status: 'pending' }] },
    { id: 4, name: 'LinguaBridge', brief: 'Real-time translation and localization for global content creators.', status: 'active', color: 0xf472b6,
      agents: ['TranslateBot', 'CulturalAgent'], floor: 4,
      jobs: [{ title: 'Translate blog into 5 languages', status: 'done' }, { title: 'Subtitling for YouTube channel', status: 'pending' }] },
    { id: 5, name: 'FinStack AI', brief: 'Automated financial modeling and investment risk assessment.', status: 'active', color: 0xfbbf24,
      agents: ['FinanceBot', 'RiskAgent'], floor: 5,
      jobs: [{ title: 'Portfolio risk analysis', status: 'pending' }, { title: 'Monthly revenue forecast', status: 'done' }] },
  ];
  saveCompanies();
}

function saveCompanies() {
  localStorage.setItem('pollen-towers-companies', JSON.stringify(companies));
}

// ─── Floor dots ───────────────────────────────────────────────────────────────
function buildFloorDots() {
  floorDots.innerHTML = '';
  for (let i = TOTAL_FLOORS - 1; i >= 0; i--) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i < companies.length ? ' occupied' : '') + (i === currentFloor ? ' active' : '');
    dot.title = `Floor ${i + 1}${i < companies.length ? ': ' + companies[i].name : ' (empty)'}`;
    dot.addEventListener('click', () => goToFloor(i));
    floorDots.appendChild(dot);
  }
}

function updateNav() {
  floorLabel.textContent = `Floor ${currentFloor + 1}`;
  prevBtn.disabled = currentFloor === 0;
  nextBtn.disabled = currentFloor >= TOTAL_FLOORS - 1;

  document.querySelectorAll('.dot').forEach((d, i) => {
    d.classList.toggle('active', TOTAL_FLOORS - 1 - i === currentFloor);
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function goToFloor(index) {
  currentFloor = Math.max(0, Math.min(TOTAL_FLOORS - 1, index));
  const targetY = currentFloor * FLOOR_HEIGHT + 2;
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endTarget = new THREE.Vector3(0, targetY, 0);
  const endPos = new THREE.Vector3(14, targetY + 5, 14);
  const duration = 600;
  const start = performance.now();

  function animateCamera(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(startPos, endPos, ease);
    controls.target.lerpVectors(startTarget, endTarget, ease);
    controls.update();
    if (t < 1) requestAnimationFrame(animateCamera);
  }
  requestAnimationFrame(animateCamera);
  updateNav();
  if (currentFloor < companies.length) {
    selectedCompany = companies[currentFloor];
    showOfficeDetail(selectedCompany);
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  prevBtn.addEventListener('click', () => goToFloor(currentFloor - 1));
  nextBtn.addEventListener('click', () => goToFloor(currentFloor + 1));
  rotateBtn.addEventListener('click', toggleAutoRotate);

  // BYOP connect
  connectBtn.addEventListener('click', async () => {
    if (pollenKey) {
      pollenKey = '';
      localStorage.removeItem('pollen-towers-pollen-key');
      connectBtn.textContent = 'Connect Pollen';
      toast('Pollen disconnected');
      return;
    }
    // Try polling the <polli-connect> component
    const el = document.querySelector('polli-connect');
    if (el) {
      try {
        const res = await el.authWithPollen();
        if (res?.access_token) {
          pollenKey = res.access_token;
          localStorage.setItem('pollen-towers-pollen-key', pollenKey);
          connectBtn.textContent = '✓ Connected';
          toast('Pollen connected!');
        }
      } catch (e) {
        // Fallback: prompt user
        const key = prompt('Enter your Pollen API key (get one at enter.pollinations.ai/keys):');
        if (key) {
          pollenKey = key.trim();
          localStorage.setItem('pollen-towers-pollen-key', pollenKey);
          connectBtn.textContent = '✓ Connected';
          toast('Pollen connected!');
        }
      }
    } else {
      const key = prompt('Enter your Pollen API key (get one at enter.pollinations.ai/keys):');
      if (key) {
        pollenKey = key.trim();
        localStorage.setItem('pollen-towers-pollen-key', pollenKey);
        connectBtn.textContent = '✓ Connected';
        toast('Pollen connected!');
      }
    }
  });

  // Load saved key
  const saved = localStorage.getItem('pollen-towers-pollen-key');
  if (saved) {
    pollenKey = saved;
    connectBtn.textContent = '✓ Connected';
  }

  // Click on canvas
  canvas.addEventListener('click', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorMeshes);
    if (hits.length > 0) {
      const idx = hits[0].object.userData.floor;
      goToFloor(idx);
    }
  });

  // Hover effect
  canvas.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorMeshes);
    if (hoveredFloor) {
      hoveredFloor.material.emissiveIntensity = hoveredFloor.userData.isOccupied ? 0.15 : 0;
    }
    if (hits.length > 0) {
      hoveredFloor = hits[0].object;
      hoveredFloor.material.emissiveIntensity = 0.4;
      canvas.style.cursor = 'pointer';
    } else {
      hoveredFloor = null;
      canvas.style.cursor = 'grab';
    }
  });

  // Rent button
  rentBtn.addEventListener('click', handleRent);

  // Modal close
  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => { companyModal.hidden = true; });
  });

  // Search & sort
  searchInput.addEventListener('input', renderDirectory);
  sortSelect.addEventListener('change', renderDirectory);

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') goToFloor(currentFloor - 1);
    if (e.key === 'ArrowDown' || e.key === 's') goToFloor(currentFloor + 1);
    if (e.key === 'Escape') { companyModal.hidden = true; }
  });
}

// ─── Auto rotate ──────────────────────────────────────────────────────────────
function toggleAutoRotate() {
  autoRotate = !autoRotate;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 1.5;
  rotateBtn.textContent = autoRotate ? '⏸ Stop' : '↻ Auto';
  rotateBtn.classList.toggle('btn-ghost', autoRotate);
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function render() {
  requestAnimationFrame(render);
  controls.update();
  renderer.render(scene, camera);
}

// ─── Directory ────────────────────────────────────────────────────────────────
function renderDirectory() {
  const query = searchInput.value.toLowerCase();
  const sort = sortSelect.value;

  let filtered = companies.filter(c =>
    c.name.toLowerCase().includes(query) || c.brief.toLowerCase().includes(query)
  );

  filtered.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'floor') return a.floor - b.floor;
    if (sort === 'status') return a.status.localeCompare(b.status);
    return 0;
  });

  companyGrid.innerHTML = '';
  if (filtered.length === 0) {
    companyGrid.innerHTML = '<div class="empty">No companies found. Rent the next office!</div>';
    return;
  }
  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'company-card';
    card.innerHTML = `
      <div class="card-top">
        <span class="card-name">${esc(c.name)}</span>
        <span class="card-floor">Floor ${c.floor + 1}</span>
      </div>
      <div class="card-brief">${esc(c.brief)}</div>
      <div class="card-status status-${c.status}">
        <span class="status-dot"></span> ${c.status === 'active' ? 'Agents active' : 'Idle'}
      </div>
    `;
    card.addEventListener('click', () => { goToFloor(c.floor); showOfficeDetail(c); });
    companyGrid.appendChild(card);
  });
}

// ─── Office detail ────────────────────────────────────────────────────────────
function showOfficeDetail(company) {
  selectedCompany = company;
  const pendingJobs = company.jobs?.filter(j => j.status === 'pending') || [];
  const doneJobs = company.jobs?.filter(j => j.status === 'done') || [];

  officeDetail.innerHTML = `
    <h3>${esc(company.name)}</h3>
    <div class="office-floor">Floor ${company.floor + 1} · ${company.status}</div>
    <div class="detail-section">
      <div class="detail-label">About</div>
      <div class="detail-value">${esc(company.brief)}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Agents</div>
      <div>${(company.agents || []).map(a => `<span class="agent-tag">${esc(a)}</span>`).join('')}</div>
    </div>
    ${pendingJobs.length > 0 ? `
    <div class="detail-section">
      <div class="detail-label">Pending Jobs (${pendingJobs.length})</div>
      ${pendingJobs.map(j => `
        <div class="job-item pending">
          <div class="job-status">⏳ ${esc(j.title)}</div>
          <button class="btn btn-approve" onclick="approveJob(${company.id}, '${esc(j.id || j.title)}')">Approve</button>
          <button class="btn btn-decline" onclick="declineJob(${company.id}, '${esc(j.id || j.title)}')">Decline</button>
        </div>
      `).join('')}
    </div>
    ` : ''}
    ${doneJobs.length > 0 ? `
    <div class="detail-section">
      <div class="detail-label">Completed Jobs</div>
      ${doneJobs.slice(-3).map(j => `
        <div class="job-item done">✓ ${esc(j.title)}</div>
      `).join('')}
    </div>
    ` : ''}
  `;
  companyModal.hidden = false;
}

// ─── Job actions ──────────────────────────────────────────────────────────────
window.approveJob = function(companyId, jobId) {
  const company = companies.find(c => c.id === companyId);
  if (!company) return;
  const job = (company.jobs || []).find(j => (j.id || j.title) === jobId);
  if (job) job.status = 'done';
  saveCompanies();
  showOfficeDetail(company);
  renderDirectory();
  toast(`Approved: ${job?.title || jobId}`);
};

window.declineJob = function(companyId, jobId) {
  const company = companies.find(c => c.id === companyId);
  if (!company) return;
  company.jobs = (company.jobs || []).filter(j => (j.id || j.title) !== jobId);
  saveCompanies();
  showOfficeDetail(company);
  renderDirectory();
  toast('Job declined');
};

// ─── Rent office ──────────────────────────────────────────────────────────────
async function handleRent() {
  const nameInput = document.getElementById('company-name');
  const briefInput = document.getElementById('company-brief');
  const name = nameInput.value.trim();
  const brief = briefInput.value.trim();

  if (!name || !brief) {
    rentStatus.textContent = 'Please fill in both fields.';
    rentStatus.className = 'rent-status error';
    return;
  }

  rentStatus.textContent = 'Creating your company...';
  rentStatus.className = 'rent-status loading';
  rentBtn.disabled = true;

  try {
    // Use Pollinations API to generate company agents
    let agents = ['Worker', 'Manager'];
    if (pollenKey) {
      agents = await generateAgents(name, brief);
    }

    const colorChoices = [0x34d399, 0x60a5fa, 0xf472b6, 0xfbbf24, 0xa78bfa, 0xfb923c, 0x22d3ee];
    const newCompany = {
      id: Date.now(),
      name,
      brief,
      status: 'active',
      color: colorChoices[Math.floor(Math.random() * colorChoices.length)],
      agents,
      floor: companies.length,
      jobs: [
        { id: `job-${Date.now()}`, title: 'Initial research task', status: 'pending' }
      ]
    };

    companies.push(newCompany);
    saveCompanies();
    createTower();
    buildFloorDots();
    goToFloor(companies.length - 1);
    renderDirectory();

    nameInput.value = '';
    briefInput.value = '';
    rentStatus.textContent = 'Office rented! Welcome to the tower.';
    rentStatus.className = 'rent-status success';
    toast(`Welcome ${name} to Floor ${newCompany.floor + 1}!`);
  } catch (err) {
    rentStatus.textContent = `Failed: ${err.message}`;
    rentStatus.className = 'rent-status error';
  } finally {
    rentBtn.disabled = false;
  }
}

async function generateAgents(name, brief) {
  const prompt = `You are creating AI agents for a new company called "${name}". The company does: "${brief}".
Return exactly 2-3 agent names in a JSON array format like: ["AgentName1", "AgentName2"].
Only output the JSON array, nothing else.`;

  const res = await fetch(`${POLLEN_API}/openai/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pollenKey}` },
    body: JSON.stringify({ model: 'anthropic/claude-haiku-3.5', messages: [{ role: 'user', content: prompt }], max_tokens: 100 })
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.text?.trim() || '';
  try {
    return JSON.parse(text);
  } catch {
    // Fallback parsed names
    return text.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3) || ['Worker', 'Manager'];
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── Escape HTML ──────────────────────────────────────────────────────────────
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Tick agents (simulate work) ─────────────────────────────────────────────
function tickAgents() {
  let changed = false;
  companies.forEach(c => {
    if (c.status !== 'active') return;
    (c.jobs || []).forEach(j => {
      if (j.status === 'pending' && Math.random() < 0.03) {
        j.status = 'done';
        changed = true;
        // Add a new pending job after completing
        if (Math.random() < 0.5) {
          c.jobs.push({
            id: `job-${Date.now()}-${Math.random()}`,
            title: randomTask(),
            status: 'pending'
          });
        }
      }
    });
  });
  if (changed) {
    saveCompanies();
    buildFloorDots();
    renderDirectory();
    if (selectedCompany) showOfficeDetail(selectedCompany);
  }
}

function randomTask() {
  const tasks = [
    'Analyze competitor landscape',
    'Generate marketing copy',
    'Write documentation',
    'Process customer feedback',
    'Optimize codebase',
    'Create design mockup',
    'Research market trends',
    'Draft investor pitch',
    'Build API endpoint',
    'Review pull requests',
  ];
  return tasks[Math.floor(Math.random() * tasks.length)];
}

setInterval(tickAgents, 5000);

// ─── Start ────────────────────────────────────────────────────────────────────
init();
renderDirectory();
goToFloor(0);
