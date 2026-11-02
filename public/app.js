// Pollen Towers — AI-Run Companies
// Quest #17999

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Config ───────────────────────────────────────────────────────────────────
const FLOOR_HEIGHT = 2.5;
const TOTAL_FLOORS  = 12;
const POLLEN_API    = 'https://api.pollinations.ai';

// ─── State ────────────────────────────────────────────────────────────────────
let currentFloor     = 0;
let autoRotate       = false;
let pollenKey        = '';
let companies        = [];
let selectedCompany  = null;
let raycaster, mouse;
let hoveredFloor     = null;
let floorMeshes      = [];
let animating        = false;
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
controls.maxPolarAngle  = Math.PI * 0.48;   // never below horizon
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

// ─── Materials ────────────────────────────────────────────────────────────────
const matConcrete = new THREE.MeshStandardMaterial({ color: 0x3a3f55, roughness: 0.85 });
const matGlass    = new THREE.MeshStandardMaterial({ color: 0x88bbee, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.65 });
const matGround   = new THREE.MeshStandardMaterial({ color: 0x1a2035, roughness: 0.95 });
const matSpire    = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.15 });

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
  const ground    = new THREE.Mesh(groundGeo, matGround);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.isTower = true;
  scene.add(ground);

  // ── Street grid lines (subtle) ────────────────────────────────────────────
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2a3050, transparent: true, opacity: 0.4 });
  [-8, -4, 0, 4, 8].forEach(x => {
    const pts = [new THREE.Vector3(x, 0.02, -50), new THREE.Vector3(x, 0.02, 50)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, lineMat); line.userData.isTower = true; scene.add(line);
  });
  [-8, -4, 0, 4, 8].forEach(z => {
    const pts = [new THREE.Vector3(-50, 0.02, z), new THREE.Vector3(50, 0.02, z)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, lineMat); line.userData.isTower = true; scene.add(line);
  });

  // ── Foundation (wide base) ───────────────────────────────────────────────
  const baseW = 7, baseD = 7;
  const baseGeo  = new THREE.BoxGeometry(baseW, 1.0, baseD);
  const base     = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.9 }));
  base.position.set(0, 0.5, 0);
  base.castShadow = true; base.receiveShadow = true;
  base.userData.isTower = true; scene.add(base);

  // Entrance canopy
  const canopyGeo = new THREE.BoxGeometry(3, 0.15, 2);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.6, roughness: 0.3 });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 1.1, baseD / 2 + 0.8);
  canopy.userData.isTower = true; scene.add(canopy);

  // ── Setback tiers ────────────────────────────────────────────────────────
  // Each tier spans 4 floors, stepping inward
  const tiers = [
    { floors: [0,1,2,3],  halfW: 3.8, halfD: 3.8, yBase: 1.0 },   // ground floors (wide)
    { floors: [4,5,6,7],  halfW: 3.2, halfD: 3.2, yBase: 11.0 },  // mid
    { floors: [8,9,10,11],halfW: 2.6, halfD: 2.6, yBase: 21.0 },  // upper (tapered)
  ];

  tiers.forEach(tier => {
    for (const fi of tier.floors) {
      const isOcc = fi < companies.length;
      const c     = companies[fi];
      const baseY = tier.yBase + fi * FLOOR_HEIGHT;
      const col   = isOcc ? (c?.color ?? 0x34d399) : 0x252a40;

      // Floor slab
      const slabGeo = new THREE.BoxGeometry(tier.halfW * 2, 0.2, tier.halfD * 2);
      const slabMat = new THREE.MeshStandardMaterial({
        color: col, roughness: 0.4, metalness: isOcc ? 0.3 : 0.05,
        emissive: isOcc ? new THREE.Color(col) : new THREE.Color(0x000000),
        emissiveIntensity: isOcc ? 0.2 : 0,
      });
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(0, baseY, 0);
      slab.castShadow = true; slab.receiveShadow = true;
      slab.userData = { floor: fi, isOccupied: isOcc, company: c, isTower: true };
      scene.add(slab);
      floorMeshes.push(slab);

      // Core walls (4 sides)
      const wallH   = FLOOR_HEIGHT - 0.3;
      const wallMat = new THREE.MeshStandardMaterial({
        color: isOcc ? 0x3d4663 : 0x252a40, roughness: 0.7
      });

      // Front & back walls (with window cutouts simulated via inset panels)
      const frontGeo = new THREE.BoxGeometry(tier.halfW * 2, wallH, 0.18);
      [[0, baseY + wallH / 2, tier.halfD]].forEach(([x, y, z]) => {
        const w = new THREE.Mesh(frontGeo, wallMat);
        w.position.set(x, y, z); w.castShadow = true;
        w.userData.isTower = true; scene.add(w);
      });
      [[0, baseY + wallH / 2, -tier.halfD]].forEach(([x, y, z]) => {
        const w = new THREE.Mesh(frontGeo, wallMat);
        w.position.set(x, y, z); w.castShadow = true;
        w.userData.isTower = true; scene.add(w);
      });

      // Side walls
      const sideGeo = new THREE.BoxGeometry(0.18, wallH, tier.halfD * 2);
      [[tier.halfW, baseY + wallH / 2, 0]].forEach(([x, y, z]) => {
        const w = new THREE.Mesh(sideGeo, wallMat);
        w.position.set(x, y, z); w.castShadow = true;
        w.userData.isTower = true; scene.add(w);
      });
      [[-tier.halfW, baseY + wallH / 2, 0]].forEach(([x, y, z]) => {
        const w = new THREE.Mesh(sideGeo, wallMat);
        w.position.set(x, y, z); w.castShadow = true;
        w.userData.isTower = true; scene.add(w);
      });

      // ── Window lights for occupied floors ───────────────────────────────
      if (isOcc) {
        const winColor = c?.color ?? 0x34d399;
        const winMat   = new THREE.MeshStandardMaterial({
          color: winColor, emissive: winColor, emissiveIntensity: 0.8
        });
        const darkWinMat = new THREE.MeshStandardMaterial({
          color: 0x0a0f1e, emissive: 0x0a0f1e, emissiveIntensity: 0.1
        });

        // 3 rows of windows per side
        for (let row = 0; row < 3; row++) {
          const wy = baseY + 0.5 + row * 0.75;
          // Front & back
          for (let w = -1; w <= 1; w++) {
            const isLit = Math.random() > 0.3;
            const wm    = isLit ? winMat : darkWinMat;
            const wg    = new THREE.BoxGeometry(0.7, 0.5, 0.06);
            const mesh  = new THREE.Mesh(wg, wm);
            mesh.position.set(w * 1.3, wy, tier.halfD + 0.09);
            mesh.userData.isTower = true; scene.add(mesh);

            const meshB = mesh.clone();
            meshB.position.z = -tier.halfD - 0.09;
            meshB.userData.isTower = true; scene.add(meshB);
          }
          // Sides
          for (let w = -1; w <= 1; w++) {
            const isLit = Math.random() > 0.3;
            const wm    = isLit ? winMat : darkWinMat;
            const wg    = new THREE.BoxGeometry(0.06, 0.5, 0.7);
            const mesh  = new THREE.Mesh(wg, wm);
            mesh.position.set(tier.halfW + 0.09, wy, w * 1.3);
            mesh.userData.isTower = true; scene.add(mesh);

            const meshB = mesh.clone();
            meshB.position.x = -tier.halfW - 0.09;
            meshB.userData.isTower = true; scene.add(meshB);
          }
        }
      }
    }
  });

  // ── Rooftop structure ───────────────────────────────────────────────────
  const roofY    = 1.0 + 11 * FLOOR_HEIGHT + 0.2;
  const roofGeo  = new THREE.BoxGeometry(5.6, 0.4, 5.6);
  const roofMat  = new THREE.MeshStandardMaterial({ color: 0x2a2f45, roughness: 0.8 });
  const roof     = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, roofY, 0);
  roof.castShadow = true;
  roof.userData.isTower = true; scene.add(roof);

  // Rooftop mechanical box
  const mechGeo = new THREE.BoxGeometry(1.5, 1.0, 1.5);
  const mechMat = new THREE.MeshStandardMaterial({ color: 0x3a3f55, roughness: 0.7 });
  const mech = new THREE.Mesh(mechGeo, mechMat);
  mech.position.set(0, roofY + 0.7, 0);
  mech.castShadow = true;
  mech.userData.isTower = true; scene.add(mech);

  // ── Spire ──────────────────────────────────────────────────────────────
  const spireH   = 5;
  const spireGeo = new THREE.ConeGeometry(0.25, spireH, 6);
  const spire    = new THREE.Mesh(spireGeo, matSpire);
  spire.position.set(0, roofY + 1.0 + spireH / 2, 0);
  spire.castShadow = true;
  spire.userData.isTower = true; scene.add(spire);

  // Beacon light on spire
  const beacon = new THREE.PointLight(0xfbbf24, 2, 25);
  beacon.position.set(0, roofY + 1.0 + spireH, 0);
  beacon.userData.isTower = true; scene.add(beacon);

  // ── Entrance pillars ───────────────────────────────────────────────────
  const pillarGeo = new THREE.BoxGeometry(0.4, 3, 0.4);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4a5070, metalness: 0.5, roughness: 0.4 });
  [[1.5, 1.5, baseD / 2 + 0.5], [-1.5, 1.5, baseD / 2 + 0.5]].forEach(([x, y, z]) => {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(x, y, z); p.castShadow = true;
    p.userData.isTower = true; scene.add(p);
  });

  // ── Surrounding buildings (smaller context) ─────────────────────────────
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
    const bMat = new THREE.MeshStandardMaterial({ color: 0x1e2235, roughness: 0.9 });
    const bMesh = new THREE.Mesh(bGeo, bMat);
    bMesh.position.set(b.x, b.h / 2, b.z);
    bMesh.castShadow = true; bMesh.receiveShadow = true;
    bMesh.userData.isTower = true; scene.add(bMesh);

    // Tiny window lights
    const tinyWinMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.5
    });
    for (let wy = 1.5; wy < b.h - 1; wy += 1.8) {
      for (let wx = -1; wx <= 1; wx++) {
        if (Math.random() > 0.5) {
          const wg = new THREE.BoxGeometry(0.5, 0.6, 0.05);
          const wm = new THREE.Mesh(wg, Math.random() > 0.6 ? tinyWinMat :
            new THREE.MeshStandardMaterial({ color: 0x0a0f1e }));
          const wMesh = new THREE.Mesh(wg, wm);
          wMesh.position.set(b.x + wx * 1.2, wy, b.z + b.d / 2 + 0.03);
          wMesh.userData.isTower = true; scene.add(wMesh);
        }
      }
    }
  });

  // ── Landscape trees ────────────────────────────────────────────────────
  const treePositions = [
    [-6, 0, baseD / 2 + 4], [6, 0, baseD / 2 + 4],
    [-baseW / 2 - 3, 0, 0], [baseW / 2 + 3, 0, 0],
  ];
  treePositions.forEach(([tx, ty, tz]) => {
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    const trunk    = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(tx, 1, tz); trunk.castShadow = true;
    trunk.userData.isTower = true; scene.add(trunk);

    const canopyGeo = new THREE.SphereGeometry(1.2, 8, 6);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1a3a2a, roughness: 0.9 });
    const canopy    = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(tx, 2.8, tz); canopy.castShadow = true;
    canopy.userData.isTower = true; scene.add(canopy);
  });

  // ── Stars ──────────────────────────────────────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(3000);
  for (let i = 0; i < 3000; i++) starPos[i] = (Math.random() - 0.5) * 200;
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 1));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.7 });
  const stars   = new THREE.Points(starGeo, starMat);
  stars.userData.isTower = true; scene.add(stars);
}

// ─── Starfield ────────────────────────────────────────────────────────────────
// (handled inline in createTower above)

// ─── Companies ────────────────────────────────────────────────────────────────
function loadCompanies() {
  try {
    const saved = localStorage.getItem('pollen-towers-companies');
    if (saved) { companies = JSON.parse(saved); return; }
  } catch (e) { /* ignore corrupt data */ }

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
  prevBtn.disabled       = currentFloor === 0;
  nextBtn.disabled       = currentFloor >= TOTAL_FLOORS - 1;
  document.querySelectorAll('.dot').forEach((d, i) => {
    d.classList.toggle('active', TOTAL_FLOORS - 1 - i === currentFloor);
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function goToFloor(index) {
  if (animating) return;
  index = Math.max(0, Math.min(TOTAL_FLOORS - 1, index));
  currentFloor = index;

  const targetY = 1.0 + index * FLOOR_HEIGHT + 3;
  cameraPosStart  = camera.position.clone();
  cameraTargetStart = controls.target.clone();
  const endTarget = new THREE.Vector3(0, targetY, 0);
  const endPos    = new THREE.Vector3(22, targetY + 6, 22);
  const duration  = 500;
  const start     = performance.now();
  animating       = true;

  function animate(now) {
    const t  = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;
    camera.position.lerpVectors(cameraPosStart, endPos, ease);
    controls.target.lerpVectors(cameraTargetStart, endTarget, ease);
    controls.update();
    if (t < 1) requestAnimationFrame(animate); else animating = false;
  }
  requestAnimationFrame(animate);
  updateNav();
  if (currentFloor < companies.length) { selectedCompany = companies[currentFloor]; showOfficeDetail(selectedCompany); }
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal()  { companyModal.hidden = false; appEl.classList.add('modal-open'); directories.forEach(d => d.classList.add('dimmed')); }
function closeModal() { companyModal.hidden = true;  appEl.classList.remove('modal-open'); directories.forEach(d => d.classList.remove('dimmed')); selectedCompany = null; }

function showOfficeDetail(company) {
  const pending = (company.jobs || []).filter(j => j.status === 'pending');
  const done    = (company.jobs || []).filter(j => j.status === 'done');
  officeDetail.innerHTML = `
    <h3>${esc(company.name)}</h3>
    <div class="office-floor">Floor ${company.floor + 1} · ${company.status}</div>
    <div class="detail-section"><div class="detail-label">About</div><div class="detail-value">${esc(company.brief)}</div></div>
    <div class="detail-section"><div class="detail-label">Agents</div><div>${(company.agents||[]).map(a=>`<span class="agent-tag">${esc(a)}</span>`).join('')}</div></div>
    ${pending.length ? `<div class="detail-section"><div class="detail-label">Pending Jobs (${pending.length})</div>${
      pending.map(j => `<div class="job-item pending"><div class="job-status">⏳ ${esc(j.title)}</div><div class="job-actions">
        <button class="btn btn-approve" data-action="approve" data-id="${esc(String(j.id||j.title))}">Approve</button>
        <button class="btn btn-decline"  data-action="decline"  data-id="${esc(String(j.id||j.title))}">Decline</button></div></div>`).join('')}
    </div>` : ''}
    ${done.length ? `<div class="detail-section"><div class="detail-label">Completed</div>${
      done.slice(-3).map(j => `<div class="job-item done">✓ ${esc(j.title)}</div>`).join('')}</div>` : ''}
  `;
  openModal();
}

// ─── Job actions ──────────────────────────────────────────────────────────────
function approveJob(companyId, jobId) {
  const c = companies.find(x => x.id === companyId);
  if (!c) return;
  const j = (c.jobs || []).find(x => (x.id || x.title) === jobId);
  if (j) j.status = 'done';
  saveCompanies(); showOfficeDetail(c); renderDirectory(); toast(`Approved: ${j?.title || jobId}`);
}
function declineJob(companyId, jobId) {
  const c = companies.find(x => x.id === companyId);
  if (!c) return;
  c.jobs = (c.jobs || []).filter(j => (j.id || j.title) !== jobId);
  saveCompanies(); showOfficeDetail(c); renderDirectory(); toast('Job declined');
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
      try { localStorage.removeItem('pollen-towers-pollen-key'); } catch(e) {}
      connectBtn.textContent = 'Connect Pollen';
      toast('Pollen disconnected'); return;
    }
    const key = prompt('Enter your Pollen API key (get one at enter.pollinations.ai/keys):');
    if (key) {
      pollenKey = key.trim();
      try { localStorage.setItem('pollen-towers-pollen-key', pollenKey); } catch(e) {}
      connectBtn.textContent = '✓ Connected';
      toast('Pollen connected!');
    }
  });

  // Load saved key
  try {
    const saved = localStorage.getItem('pollen-towers-pollen-key');
    if (saved) { pollenKey = saved; connectBtn.textContent = '✓ Connected'; }
  } catch(e) {}

  // Canvas click → select floor (only when modal closed)
  canvas.addEventListener('click', e => {
    if (companyModal.hidden) return;
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorMeshes);
    if (hits.length) goToFloor(hits[0].object.userData.floor);
  });

  // Hover highlight
  canvas.addEventListener('mousemove', e => {
    if (!companyModal.hidden) return;
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(floorMeshes);
    if (hoveredFloor) {
      hoveredFloor.material.emissiveIntensity = hoveredFloor.userData.isOccupied ? 0.2 : 0;
    }
    if (hits.length) {
      hoveredFloor = hits[0].object;
      hoveredFloor.material.emissiveIntensity = 0.5;
      canvas.style.cursor = 'pointer';
    } else {
      hoveredFloor = null;
      canvas.style.cursor = 'grab';
    }
  });

  // Modal close
  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  // Job buttons via delegation
  officeDetail.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const companyId = parseInt(btn.dataset.companyId || btn.getAttribute('data-company') || selectedCompany?.id);
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

  // ── Keyboard ──────────────────────────────────────────────────────────────
  // NOTE: Arrow keys navigate floors (↑ = higher floor, ↓ = lower floor).
  // When modal is open they are blocked from navigating the tower.
  window.addEventListener('keydown', e => {
    const modalOpen = !companyModal.hidden;
    if (modalOpen) {
      if (e.key === 'Escape') closeModal();
      return; // Don't navigate floors while modal is open
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); goToFloor(currentFloor + 1); }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); goToFloor(currentFloor - 1); }
    if (e.key === 'r' || e.key === 'R') toggleAutoRotate();
  });

  // Rent button
  rentBtn.addEventListener('click', handleRent);
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
  const nameInput = document.getElementById('company-name');
  const briefInput = document.getElementById('company-brief');
  const name = nameInput.value.trim();
  const brief = briefInput.value.trim();
  if (!name || !brief) { rentStatus.textContent = 'Please fill in both fields.'; rentStatus.className = 'rent-status error'; return; }
  rentStatus.textContent = 'Creating your company…'; rentStatus.className = 'rent-status loading'; rentBtn.disabled = true;
  try {
    let agents = ['Worker', 'Manager'];
    if (pollenKey) {
      try { agents = await generateAgents(name, brief); } catch(e) { agents = ['Worker', 'Manager']; }
    }
    const colors = [0x34d399, 0x60a5fa, 0xf472b6, 0xfbbf24, 0xa78bfa, 0xfb923c, 0x22d3ee];
    const newCompany = {
      id: Date.now(), name, brief,
      status: 'active',
      color: colors[Math.floor(Math.random() * colors.length)],
      agents,
      floor: companies.length,
      jobs: [{ id: `job-${Date.now()}`, title: 'Initial research task', status: 'pending' }]
    };
    companies.push(newCompany);
    saveCompanies();
    createTower();
    buildFloorDots();
    goToFloor(companies.length - 1);
    renderDirectory();
    nameInput.value = ''; briefInput.value = '';
    rentStatus.textContent = 'Office rented! Welcome to the tower.';
    rentStatus.className = 'rent-status success';
    toast(`Welcome ${name} to Floor ${newCompany.floor + 1}!`);
  } catch(err) {
    rentStatus.textContent = `Failed: ${err.message}`;
    rentStatus.className = 'rent-status error';
  } finally { rentBtn.disabled = false; }
}

async function generateAgents(name, brief) {
  const prompt = `You are creating AI agents for a new company called "${name}". The company does: "${brief}".
Return exactly 2-3 agent names in a JSON array like: ["AgentName1", "AgentName2"]. Only output the JSON array.`;
  const res = await fetch(`${POLLEN_API}/openai/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pollenKey}` },
    body: JSON.stringify({ model: 'anthropic/claude-haiku-3.5', messages: [{ role: 'user', content: prompt }], max_tokens: 100 })
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || data?.choices?.[0]?.text?.trim() || '[]';
  try { return JSON.parse(text); } catch { return text.split(',').map(s=>s.trim()).filter(Boolean).slice(0,3); }
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

// ─── Tick agents ──────────────────────────────────────────────────────────────
function tickAgents() {
  let changed = false;
  companies.forEach(c => {
    if (c.status !== 'active') return;
    (c.jobs || []).forEach(j => {
      if (j.status === 'pending' && Math.random() < 0.03) {
        j.status = 'done'; changed = true;
        if (Math.random() < 0.5) {
          c.jobs.push({ id: `job-${Date.now()}-${Math.random()}`, title: randomTask(), status: 'pending' });
        }
      }
    });
  });
  if (changed) { saveCompanies(); buildFloorDots(); renderDirectory(); if (selectedCompany) showOfficeDetail(selectedCompany); }
}
function randomTask() {
  return ['Analyze competitor landscape','Generate marketing copy','Write documentation',
          'Process customer feedback','Optimize codebase','Create design mockup',
          'Research market trends','Draft investor pitch','Build API endpoint','Review PRs'
         ][Math.floor(Math.random() * 10)];
}
setInterval(tickAgents, 5000);

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
} catch (e) {
  console.error('Init failed:', e);
  appEl.innerHTML = `<div style="padding:40px;color:#f87171;font-family:sans-serif;">
    <h2>Failed to load</h2><p>${esc(e.message)}</p><pre>${esc(e.stack||'')}</pre></div>`;
}