// Pollen Towers — AI-Run Companies
// Quest #17999
// FIX: Every mesh gets its own material instance. No sharing. No emissive bugs.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clearSession, completeSignIn, generateCompanyPlan, getSession, runCompany, startSignIn } from './pollen.js';
import { floorY, roofY as calculateRoofY, stepFloor } from './tower-layout.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const FLOOR_HEIGHT = 2.5;
const TOTAL_FLOORS  = 12;

// ─── State ────────────────────────────────────────────────────────────────────
let currentFloor     = 0;
let autoRotate       = false;
let companies        = [];
let renting           = false;
let runningCompanies  = new Set();
let selectedCompany  = null;
let raycaster, mouse;
let hoveredFloor     = null;
let floorMeshes      = [];
let navigationAnimation = 0;
let cameraPosStart, cameraTargetStart;

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas         = document.getElementById('tower-canvas');
const floorLabel     = document.getElementById('floor-label');
const prevBtn        = document.getElementById('prev-floor');
const nextBtn        = document.getElementById('next-floor');
const floorDots      = document.getElementById('floor-dots');
const rotateBtn      = document.getElementById('rotate-btn');
const connectBtn     = document.getElementById('connect-btn');
const companyGrid    = document.getElementById('company-grid');
const searchInput    = document.getElementById('search-input');
const sortSelect     = document.getElementById('sort-select');
const rentBtn        = document.getElementById('rent-btn');
const rentStatus     = document.getElementById('rent-status');
const companyModal   = document.getElementById('office-modal');
const officeDetail   = document.getElementById('office-detail');
const modalBackdrop  = document.getElementById('modal-backdrop');
const modalCloseBtn  = document.getElementById('modal-close');
const toastContainer = document.getElementById('toast-container');
const directories    = document.querySelectorAll('.panel');
const appEl          = document.getElementById('app');

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.fog = new THREE.FogExp2(0x0b1a30, 0.006);

raycaster = new THREE.Raycaster();
mouse     = new THREE.Vector2();

// ─── Camera + Controls ────────────────────────────────────────────────────────
camera.position.set(22, 28, 28);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;
controls.minDistance     = 12;
controls.maxDistance     = 55;
controls.maxPolarAngle  = Math.PI * 0.48;
controls.target.set(0, 14, 0);

// ─── Lights ───────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x334466, 0.8));

const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
sun.position.set(15, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near   = 1;
sun.shadow.camera.far    = 80;
sun.shadow.camera.left   = -25;
sun.shadow.camera.right  =  25;
sun.shadow.camera.top    =  40;
sun.shadow.camera.bottom = -10;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x8899cc, 0.4);
fill.position.set(-10, 20, -10);
scene.add(fill);

const skyLight = new THREE.PointLight(0xfbbf24, 0.6, 40);
skyLight.position.set(-8, 35, 8);
scene.add(skyLight);

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Make a fresh material every time — NEVER share between meshes
function makeMat(params) {
  return new THREE.MeshStandardMaterial(params);
}

function addTowerObj(obj) {
  obj.userData.isTower = true;
  scene.add(obj);
}

// ─── Build Tower ──────────────────────────────────────────────────────────────
function clearTower() {
  const toRemove = [];
  scene.traverse(c => { if (c.userData?.isTower) toRemove.push(c); });
  toRemove.forEach(o => scene.remove(o));
  floorMeshes = [];
}

function createTower() {
  clearTower();

  // ── Ground plane ──────────────────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(120, 120);
  const ground    = new THREE.Mesh(groundGeo, makeMat({ color: 0x1a2035, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  addTowerObj(ground);

  // ── Street grid lines ─────────────────────────────────────────────────────
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2a3050, transparent: true, opacity: 0.4 });
  [-8, -4, 0, 4, 8].forEach(x => {
    const pts = [new THREE.Vector3(x, 0.02, -50), new THREE.Vector3(x, 0.02, 50)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, lineMat);
    addTowerObj(line);
  });
  [-8, -4, 0, 4, 8].forEach(z => {
    const pts = [new THREE.Vector3(-50, 0.02, z), new THREE.Vector3(50, 0.02, z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, lineMat);
    addTowerObj(line);
  });

  // ── Foundation ────────────────────────────────────────────────────────────
  const baseW = 7, baseD = 7;
  const baseGeo  = new THREE.BoxGeometry(baseW, 1.0, baseD);
  const base     = new THREE.Mesh(baseGeo, makeMat({ color: 0x2a2f45, roughness: 0.9 }));
  base.position.set(0, 0.5, 0);
  base.castShadow = true; base.receiveShadow = true;
  addTowerObj(base);

  // Entrance canopy
  const canopyGeo = new THREE.BoxGeometry(3, 0.15, 2);
  const canopy    = new THREE.Mesh(canopyGeo, makeMat({ color: 0xfbbf24, metalness: 0.6, roughness: 0.3 }));
  canopy.position.set(0, 1.1, baseD / 2 + 0.8);
  addTowerObj(canopy);

  // ── Setback tiers ────────────────────────────────────────────────────────
  const tiers = [
    { floors: [0,1,2,3],  halfW: 3.8, halfD: 3.8 },
    { floors: [4,5,6,7],  halfW: 3.2, halfD: 3.2 },
    { floors: [8,9,10,11],halfW: 2.6, halfD: 2.6 },
  ];

  tiers.forEach(tier => {
    for (const fi of tier.floors) {
      const isOcc = fi < companies.length;
      const c     = companies[fi];
      const baseY = floorY(fi, FLOOR_HEIGHT);
      const col   = isOcc ? (c?.color ?? 0x34d399) : 0x252a40;

      // Floor slab — OWN material
      const slabGeo = new THREE.BoxGeometry(tier.halfW * 2, 0.2, tier.halfD * 2);
      const slabMat = makeMat({
        color: col, roughness: 0.4, metalness: isOcc ? 0.3 : 0.05
      });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(0, baseY, 0);
      slab.castShadow = true; slab.receiveShadow = true;
      slab.userData = { floor: fi, isOccupied: isOcc, company: c };
      addTowerObj(slab);
      floorMeshes.push(slab);

      // ── Walls — EACH wall gets its own material ─────────────────────────
      const wallH = FLOOR_HEIGHT - 0.3;
      const wallColor = isOcc ? 0x3d4663 : 0x252a40;

      // Front wall
      const frontGeo = new THREE.BoxGeometry(tier.halfW * 2, wallH, 0.18);
      const frontMat = makeMat({ color: wallColor, roughness: 0.7 });
      const frontWall = new THREE.Mesh(frontGeo, frontMat);
      frontWall.position.set(0, baseY + wallH / 2, tier.halfD);
      frontWall.castShadow = true;
      addTowerObj(frontWall);

      // Back wall
      const backMat = makeMat({ color: wallColor, roughness: 0.7 });
      const backWall = new THREE.Mesh(frontGeo, backMat);
      backWall.position.set(0, baseY + wallH / 2, -tier.halfD);
      backWall.castShadow = true;
      addTowerObj(backWall);

      // Side walls
      const sideGeo = new THREE.BoxGeometry(0.18, wallH, tier.halfD * 2);
      const rightMat = makeMat({ color: wallColor, roughness: 0.7 });
      const rightWall = new THREE.Mesh(sideGeo, rightMat);
      rightWall.position.set(tier.halfW, baseY + wallH / 2, 0);
      rightWall.castShadow = true;
      addTowerObj(rightWall);

      const leftMat = makeMat({ color: wallColor, roughness: 0.7 });
      const leftWall = new THREE.Mesh(sideGeo, leftMat);
      leftWall.position.set(-tier.halfW, baseY + wallH / 2, 0);
      leftWall.castShadow = true;
      addTowerObj(leftWall);

      // ── Window lights for occupied floors — EACH window gets its own material ──
      if (isOcc) {
        const winColor = c?.color ?? 0x34d399;

        for (let row = 0; row < 3; row++) {
          const wy = baseY + 0.5 + row * 0.75;

          // Front windows
          for (let w = -1; w <= 1; w++) {
            const lit = Math.random() > 0.3;
            const winCol = lit ? winColor : 0x0a0f1e;
            const wg = new THREE.BoxGeometry(0.7, 0.5, 0.06);
            const wm = makeMat({ color: winCol, roughness: lit ? 0.1 : 0.9, metalness: lit ? 0.5 : 0.0 });
            const mesh = new THREE.Mesh(wg, wm);
            mesh.position.set(w * 1.3, wy, tier.halfD + 0.09);
            addTowerObj(mesh);

            // Back window — separate material
            const bwm = makeMat({ color: winCol, roughness: lit ? 0.1 : 0.9, metalness: lit ? 0.5 : 0.0 });
            const backMesh = new THREE.Mesh(wg, bwm);
            backMesh.position.set(w * 1.3, wy, -tier.halfD - 0.09);
            addTowerObj(backMesh);
          }

          // Side windows
          for (let w = -1; w <= 1; w++) {
            const lit = Math.random() > 0.3;
            const winCol = lit ? winColor : 0x0a0f1e;
            const wg = new THREE.BoxGeometry(0.06, 0.5, 0.7);
            const wm = makeMat({ color: winCol, roughness: lit ? 0.1 : 0.9, metalness: lit ? 0.5 : 0.0 });
            const mesh = new THREE.Mesh(wg, wm);
            mesh.position.set(tier.halfW + 0.09, wy, w * 1.3);
            addTowerObj(mesh);

            // Back side window
            const bwm = makeMat({ color: winCol, roughness: lit ? 0.1 : 0.9, metalness: lit ? 0.5 : 0.0 });
            const backMesh = new THREE.Mesh(wg, bwm);
            backMesh.position.set(-tier.halfW - 0.09, wy, w * 1.3);
            addTowerObj(backMesh);
          }
        }
      }
    }
  });

  // ── Rooftop ─────────────────────────────────────────────────────────────
  const towerRoofY = calculateRoofY(TOTAL_FLOORS, FLOOR_HEIGHT);
  const roofGeo = new THREE.BoxGeometry(5.6, 0.4, 5.6);
  const roofMat = makeMat({ color: 0x2a2f45, roughness: 0.8 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, towerRoofY, 0);
  roof.castShadow = true;
  addTowerObj(roof);

  // Mechanical box
  const mechGeo = new THREE.BoxGeometry(1.5, 1.0, 1.5);
  const mechMat = makeMat({ color: 0x3a3f55, roughness: 0.7 });
  const mech = new THREE.Mesh(mechGeo, mechMat);
  mech.position.set(0, towerRoofY + 0.8, 0);
  mech.castShadow = true;
  addTowerObj(mech);

  // ── Spire ────────────────────────────────────────────────────────────────
  const spireH  = 5;
  const spireGeo = new THREE.ConeGeometry(0.25, spireH, 6);
  const spireMat = makeMat({ color: 0xfbbf24, metalness: 0.9, roughness: 0.15 });
  const spire    = new THREE.Mesh(spireGeo, spireMat);
  spire.position.set(0, towerRoofY + 1.0 + spireH / 2, 0);
  spire.castShadow = true;
  addTowerObj(spire);

  // Beacon
  const beacon = new THREE.PointLight(0xfbbf24, 2, 25);
  beacon.position.set(0, towerRoofY + 1.0 + spireH, 0);
  addTowerObj(beacon);

  // ── Entrance pillars ─────────────────────────────────────────────────────
  const pillarGeo = new THREE.BoxGeometry(0.4, 3, 0.4);
  [[1.5, baseD / 2 + 0.5], [-1.5, baseD / 2 + 0.5]].forEach(([x, z]) => {
    const pMat = makeMat({ color: 0x4a5070, metalness: 0.5, roughness: 0.4 });
    const p = new THREE.Mesh(pillarGeo, pMat);
    p.position.set(x, 1.5, z); p.castShadow = true;
    addTowerObj(p);
  });

  // ── Surrounding buildings ────────────────────────────────────────────────
  const surroundingBuildings = [
    { x: -12, z: -8,  w: 4, h: 10, d: 4  },
    { x:  12, z: -6,  w: 3, h: 14, d: 5  },
    { x: -10, z:  10, w: 5, h:  7, d: 4  },
    { x:  14, z:  12, w: 3, h:  9, d: 3  },
    { x:  -8, z: -16, w: 4, h: 12, d: 4  },
    { x:  10, z: -18, w: 5, h:  8, d: 3  },
  ];
  surroundingBuildings.forEach(b => {
    const bGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const bMat = makeMat({ color: 0x1e2235, roughness: 0.9 });
    const bMesh = new THREE.Mesh(bGeo, bMat);
    bMesh.position.set(b.x, b.h / 2, b.z);
    bMesh.castShadow = true; bMesh.receiveShadow = true;
    addTowerObj(bMesh);

    // Window lights
    for (let wy = 1.5; wy < b.h - 1; wy += 1.8) {
      for (let wx = -1; wx <= 1; wx++) {
        if (Math.random() > 0.5) {
          const wg = new THREE.BoxGeometry(0.5, 0.6, 0.05);
          const isWarm = Math.random() > 0.6;
          const wColor = isWarm ? 0xfbbf24 : 0x88bbee;
          const wm = makeMat({ color: wColor, roughness: 0.3, metalness: 0.2 });
          const wMesh = new THREE.Mesh(wg, wm);
          wMesh.position.set(b.x + wx * 1.2, wy, b.z + b.d / 2 + 0.03);
          addTowerObj(wMesh);
        }
      }
    }
  });

  // ── Trees ────────────────────────────────────────────────────────────────
  const treePositions = [
    [-6, 0, baseD / 2 + 4], [6, 0, baseD / 2 + 4],
    [-baseW / 2 - 3, 0, 0], [baseW / 2 + 3, 0, 0],
  ];
  treePositions.forEach(([tx, , tz]) => {
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2, 6);
    const trunkMat = makeMat({ color: 0x3d2b1f });
    const trunk    = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(tx, 1, tz); trunk.castShadow = true;
    addTowerObj(trunk);

    const canopyGeo = new THREE.SphereGeometry(1.2, 8, 6);
    const canopyMat = makeMat({ color: 0x1a3a2a, roughness: 0.9 });
    const canopy    = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(tx, 2.8, tz); canopy.castShadow = true;
    addTowerObj(canopy);
  });

  // ── Stars ────────────────────────────────────────────────────────────────
  const starCount = 1000;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3 + 0] = (Math.random() - 0.5) * 200;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 200;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.7 });
  const stars   = new THREE.Points(starGeo, starMat);
  addTowerObj(stars);
}

// ─── Companies ────────────────────────────────────────────────────────────────
function loadCompanies() {
  try {
    const saved = localStorage.getItem('pollen-towers-companies');
    if (saved) { companies = JSON.parse(saved); return; }
  } catch (e) {}

  companies = [
    { id: 1, name: 'Nexus Research',  brief: 'AI-powered market research and competitive analysis for startups.',
      status: 'active', color: 0x34d399, floor: 0,
      agents: ['ResearchBot', 'Analyst'],
      jobs: [{ id: 'j1', title: 'Competitive report for fintech sector', status: 'done' },
             { id: 'j2', title: 'Market sizing: AI dev tools',            status: 'pending' }] },
    { id: 2, name: 'CodeForge Studios', brief: 'Rapid prototyping and MVP development using agentic workflows.',
      status: 'active', color: 0x60a5fa, floor: 1,
      agents: ['DevAgent', 'QA-Agent'],
      jobs: [{ id: 'j3', title: 'Build dashboard for SaaS client', status: 'pending' },
             { id: 'j4', title: 'API integration tests',            status: 'done' }] },
    { id: 3, name: 'GreenLeaf Analytics', brief: 'Sustainability metrics tracking and ESG reporting automation.',
      status: 'idle',   color: 0x34d399, floor: 2,
      agents: ['DataAgent', 'ReportBot'],
      jobs: [{ id: 'j5', title: 'Q4 ESG report generation', status: 'pending' }] },
    { id: 4, name: 'LinguaBridge',   brief: 'Real-time translation and localization for global content creators.',
      status: 'active', color: 0xf472b6, floor: 3,
      agents: ['TranslateBot', 'CulturalAgent'],
      jobs: [{ id: 'j6', title: 'Translate blog into 5 languages', status: 'done' },
             { id: 'j7', title: 'Subtitling for YouTube channel',  status: 'pending' }] },
    { id: 5, name: 'FinStack AI',    brief: 'Automated financial modeling and investment risk assessment.',
      status: 'active', color: 0xfbbf24, floor: 4,
      agents: ['FinanceBot', 'RiskAgent'],
      jobs: [{ id: 'j8', title: 'Portfolio risk analysis',  status: 'pending' },
             { id: 'j9', title: 'Monthly revenue forecast', status: 'done' }] },
  ];
  saveCompanies();
}

function saveCompanies() {
  try { localStorage.setItem('pollen-towers-companies', JSON.stringify(companies)); } catch (e) {}
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
  prevBtn.disabled       = currentFloor >= TOTAL_FLOORS - 1;
  nextBtn.disabled       = currentFloor === 0;
  document.querySelectorAll('.dot').forEach((d, i) => {
    d.classList.toggle('active', TOTAL_FLOORS - 1 - i === currentFloor);
  });
}

function scrollRailToFloor() {
  const active = floorDots.querySelector('.dot.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function goToFloor(index) {
  index = Math.max(0, Math.min(TOTAL_FLOORS - 1, index));
  const animationId = ++navigationAnimation;
  currentFloor = index;

  const targetY = floorY(index, FLOOR_HEIGHT) + FLOOR_HEIGHT / 2 + 3;
  cameraPosStart  = camera.position.clone();
  cameraTargetStart = controls.target.clone();
  const endTarget = new THREE.Vector3(0, targetY, 0);
  const endPos    = new THREE.Vector3(22, targetY + 6, 22);
  const duration  = 500;
  const start     = performance.now();

  function animate(now) {
    if (animationId !== navigationAnimation) return;
    const t  = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
    camera.position.lerpVectors(cameraPosStart, endPos, ease);
    controls.target.lerpVectors(cameraTargetStart, endTarget, ease);
    controls.update();
    if (t < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  updateNav();
  scrollRailToFloor();
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal()  { companyModal.hidden = false; appEl.classList.add('modal-open'); directories.forEach(d => d.classList.add('dimmed')); }
function closeModal() { companyModal.hidden = true;  appEl.classList.remove('modal-open'); directories.forEach(d => d.classList.remove('dimmed')); selectedCompany = null; }

function showOfficeDetail(company) {
  selectedCompany = company;
  const pending = (company.jobs || []).filter(j => j.status === 'pending');
  const done    = (company.jobs || []).filter(j => j.status === 'done');
  officeDetail.innerHTML = `
    <h3>${esc(company.name)}</h3>
    <div class="office-floor">Floor ${company.floor + 1} · ${company.status}</div>
    <div class="detail-section"><div class="detail-label">About</div><div class="detail-value">${esc(company.brief)}</div></div>
    <div class="detail-section"><div class="detail-label">Agents</div><div>${(company.agents||[]).map(a=>`<span class="agent-tag">${esc(a)}</span>`).join('')}</div></div>
    ${getSession() ? `<div class="detail-section"><button class="btn btn-pollen" data-action="run-company" data-company="${esc(String(company.id))}" ${runningCompanies.has(company.id) ? 'disabled' : ''}>${runningCompanies.has(company.id) ? 'Agents working…' : 'Run today with Pollen'}</button></div>` : ''}
    ${pending.length ? `<div class="detail-section"><div class="detail-label">Pending Jobs (${pending.length})</div>${
      pending.map(j => `<div class="job-item pending"><div class="job-status">⏳ ${esc(j.title)}</div>${j.result ? `<div>${esc(j.result)}</div>` : ''}<div class="job-actions">
        <button class="btn btn-approve" data-action="approve" data-company="${esc(String(company.id))}" data-id="${esc(String(j.id||j.title))}">Approve</button>
        <button class="btn btn-decline"  data-action="decline"  data-company="${esc(String(company.id))}" data-id="${esc(String(j.id||j.title))}">Decline</button></div></div>`).join('')}
    </div>` : ''}
    ${done.length ? `<div class="detail-section"><div class="detail-label">Completed</div>${
      done.slice(-3).map(j => `<div class="job-item done">✓ ${esc(j.title)}${j.result ? `<div>${esc(j.result)}</div>` : ''}</div>`).join('')}</div>` : ''}
  `;
  openModal();
}

// ─── Job actions ──────────────────────────────────────────────────────────────
function approveJob(companyId, jobId) {
  const c = companies.find(x => String(x.id) === String(companyId));
  if (!c) return;
  const j = (c.jobs || []).find(x => (x.id || x.title) === jobId);
  if (j) j.status = 'done';
  saveCompanies(); showOfficeDetail(c); renderDirectory(); toast(`Approved: ${j?.title || jobId}`);
}
function declineJob(companyId, jobId) {
  const c = companies.find(x => String(x.id) === String(companyId));
  if (!c) return;
  c.jobs = (c.jobs || []).filter(j => (j.id || j.title) !== jobId);
  saveCompanies(); showOfficeDetail(c); renderDirectory(); toast('Job declined');
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  // Remove the legacy manually pasted key; OAuth credentials are tab-scoped only.
  try { localStorage.removeItem('pollen-towers-pollen-key'); } catch {}
  // Floor 1 is the base; moving up increases the floor index.
  prevBtn.addEventListener('click', () => goToFloor(stepFloor(currentFloor, 1, TOTAL_FLOORS)));
  nextBtn.addEventListener('click', () => goToFloor(stepFloor(currentFloor, -1, TOTAL_FLOORS)));
  let wheelTimer = 0;
  document.getElementById('floor-nav').addEventListener('wheel', e => {
    e.preventDefault();
    // Scroll down = go down a floor, matching the ▼ button. Coalesce a
    // trackpad flick (many wheel events in one gesture) into one move.
    const direction = -Math.sign(e.deltaY);
    if (!direction || wheelTimer) return;
    wheelTimer = setTimeout(() => { wheelTimer = 0; }, 250);
    goToFloor(stepFloor(currentFloor, direction, TOTAL_FLOORS));
  }, { passive: false });
  rotateBtn.addEventListener('click', toggleAutoRotate);

  // Pollinations OAuth returns the short-lived user key in the fragment.
  connectBtn.addEventListener('click', async () => {
    if (getSession()) {
      clearSession();
      connectBtn.textContent = 'Connect Pollen';
      renderDirectory();
      if (selectedCompany) showOfficeDetail(selectedCompany);
      toast('Pollen disconnected');
      return;
    }
    connectBtn.disabled = true;
    try {
      await startSignIn();
    } catch (error) {
      rentStatus.textContent = `Could not start sign-in: ${error.message}`;
      rentStatus.className = 'rent-status error';
    } finally {
      connectBtn.disabled = false;
    }
  });

  completeSignIn().then(authResult => {
    if (authResult === 'ok') toast('Pollen connected for this tab.');
    else if (authResult) toast(`Pollen sign-in ${authResult.replaceAll('-', ' ')}.`, 'error');
    if (getSession()) connectBtn.textContent = '✓ Connected';
  }).catch(error => {
    console.error('Pollinations sign-in failed:', error);
    toast('Pollinations sign-in failed. Please try again.', 'error');
  });

  // Canvas click → select floor (only when modal is CLOSED)
  canvas.addEventListener('click', e => {
    if (!companyModal.hidden) return;  // FIX: modal open = ignore clicks
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorMeshes);
    if (hits.length) goToFloor(hits[0].object.userData.floor);
  });

  // Hover highlight — store original colors to restore later
  const originalEmissive = new WeakMap();
  canvas.addEventListener('mousemove', e => {
    if (!companyModal.hidden) return;
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorMeshes);

    if (hoveredFloor) {
      // Restore original color
      const orig = originalEmissive.get(hoveredFloor);
      if (orig) hoveredFloor.material.color.setHex(orig);
      hoveredFloor = null;
      canvas.style.cursor = 'grab';
    }

    if (hits.length) {
      const floor = hits[0].object;
      hoveredFloor = floor;
      // Store original, then brighten
      if (!originalEmissive.has(floor)) originalEmissive.set(floor, floor.material.color.getHex());
      floor.material.color.setHex(0x7799cc);
      canvas.style.cursor = 'pointer';
    }
  });

  // Modal close
  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  // Job buttons via delegation
  officeDetail.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const companyId = btn.dataset.company || selectedCompany?.id;
    const jobId     = btn.dataset.id;
    if (btn.dataset.action === 'approve') approveJob(companyId, jobId);
    else if (btn.dataset.action === 'decline') declineJob(companyId, jobId);
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
  window.addEventListener('keydown', e => {
    const modalOpen = !companyModal.hidden;
    if (modalOpen) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); goToFloor(stepFloor(currentFloor, 1, TOTAL_FLOORS)); }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); goToFloor(stepFloor(currentFloor, -1, TOTAL_FLOORS)); }
    if (e.key === 'r' || e.key === 'R') toggleAutoRotate();
  });

  rentBtn.addEventListener('click', handleRent);
  officeDetail.addEventListener('click', async e => {
    const button = e.target.closest('[data-action="run-company"]');
    if (!button) return;
    const company = companies.find(item => String(item.id) === button.dataset.company);
    if (company) await handleRunCompany(company);
  });
  document.getElementById('company-name').addEventListener('keydown', e => { if (e.key === 'Enter') handleRent(); });
  document.getElementById('company-brief').addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) handleRent(); });
}

// ─── Auto rotate ──────────────────────────────────────────────────────────────
function toggleAutoRotate() {
  autoRotate = !autoRotate;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 1.5;
  rotateBtn.textContent = autoRotate ? '⏸ Stop' : '↻ Auto';
  rotateBtn.classList.toggle('active', autoRotate);
}

// ─── Render loop ──────────────────────────────────────────────────────────────
function render() {
  requestAnimationFrame(render);
  controls.update();
  renderer.render(scene, camera);
}

// ─── Directory ────────────────────────────────────────────────────────────────
function renderDirectory() {
  const query = searchInput.value.toLowerCase();
  const sort  = sortSelect.value;
  let filtered = companies.filter(c =>
    c.name.toLowerCase().includes(query) || c.brief.toLowerCase().includes(query)
  );
  filtered.sort((a, b) => {
    if (sort === 'name')    return a.name.localeCompare(b.name);
    if (sort === 'floor')   return a.floor - b.floor;
    if (sort === 'status')  return a.status.localeCompare(b.status);
    return 0;
  });
  companyGrid.innerHTML = '';
  if (!filtered.length) {
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
      <div class="card-status status-${c.status}"><span class="status-dot"></span> ${c.status === 'active' ? 'Agents active' : 'Idle'}</div>
    `;
    card.addEventListener('click', () => { goToFloor(c.floor); showOfficeDetail(c); });
    companyGrid.appendChild(card);
  });
}

// ─── Rent office ──────────────────────────────────────────────────────────────
async function handleRent() {
  if (renting) return;
  const nameInput = document.getElementById('company-name');
  const briefInput = document.getElementById('company-brief');
  const name = nameInput.value.trim();
  const brief = briefInput.value.trim();
  if (!name || !brief) { rentStatus.textContent = 'Please fill in both fields.'; rentStatus.className = 'rent-status error'; return; }
  if (name.length < 2 || brief.length < 10) { rentStatus.textContent = 'Use a company name of 2+ characters and a brief of at least 10.'; rentStatus.className = 'rent-status error'; return; }
  if (!getSession()) {
    rentStatus.textContent = 'Sign in with Pollinations first. Your company form is still here.';
    rentStatus.className = 'rent-status error';
    connectBtn.focus();
    return;
  }
  if (companies.length >= TOTAL_FLOORS) { rentStatus.textContent = 'The tower is full.'; rentStatus.className = 'rent-status error'; return; }

  renting = true;
  rentStatus.textContent = 'Using your Pollen to build a team…';
  rentStatus.className = 'rent-status loading';
  rentBtn.disabled = true;
  try {
    const plan = await generateCompanyPlan(name, brief);
    const colors = [0x34d399, 0x60a5fa, 0xf472b6, 0xfbbf24, 0xa78bfa, 0xfb923c, 0x22d3ee];
    const companyId = `company-${Date.now()}`;
    const newCompany = {
      id: companyId, name, brief, model: null,
      status: 'active',
      color: colors[Math.floor(Math.random() * colors.length)],
      agents: plan.agents,
      floor: companies.length,
      jobs: plan.jobs,
    };
    companies.push(newCompany);
    saveCompanies();
    createTower();
    buildFloorDots();
    goToFloor(companies.length - 1);
    renderDirectory();
    nameInput.value = ''; briefInput.value = '';
    rentStatus.textContent = 'Team created. Run your company from its office to generate real work.';
    rentStatus.className = 'rent-status success';
    toast(`Welcome ${name} to Floor ${newCompany.floor + 1}!`);
  } catch (error) {
    rentStatus.textContent = `Failed: ${error.message}`;
    rentStatus.className = 'rent-status error';
  } finally {
    renting = false;
    rentBtn.disabled = false;
  }
}

async function handleRunCompany(company) {
  if (runningCompanies.has(company.id)) return;
  runningCompanies = new Set(runningCompanies).add(company.id);
  showOfficeDetail(company);
  try {
    const jobs = await runCompany(company);
    company.jobs = [...(company.jobs || []), ...jobs];
    saveCompanies();
    renderDirectory();
    toast(`${company.name} finished ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}.`);
  } catch (error) {
    rentStatus.textContent = `Could not run ${company.name}: ${error.message}`;
    rentStatus.className = 'rent-status error';
  } finally {
    runningCompanies = new Set(runningCompanies);
    runningCompanies.delete(company.id);
    if (selectedCompany?.id === company.id) showOfficeDetail(company);
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

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Pollinations work runs only when the owner explicitly starts it; no fake background jobs.

// ─── Init ─────────────────────────────────────────────────────────────────────
try {
  loadCompanies();
  createTower();
  buildFloorDots();
  updateNav();
  setupEvents();
  render();
  renderDirectory();
  goToFloor(0);
  console.log('Pollen Towers initialized —', companies.length, 'companies, tower rendered');
} catch (e) {
  console.error('Init failed:', e);
  appEl.innerHTML = `<div style="padding:40px;color:#f87171;font-family:sans-serif;">
    <h2>Failed to load</h2><p>${esc(e.message)}</p><pre>${esc(e.stack||'')}</pre></div>`;
}
