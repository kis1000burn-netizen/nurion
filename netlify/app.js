/**
 * NURION 3D 로비
 * - 인트로 후 LOBBY_MODEL_PATH(GLB) 로드. LOBBY_PROCESSING: minimal(기본)=원본만, full=기존 후처리 전체
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// GLB에서 삭제할 오브젝트 이름 패턴 (사람·검은 판떼기·텍스트)
const HIDE_PEOPLE_PATTERN = /armature|human|person|character|body|man|woman|people|head|hair|arm|leg|hand|foot|torso|face|skin|rig|bone|limb|cap|shirt|pants|shoe|avatar|figure|shadow|silhouette|panel|slab|outline|black/;
const HIDE_TEXT_PATTERN = /^text\.|text$/i;
const HIDE_FLOOR_LINE_MAT_PATTERN = /road_line|line_neon/;
const DEBUG_LOG_GLB_NAMES = false;
const HIDE_OBJECT_NAMES_EXACT = [];

/** PC·모바일 공통 진입 영상 */
const INTRO_SHARED = 'assets/intro.mp4';
/** PC 3D 로비 바닥(파란 면) 동영상 텍스처 */
const VIDEO_AD_PATH = 'assets/intro.mp4';
/** 모바일: 인트로 후 재생할 2.5D 로비 영상(추후 `assets/lobby_2d5.mp4`로 교체) */
const LOBBY_25D_VIDEO = 'assets/lobby_2d5.mp4';

/**
 * 3D 로비 GLB — 경로는 이 값만 수정하면 됩니다. 배포 폴더 기준 `netlify/assets/nurion_lobby.glb`.
 * @type {string}
 */
const LOBBY_MODEL_PATH = 'assets/nurion_lobby.glb';

/**
 * minimal: GLB를 씬에만 올림(그림자). 데스크 치환·퍼지·바닥 영상 없음 → 새 모델 검증·교체용.
 * full: 기존 전체 후처리(데스크 라벨, 바닥 동영상, Plane 제거 등).
 * @type {'minimal' | 'full'}
 */
const LOBBY_PROCESSING = 'minimal';

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|Windows Phone/i.test(navigator.userAgent || '');
}

// 행성 이미지 경로 (5개 데스크에 중복 없이 적용)
const PLANET_TEXTURES = [
  'assets/textures/planets/jupiter.png',
  'assets/textures/planets/mars.png',
  'assets/textures/planets/moon.png',
  'assets/textures/planets/saturn_ring.png',
  'assets/textures/planets/venus.png',
];

// 5개 데스크 모니터 화면 (Plane035, 040, 047, 054, 061)
const DESK_LABELS = [
  { name: 'Plane035', label: '기업컨설팅', planetIndex: 0, cameraPos: {x: -6, y: 3.5, z: 6}, cameraTarget: {x: -2, y: 2, z: 3} },
  { name: 'Plane040', label: '인터넷신문사', planetIndex: 1, cameraPos: {x: 4, y: 3.5, z: 6}, cameraTarget: {x: 2, y: 2, z: 3} },
  { name: 'Plane047', label: '창고형 전자문서', planetIndex: 2, cameraPos: {x: 8, y: 3.5, z: 2}, cameraTarget: {x: 6, y: 2, z: 1} },
  { name: 'Plane054', label: '응용 소프트웨어 개발', planetIndex: 3, cameraPos: {x: 2, y: 3.5, z: -6}, cameraTarget: {x: 1, y: 2, z: -3} },
  { name: 'Plane061', label: '스마트 City', planetIndex: 4, cameraPos: {x: -4, y: 3.5, z: -6}, cameraTarget: {x: -2, y: 2, z: -3} },
];

const DESK_TO_DEPTKEY = {
  '기업컨설팅': 'consulting',
  '인터넷신문사': 'news',
  '창고형 전자문서': 'edocs',
  '응용 소프트웨어 개발': 'software',
  '스마트 City': 'smartcity',
};

const DESK_LINKS = {
  plane035: 'dept/consulting.html',
  plane040: 'dept/news.html',
  plane047: 'dept/edocs.html',
  plane054: 'dept/software.html',
  plane061: 'dept/smartcity.html',
};

const DEPT_CONTENT = {
  consulting: {
    kicker: 'CONSULTING',
    title: '기업컨설팅',
    sub: '전략·재무·조직·사업모델을 한 번에 정리하는 실행형 컨설팅',
    blocks: [
      { title: '1) 사업타당성/수익모델', items: ['시장·경쟁 분석', '수익구조/단가/마진 설계', '투자자 관점 IR 스토리', '리스크·민감도 시뮬레이션'] },
      { title: '2) 정부지원/과제 연계', items: ['지원사업 매칭', '신청서/제안서 구조화', '평가항목 기반 보완', '협약/정산 체크리스트'] },
      { title: '3) 조직/운영 체계', items: ['직무/권한(R&R) 정의', 'OKR/KPI 설계', '표준업무 프로세스', '성과관리·보고 체계'] },
      { title: '4) 실행 로드맵', items: ['90일 실행플랜', '파트너/외주 운영', '마일스톤·예산관리', '리포트 자동화(주간/월간)'] },
    ]
  },
  news: {
    kicker: 'MEDIA',
    title: '인터넷신문사',
    sub: '브랜드 메시지를 “기사/콘텐츠”로 전환해 신뢰를 쌓는 미디어 운영',
    blocks: [
      { title: '1) 기획/편집', items: ['섹션/카테고리 설계', '주간 편집회의 템플릿', '팩트체크·가이드', '특집/연재 기획'] },
      { title: '2) 취재/제작', items: ['현장 취재 동선', '인터뷰 질문지', '사진/영상 컷 구성', '원고 작성/교열'] },
      { title: '3) 배포/확산', items: ['SNS/포털 노출 전략', '뉴스레터 운영', '콘텐츠 캘린더', '성과(CTR/체류) 분석'] },
      { title: '4) 수익화', items: ['광고상품 패키지', '브랜드드 콘텐츠', '협찬/제휴', '구독/회원 모델'] },
    ]
  },
  edocs: {
    kicker: 'E-DOCS',
    title: '창고형 전자문서',
    sub: '문서 보관·검색·증빙·권한관리를 “창고형”으로 표준화',
    blocks: [
      { title: '1) 전자문서 보관', items: ['폴더/태그 체계', '보존기간 룰', '버전관리', '대량 업로드'] },
      { title: '2) 검색/요약', items: ['키워드/필터 검색', '문서 요약/하이라이트', '중복 문서 탐지', '유사문서 추천'] },
      { title: '3) 권한/감사', items: ['권한(열람/수정) 정책', '접근 로그', '감사 리포트', '반출 승인 프로세스'] },
      { title: '4) 전자증빙/연동', items: ['계약서·세금계산서 정리', '회계/그룹웨어 연동', 'OCR/자동분류 확장', '백업/재해복구'] },
    ]
  },
  software: {
    kicker: 'SOFTWARE',
    title: '응용 소프트웨어 개발',
    sub: '웹/모바일/업무시스템을 빠르게 만들고 안정적으로 운영',
    blocks: [
      { title: '1) MVP/프로토타입', items: ['요구사항 캔버스', '와이어프레임', '핵심 기능 우선순위', '2~4주 MVP'] },
      { title: '2) 시스템 구축', items: ['관리자/대시보드', '결제/인증/권한', 'DB 설계', 'API 설계'] },
      { title: '3) 품질/보안', items: ['테스트(단위/통합)', '성능 최적화', '취약점 점검', '로그/모니터링'] },
      { title: '4) 배포/운영', items: ['CI/CD', 'Netlify/Vercel 배포', '장애 대응 룰', '운영 리포트 자동화'] },
    ]
  },
  smartcity: {
    kicker: 'SMART CITY',
    title: '스마트 City',
    sub: '도시/단지 단위의 데이터·에너지·안전·편의 서비스를 통합',
    blocks: [
      { title: '1) 도시 데이터 플랫폼', items: ['센서/데이터 수집', '대시보드', '알림/이벤트 룰', '데이터 표준화'] },
      { title: '2) 에너지/전력 연계', items: ['태양광/ESS 모니터링', '피크 절감', '수요예측', '협동조합 모델 확장'] },
      { title: '3) 안전/시설 관리', items: ['CCTV/출입 연동', '시설 점검 스케줄', '민원 처리 흐름', '장애 대응 매뉴얼'] },
      { title: '4) 시민/입주자 서비스', items: ['모바일 안내', '예약/결제', '커뮤니티 공지', '개인화 추천'] },
    ]
  }
};

let allowNonDeskMove = true;
let useDeskCameraPoints = false;

const DESK_ARROW_PLANES = [
  { names: ['Plane060', 'Plane059', 'Plane056', 'Plane055'], label: '기업컨설팅' },
  { names: ['Plane052', 'Plane053', 'Plane048', 'Plane049'], label: '인터넷신문사' },
  { names: ['Plane045', 'Plane046', 'Plane041', 'Plane042'], label: '창고형 전자문서' },
  { names: ['Plane066', 'Plane067', 'Plane062', 'Plane063'], label: '응용 소프트웨어 개발' },
];

const HIDE_PAGE_TEXT_PATTERN = /^text\.(00[3-6]|032|0(0[9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-3]))$/i;

const LOBBY_BOUNDS = { minX: -20, maxX: 20, minY: 0, maxY: 20, minZ: -28, maxZ: 28 };

let scene, camera, renderer, controls, lobbyModel;
const deskCylLabels = [];
let deptPanel, deptTitleEl, deptBodyEl, deptCloseBtn, deptActionBtn;
let selectedDeskData = null;

const deskModal = document.getElementById('deskModal');
const dmKicker = document.getElementById('dmKicker');
const dmTitle = document.getElementById('dmTitle');
const dmSub = document.getElementById('dmSub');
const dmBody = document.getElementById('dmBody');
const dmEnter = document.getElementById('dmEnter');

const deptRoot = document.getElementById('deptRoot');
const deptPages = new Map([
  ['consulting', document.getElementById('dept-consulting')],
  ['news', document.getElementById('dept-news')],
  ['edocs', document.getElementById('dept-edocs')],
  ['software', document.getElementById('dept-software')],
  ['smartcity', document.getElementById('dept-smartcity')],
]);

function dmOpen(){
  if (!deskModal) return;
  deskModal.classList.add('open');
  deskModal.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
}
function dmClose(){
  if (!deskModal) return;
  deskModal.classList.remove('open');
  deskModal.setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
  selectedDeskData = null;
}

deskModal?.addEventListener('click', (e)=>{
  if (e.target.closest('[data-dm-close="1"]')) dmClose();
});
window.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape' && deskModal?.classList.contains('open')) dmClose();
});

function openDept(deptKey, { updateHash = true } = {}){
  const page = deptPages.get(deptKey);
  if (!page) return;

  try {
    const v = document.getElementById('lobby-25d-video');
    if (v && isMobileDevice()) v.pause();
  } catch (e) {}

  deptRoot?.classList.add('open');
  deptRoot?.setAttribute('aria-hidden','false');

  deptPages.forEach((el)=>{
    el?.classList.remove('active');
    el?.setAttribute('aria-hidden','true');
  });

  page.classList.add('active');
  page.setAttribute('aria-hidden','false');

  if (updateHash) location.hash = `#dept-${deptKey}`;
}
function closeDept({ updateHash = true } = {}){
  deptPages.forEach((el)=>{
    el?.classList.remove('active');
    el?.setAttribute('aria-hidden','true');
  });
  deptRoot?.classList.remove('open');
  deptRoot?.setAttribute('aria-hidden','true');

  try {
    const v = document.getElementById('lobby-25d-video');
    if (v && isMobileDevice()) v.play().catch(() => {});
  } catch (e) {}

  if (updateHash) location.hash = '';
}

document.addEventListener('click', (e)=>{
  const back = e.target.closest('[data-action="dept-back"]');
  if (back) closeDept();
});

window.addEventListener('load', ()=>{
  const m = location.hash.match(/^#dept-(consulting|news|edocs|software|smartcity)$/);
  if (m) openDept(m[1], { updateHash:false });
});
window.addEventListener('hashchange', ()=>{
  const m = location.hash.match(/^#dept-(consulting|news|edocs|software|smartcity)$/);
  if (m) openDept(m[1], { updateHash:false });
  else closeDept({ updateHash:false });
});

function renderDeptPage(deptKey){
  const page = deptPages.get(deptKey);
  const d = DEPT_CONTENT[deptKey];
  if (!page || !d) return;

  const blocksHtml = d.blocks.map(b => `\n    <div class="block">\n      <h3>${b.title}</h3>\n      <ul>${b.items.map(x=>`<li>${x}</li>`).join('')}</ul>\n    </div>\n  `).join('');

  page.innerHTML = `\n    <div class="deptTopbar">\n      <div style="display:flex; flex-direction:column; gap:4px;">\n        <div style="font-size:12px; opacity:.72; letter-spacing:.12em;">${d.kicker}</div>\n        <div style="font-size:16px;">${d.title}</div>\n      </div>\n      <button class="btn ghost" type="button" data-action="dept-back">로비로</button>\n    </div>\n\n    <div class="deptWrap">\n      <div class="deptHero">\n        <h1>${d.title}</h1>\n        <p>${d.sub}</p>\n        <div class="deptBlocks">${blocksHtml}</div>\n      </div>\n    </div>\n  `;
}
Object.keys(DEPT_CONTENT).forEach(renderDeptPage);

function openDeskModalByDept({ deptKey, label }){
  const d = DEPT_CONTENT[deptKey];
  if (!d) return;

  dmKicker && (dmKicker.textContent = d.kicker || 'NURION');
  dmTitle && (dmTitle.textContent = d.title || label || '사업부');
  dmSub && (dmSub.textContent = d.sub || '');

  dmBody && (dmBody.innerHTML = d.blocks.map(b => `\n    <div class="card">\n      <b>${b.title}</b>\n      <div style="opacity:.86; line-height:1.55;">\n        ${b.items.slice(0,3).map(x=>`• ${x}`).join('<br>')}\n      </div>\n    </div>\n  `).join(''));

  dmOpen();
}

dmEnter?.addEventListener('click', ()=>{
  if (!selectedDeskData) return;
  const { deptKey, hitPoint } = selectedDeskData;

  dmClose();
  if (hitPoint) moveToTarget(hitPoint);
  setTimeout(()=> openDept(deptKey), 650);
});
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundIntersect = new THREE.Vector3();
let isMovingToTarget = false;
const targetPosition = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();
const MOVE_SPEED = 0.05;

/** 인트로 종료 직후: 모바일만 2.5D 로비 영상 + 사업부 버튼(PC는 3D 로비 유지) */
function enterMainAfterIntro() {
  if (!isMobileDevice()) return;
  const canvas = document.getElementById('canvas-container');
  if (canvas) canvas.style.display = 'none';
  const root = document.getElementById('mobile-lobby-25d');
  if (!root) return;
  root.classList.remove('hidden');
  root.setAttribute('aria-hidden', 'false');
  const v = document.getElementById('lobby-25d-video');
  const btnWrap = document.getElementById('mobile-lobby-buttons');
  if (v) {
    v.src = LOBBY_25D_VIDEO;
    v.muted = true;
    v.setAttribute('playsinline', '');
    v.playsInline = true;
    v.loop = true;
    v.play().catch(() => {});
  }
  if (btnWrap && !btnWrap.dataset.wired) {
    btnWrap.dataset.wired = '1';
    DESK_LABELS.forEach((desk) => {
      const deptKey = DESK_TO_DEPTKEY[desk.label];
      if (!deptKey) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mobile-lobby__btn';
      btn.textContent = desk.label;
      btn.addEventListener('click', () => openDept(deptKey));
      btnWrap.appendChild(btn);
    });
  }
}

function initIntro() {
  const container = document.getElementById('intro-container');
  const video = document.getElementById('intro-video');
  const skipBtn = document.getElementById('skip-intro');

  let done = false;
  let lastTime = 0;
  let watchdog = null;

  function showLobby() {
    if (done) return;
    done = true;
    try { video && video.pause(); } catch (e) {}
    try { container.classList.add('hidden'); } catch (e) {}
    setTimeout(() => {
      try { container.remove(); } catch (e) {}
    }, 900);
    if (watchdog) clearInterval(watchdog);
    try {
      enterMainAfterIntro();
    } catch (e) {
      console.warn('enterMainAfterIntro:', e);
    }
  }

  function pickIntroSrc() {
    return INTRO_SHARED;
  }

  function applyIntroSrc() {
    if (!video) return;
    const src = pickIntroSrc();
    const cur = video.getAttribute('data-intro-src');
    if (cur === src) return;
    try {
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.muted = true;
    } catch (e) {}
    video.src = src;
    video.setAttribute('data-intro-src', src);
    try { video.load(); } catch (e) {}
  }

  watchdog = setInterval(() => {
    if (!done && video && video.readyState >= 2) {
      if (video.currentTime > lastTime + 0.05) lastTime = video.currentTime;
    }
  }, 300);

  setTimeout(() => {
    if (!done && video) {
      const stalled = video.currentTime <= 0.05 || video.currentTime <= lastTime + 0.01;
      if (stalled) showLobby();
    }
  }, 2500);

  applyIntroSrc();
  try {
    window.addEventListener('orientationchange', applyIntroSrc);
    window.addEventListener('resize', applyIntroSrc);
  } catch (e) {}

  const p = video?.play && video.play();
  if (p && p.catch) {
    p.catch((e) => {
      console.warn('intro play failed:', e);
      showLobby();
    });
  }

  try { video && video.addEventListener('error', showLobby); } catch (e) {}
  try {
    video && video.addEventListener('stalled', () => setTimeout(() => !done && showLobby(), 1200));
  } catch (e) {}
  try { video && video.addEventListener('abort', showLobby); } catch (e) {}
  try { video && video.addEventListener('ended', showLobby); } catch (e) {}
  skipBtn && skipBtn.addEventListener('click', showLobby);
}

function createLabelTexture(text, isGlow = false, targetWidth = null, targetHeight = null) {
  const baseW = 512, baseH = 128;
  const w = targetWidth ? Math.max(512, Math.ceil(targetWidth * 100)) : baseW;
  const h = targetHeight ? Math.max(128, Math.ceil(targetHeight * 100)) : baseH;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const fontSize = Math.min(w / text.length * 1.2, h * 0.6);
  if (isGlow) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = fontSize * 0.4;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#00ffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2);
  } else {
    ctx.fillStyle = 'rgba(15, 20, 35, 0.95)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `bold ${fontSize * 0.9}px sans-serif`;
    ctx.fillStyle = '#e8eeff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);
  tex.needsUpdate = true;
  return tex;
}

function createCylinderLabelTexture(text) {
  const w = 2048, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const fontSize = 170;
  ctx.font = `800 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 28;
  ctx.fillStyle = 'rgba(0,255,255,0.9)';
  ctx.fillText(text, w / 2, h / 2);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;     
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);
  tex.needsUpdate = true;
  return tex;
}

// 원통에 카메라를 향한 라벨 슬리브를 얇게 덧씌우고 매 프레임 정면 유지용으로 등록
function addCameraFacingLabelSleeveOnCylinder(cylMesh, text) {
  if (!cylMesh?.isMesh || !cylMesh.geometry) return;

  if (cylMesh.userData.__hasDeskLabel) return;
  cylMesh.userData.__hasDeskLabel = true;

  const g = cylMesh.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);

  const height = size.y || 1;
  const radius = Math.max(size.x, size.z) * 0.5 || 0.5;

  const sleeveGeo = new THREE.CylinderGeometry(
    radius * 1.01,
    radius * 1.01,
    height * 0.65,
    96, 1,
    true
  );

  const texture = createCylinderLabelTexture(text);

  const sleeveMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeve.name = `__desk_cyl_label__${text}`;
  sleeve.renderOrder = 20;

  sleeve.position.set(0, 0, 0);

  cylMesh.add(sleeve);

  deskCylLabels.push({ cylinder: cylMesh, texture });

  console.log(`✓ 원통 라벨 슬리브 부착: ${text} → ${cylMesh.name}`);
}

function createCurvedTextTexture(text) {
  const w = 2048, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, w, h);

  const fontSize = 170;
  ctx.font = `800 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'rgba(0,255,255,0.9)';
  ctx.fillText(text, w / 2, h / 2);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  return tex;
}

function addSleeveLabelOnCylinder(cylMesh, text) {
  if (!cylMesh?.isMesh) return;

  const g = cylMesh.geometry;
  if (!g) return;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);

  const height = size.y || 1;
  const radiusApprox = Math.max(size.x, size.z) * 0.5 || 0.5;

  const sleeveGeo = new THREE.CylinderGeometry(
    radiusApprox * 1.01,
    radiusApprox * 1.01,
    height * 0.55,
    80, 1,
    true
  );

  const tex = createCurvedTextTexture(text);
  const sleeveMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeve.name = `__desk_cyl_label__${text}`;
  sleeve.renderOrder = 10;

  sleeve.position.set(0, 0, 0);

  tex.offset.x = 0.0;

  cylMesh.add(sleeve);
}

function collectCylinderCandidates(model) {
  const out = [];
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const type = obj.geometry?.type || '';
    const name = (obj.name || '').toLowerCase();

    const looksLikeCylinder =
      type.includes('Cylinder') ||
      name.includes('cylinder') || name.includes('tube') || name.includes('round');

    if (looksLikeCylinder) out.push(obj);
  });
  return out;
}

function findNearestCylinderToPoint(cyls, worldPoint) {
  let best = null;
  let bestD = Infinity;
  const p = new THREE.Vector3();
  for (const c of cyls) {
    c.getWorldPosition(p);
    const d = p.distanceTo(worldPoint);
    if (d < bestD) { bestD = d; best = c; }
  }
  return { best, bestD };
}

function normalizePlaneName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/\./g, '').replace(/_\d+$/, '');
}

function analyzeDeskTextures(model) {
  const nameToLabel = new Map(
    DESK_LABELS.map((d) => [normalizePlaneName(d.name), d])
  );
  
  console.log('=== 데스크 모니터 화면 텍스처 분석 (지구/행성 이미지) ===');
  
  const allPlanes = [];
  model.traverse((child) => {
    if (child.isMesh && child.name.toLowerCase().includes('plane')) {
      allPlanes.push(child.name);
    }
  });
  console.log(`발견된 모든 Plane 객체 (${allPlanes.length}개):`, allPlanes.sort());
  
  let foundCount = 0;
  const foundDesks = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    const key = normalizePlaneName(child.name);
    const deskInfo = nameToLabel.get(key);
    if (!deskInfo) return;
    
    foundDesks.push({ name: child.name, label: deskInfo.label, mesh: child });
  });
  
  if (foundDesks.length === 0) {
    console.log('\n⚠ 지정된 Plane 이름으로 데스크 모니터를 찾을 수 없습니다.');
    console.log('찾고 있는 이름들:', DESK_LABELS.map(d => d.name));
    console.log('\n대신 "hud", "img" 관련 머티리얼을 사용하는 객체를 찾아보겠습니다...\n');
    
    const hudMeshes = [];
    model.traverse((child) => {
      if (!child.isMesh) return;
      const mat = child.material;
      const materials = Array.isArray(mat) ? mat : [mat];
      materials.forEach((m) => {
        if (m && m.name && (m.name.toLowerCase().includes('hud') || m.name.toLowerCase().includes('img'))) {
          hudMeshes.push({ mesh: child, material: m.name });
        }
      });
    });
    
    console.log(`"hud"/"img" 머티리얼을 사용하는 객체 (${hudMeshes.length}개):`);
    hudMeshes.forEach((item, i) => {
      console.log(`  [${i + 1}] ${item.mesh.name} - 머티리얼: ${item.material}`);
    });
    
    hudMeshes.forEach((item, idx) => {
      const child = item.mesh;
      const mat = child.material;
      const materials = Array.isArray(mat) ? mat : [mat];
      materials.forEach((m, i) => {
        if (!m) return;
        if (m.name && (m.name.toLowerCase().includes('hud') || m.name.toLowerCase().includes('img'))) {
          console.log(`\n[${idx + 1}] ${child.name} - 머티리얼: "${m.name}"`);
          if (m.map) {
            const tex = m.map;
            const src = tex.image?.src || tex.image?.currentSrc || tex.image?.dataUri;
            const fileName = src ? src.split('/').pop().split('?')[0].split('#')[0] : null;
            console.log(`    ✓ map 텍스처: ${tex.name || '(no name)'}`);
            console.log(`      - 이미지 경로: ${src || '(embedded/unknown)'}`);
            if (fileName) console.log(`      - 파일명: ${fileName}`);
            if (!src && tex.name) {
              console.log(`      - GLB 내부 이미지 이름: ${tex.name}`);
            }
          }
        }
      });
    });
  } else {
    foundDesks.forEach((desk, idx) => {
      foundCount++;
      const child = desk.mesh;
      console.log(`\n[${foundCount}] ${child.name} - 사업부: ${desk.label}`);
      const mat = child.material;
      const materials = Array.isArray(mat) ? mat : [mat];
      materials.forEach((m, i) => {
        if (!m) return;
        console.log(`  머티리얼[${i}]: "${m.name || '(unnamed)'}" (type: ${m.type})`);
        
        if (m.map) {
          const tex = m.map;
          const src = tex.image?.src || tex.image?.currentSrc || tex.image?.dataUri;
          const fileName = src ? src.split('/').pop().split('?')[0].split('#')[0] : null;
          console.log(`    ✓ map 텍스처:`);
          console.log(`      - 텍스처 이름: ${tex.name || '(no name)'} `);
          console.log(`      - 이미지 경로: ${src || '(embedded/unknown)'} `);
          if (fileName) console.log(`      - 파일명: ${fileName}`);
          if (!src && tex.name) {
            console.log(`      - GLB 내부 이미지 이름: ${tex.name}`);
          }
        }
        
        if (m.emissiveMap) {
          const tex = m.emissiveMap;
          const src = tex.image?.src || tex.image?.currentSrc || tex.image?.dataUri;
          const fileName = src ? src.split('/').pop().split('?')[0].split('#')[0] : null;
          console.log(`    ✓ emissiveMap:`);
          console.log(`      - 이미지 경로: ${src || '(embedded/unknown)'} `);
          if (fileName) console.log(`      - 파일명: ${fileName}`);
        }
      });
    });
  }
  
  console.log(`\n=== 분석 완료 (총 ${foundCount}개 데스크 확인) ===\n`);
}

function hideDeptPanel() {
  selectedDeskData = null;
  if (deptPanel) deptPanel.classList.add('hidden');
}

function showDeptPanel(deskData) {
  selectedDeskData = deskData;
  if (!deptPanel) return;

  deptTitleEl.textContent = deskData.label || '사업부';
  deptBodyEl.innerHTML = `
    <div style="opacity:.9">선택된 사업부:</div>
    <div style="margin-top:6px;font-weight:700">${deskData.label || '-'}</div>
    <div style="margin-top:10px;opacity:.85;font-size:12px">
      deskId: ${deskData.deskId || '-'}<br/>
      planetIndex: ${deskData.planetIndex ?? '-'}
    </div>
  `;
  deptPanel.classList.remove('hidden');
}

function applyDeskLabels(model) {
  const nameToLabel = new Map(
    DESK_LABELS.map((d) => [normalizePlaneName(d.name), d])
  );

  const foundDesks = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    const key = normalizePlaneName(child.name);
    const deskInfo = nameToLabel.get(key);
    if (!deskInfo) return;

    const mat = child.material;
    const materials = Array.isArray(mat) ? mat : [mat];
    // Accept materials that either are named like 'img.*' or simply have a texture map.
    const hasImgMaterial = materials.some(
      (m) => m && ( (m.name && m.name.toLowerCase().startsWith('img.')) || m.map )
    );
    if (!hasImgMaterial) return;

    foundDesks.push({ mesh: child, key, deskInfo });
  });

  console.log(`=== 데스크 원본 발견: ${foundDesks.length}개 ===`);
  console.log(foundDesks.map((d) => d.mesh.name));

  const arrowPlaneMap = new Set();
  DESK_ARROW_PLANES.forEach((g) => g.names.forEach((n) => arrowPlaneMap.add(normalizePlaneName(n))));
  const arrowPlanesToRemove = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    const key = normalizePlaneName(child.name);
    if (!arrowPlaneMap.has(key)) return;
    child.visible = false;
    child.castShadow = false;
    child.receiveShadow = false;
    arrowPlanesToRemove.push(child);
  });
  arrowPlanesToRemove.forEach((plane) => {
    if (plane.material) {
      if (Array.isArray(plane.material)) plane.material.forEach((m) => m?.dispose?.());
      else plane.material.dispose?.();
    }
    plane.geometry?.dispose?.();
    plane.parent?.remove(plane);
  });
  if (arrowPlanesToRemove.length) console.log(`<--> Plane 삭제 완료: ${arrowPlanesToRemove.length}개`);

  function replaceDeskWithIndependentMesh(desk) {
    const originalMesh = desk.mesh;
    const { label, planetIndex } = desk.deskInfo;
    const planetPath = PLANET_TEXTURES[planetIndex];

    if (!planetPath) {
      console.warn(`행성 텍스처 경로 없음: ${originalMesh.name} (planetIndex=${planetIndex})`);
      return;
    }

    originalMesh.updateMatrixWorld(true);
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    originalMesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

    const parent = originalMesh.parent;

    originalMesh.visible = false;
    parent?.remove(originalMesh);

    const newGeometry = originalMesh.geometry ? originalMesh.geometry.clone() : new THREE.PlaneGeometry(1, 1);

    const texLoader = new THREE.TextureLoader();
    texLoader.load(
      planetPath,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.needsUpdate = true;

        const newMaterial = new THREE.MeshStandardMaterial({
          map: texture,
          emissive: new THREE.Color(0x111111),
          emissiveIntensity: 0.2,
          metalness: 0.1,
          roughness: 0.8,
        });

        const newMesh = new THREE.Mesh(newGeometry, newMaterial);
        newMesh.name = `Desk_${desk.key}_Independent`;
        newMesh.position.copy(worldPosition);
        newMesh.quaternion.copy(worldQuaternion);
        newMesh.scale.copy(worldScale);
        newMesh.castShadow = true;
        newMesh.receiveShadow = true;

        newMesh.userData = {
          isDesk: true,
          deskId: desk.key,
          deskName: originalMesh.name,
          label,
          planetIndex,
          planetPath,
        };

        if (parent) parent.add(newMesh);
        else model.add(newMesh);

        console.log(`✓ 데스크 교체 완료: ${originalMesh.name} → ${newMesh.name} (${label})`);
      },
      undefined,
      (err) => console.error(`✗ 텍스처 로드 실패: ${originalMesh.name} - ${planetPath}`, err)
    );
  }

  foundDesks.forEach(replaceDeskWithIndependentMesh);
}

/** minimal 모드: 모델 그대로만 표시(새 GLB 넣고 동작·스케일 확인용). 데스크 클릭 등은 full 에서 동작. */
function applyMinimalLobbyPostProcess(model) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  scene.add(model);
  console.info(
    '[LOBBY] minimal 모드: 후처리 없이 로드됨. 데스크/바닥영상/퍼지를 쓰려면 netlify/app.js 의 LOBBY_PROCESSING 을 "full" 로 변경 후 bundle 재빌드.'
  );
}

function initThree() {
  window.__isMobile = isMobileDevice();
  if (window.__isMobile) {
    window.__useThreeLobby = false;
    return;
  }
  window.__useThreeLobby = true;

  const container = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  // expose for debugging
  window.scene = scene;
  window.addEventListener('error', (e) => console.error('window.error:', e.message, e.filename, e.lineno, e.colno, e.error));
  window.addEventListener('unhandledrejection', (ev) => console.error('unhandledRejection:', ev.reason));
  scene.background = new THREE.Color(0x0a0e17);
  scene.fog = new THREE.Fog(0x0a0e17, 30, 120);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 12, 25);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.__isMobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // expose camera/renderer for console debugging
  window.camera = camera;
  window.renderer = renderer;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 8;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minPolarAngle = 0.1;
  controls.target.set(0, 2, 0);

  scene.add(new THREE.AmbientLight(0x404080, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(15, 25, 15);
  dir.castShadow = true;
  scene.add(dir);
  scene.add(new THREE.HemisphereLight(0x80a0ff, 0x202040, 0.4));

  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('touchstart', onCanvasTouch, { passive: false });
  deptPanel = document.getElementById('dept-panel');
  deptTitleEl = document.getElementById('dept-title');
  deptBodyEl = document.getElementById('dept-body');
  deptCloseBtn = document.getElementById('dept-close');
  deptActionBtn = document.getElementById('dept-action');

  deptCloseBtn?.addEventListener('click', hideDeptPanel);
  deptActionBtn?.addEventListener('click', () => {
    if (!selectedDeskData) return;
    const deptKey = DESK_TO_DEPTKEY[selectedDeskData.label] || null;
    if (deptKey) {
      selectedDeskData.deptKey = deptKey;
      openDeskModalByDept({ deptKey, label: selectedDeskData.label });
    } else {
      console.log('자세히 보기: 사업부 매핑이 없습니다.', selectedDeskData);
    }
  });

  const loader = new GLTFLoader();
  loader.load(
    LOBBY_MODEL_PATH,
    (gltf) => {
      lobbyModel = gltf.scene;

      if (LOBBY_PROCESSING === 'minimal') {
        applyMinimalLobbyPostProcess(lobbyModel);
        return;
      }

      console.log('=== GLB 텍스처/이미지 정보 ===');
      try {
        const parser = gltf.parser || gltf.userData?.parser;
        if (parser && parser.json) {
          const json = parser.json;
          if (json.images) {
            console.log(`GLB Images 총 ${json.images.length}개:`);
            json.images.forEach((img, i) => {
              const info = {
                index: i,
                uri: img.uri || '(embedded)',
                name: img.name || `image_${i}`,
                mimeType: img.mimeType || 'unknown'
              };
              console.log(`  [${i}] ${info.name}: ${info.uri} (${info.mimeType})`);
            });
          }
          if (json.textures) {
            console.log(`\nGLB Textures 총 ${json.textures.length}개:`);
            json.textures.forEach((tex, i) => {
              const imgInfo = json.images && json.images[tex.source] ? 
                `→ ${json.images[tex.source].uri || json.images[tex.source].name || `image_${tex.source}`}` : 
                `→ source: ${tex.source}`;
              console.log(`  [${i}] ${tex.name || `texture_${i}`} ${imgInfo}`);
            });
          }
          if (json.materials) {
            console.log(`\nGLB Materials 총 ${json.materials.length}개:`);
            json.materials.forEach((mat, i) => {
              const pbr = mat.pbrMetallicRoughness;
              const baseTex = pbr?.baseColorTexture?.index;
              const emissiveTex = mat.emissiveTexture?.index;
              if (baseTex !== undefined || emissiveTex !== undefined) {
                console.log(`  [${i}] ${mat.name || `material_${i}`}:`);
                if (baseTex !== undefined) {
                  const imgIdx = json.textures[baseTex]?.source;
                  const imgUri = imgIdx !== undefined && json.images[imgIdx] ? 
                    (json.images[imgIdx].uri || json.images[imgIdx].name || `image_${imgIdx}`) : 'unknown';
                  console.log(`    baseColorTexture: texture[${baseTex}] → ${imgUri}`);
                }
                if (emissiveTex !== undefined) {
                  const imgIdx = json.textures[emissiveTex]?.source;
                  const imgUri = imgIdx !== undefined && json.images[imgIdx] ? 
                    (json.images[imgIdx].uri || json.images[imgIdx].name || `image_${imgIdx}`) : 'unknown';
                  console.log(`    emissiveTexture: texture[${emissiveTex}] → ${imgUri}`);
                }
              }
            });
          }
        }
      } catch (e) {
        console.log('GLB JSON 파싱 정보 접근 불가:', e);
      }
      console.log('=== GLB 정보 분석 완료 ===\n');
      
      const namesList = [];
      const toRemove = [];
      let floorMaterialColor = null;
      const blueFloorMeshes = [];

      lobbyModel.traverse((child) => {
        if (child.isMesh && child.name.toLowerCase().includes('floor')) {
          const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
          if (mats.length > 0 && mats[0].color) floorMaterialColor = mats[0].color.clone();
        }
      });

      lobbyModel.traverse((child) => {
        if (DEBUG_LOG_GLB_NAMES) namesList.push(child.name || '(unnamed)');
        if (child.isMesh) child.castShadow = child.receiveShadow = true;
        const n = child.name.toLowerCase();
        const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
        const matName = mats.map((m) => (m && m.name) || '').join(' ').toLowerCase();
        const isText = HIDE_TEXT_PATTERN.test(child.name) || n.includes('text');
        const isPageText = HIDE_PAGE_TEXT_PATTERN.test(child.name);
        const isPeople = HIDE_PEOPLE_PATTERN.test(n) || HIDE_PEOPLE_PATTERN.test(matName) || HIDE_OBJECT_NAMES_EXACT.includes(child.name);
        const isFloor = n.includes('floor');
        const isFloorLineMat = HIDE_FLOOR_LINE_MAT_PATTERN.test(matName);
        const isBlue = child.name.includes('n_419') || n.includes('blue') || matName.includes('blue_light') ||
          mats.some((m) => m && m.color && m.color.b > m.color.r && m.color.b > m.color.g && m.color.b > 0.2);

        if (isText || isPeople) toRemove.push(child);
        if (isPageText) child.visible = false;
        if (isFloorLineMat && !isFloor) child.visible = false;
        if (isBlue && !isFloor) blueFloorMeshes.push(child);
      });

      toRemove.forEach((obj) => { if (obj.parent) obj.parent.remove(obj); });

      const arrowPlaneNames = [];
      DESK_ARROW_PLANES.forEach((group) => {
        group.names.forEach((n) => {
          arrowPlaneNames.push(normalizePlaneName(n));
        });
      });
      
      const arrowPlanesToRemove = [];
      lobbyModel.traverse((child) => {
        if (!child.isMesh) return;
        const key = normalizePlaneName(child.name);
        if (arrowPlaneNames.includes(key)) {
          child.visible = false;
          child.castShadow = false;
          child.receiveShadow = false;
          arrowPlanesToRemove.push(child);
        }
      });
      
      arrowPlanesToRemove.forEach((plane) => {
        if (plane.material) {
          if (Array.isArray(plane.material)) {
            plane.material.forEach((m) => {
              if (m && m.map) m.map.dispose();
              if (m && m.emissiveMap) m.emissiveMap.dispose();
              if (m && m.normalMap) m.normalMap.dispose();
              if (m && m.dispose) m.dispose();
            });
          } else {
            if (plane.material.map) plane.material.map.dispose();
            if (plane.material.emissiveMap) plane.material.emissiveMap.dispose();
            if (plane.material.normalMap) plane.material.normalMap.dispose();
            if (plane.material.dispose) plane.material.dispose();
          }
        }
        if (plane.geometry && plane.geometry.dispose) plane.geometry.dispose();
        if (plane.parent) {
          plane.parent.remove(plane);
          console.log(`<--> Plane 삭제 (GLB 로드 직후): ${plane.name}`);
        }
      });
      
      if (arrowPlanesToRemove.length > 0) {
        console.log(`<--> Plane 삭제 완료 (GLB 로드 직후): ${arrowPlanesToRemove.length}개`);
      }

      if (blueFloorMeshes.length > 0) {
        let videoTexture = null;
        if (!window.__isMobile) {
          const adVideo = document.createElement('video');
          adVideo.src = VIDEO_AD_PATH;
          adVideo.crossOrigin = 'anonymous';
          adVideo.muted = true;
          adVideo.loop = true;
          adVideo.playsInline = true;
          adVideo.play().catch((err)=>{ console.warn('adVideo.play() failed:', err); });
          videoTexture = new THREE.VideoTexture(adVideo);
          videoTexture.colorSpace = THREE.SRGBColorSpace;
          videoTexture.minFilter = videoTexture.magFilter = THREE.LinearFilter;
        } else {
          console.log('Skipping ad video on mobile for stability');
        }
        blueFloorMeshes.forEach((mesh) => {
          const mat = mesh.material;
          const materials = Array.isArray(mat) ? [...mat] : [mat];
          const newMats = materials.map((m) => {
            if (!m || !m.clone) return m;
            const newMat = m.clone();
            if (videoTexture) newMat.map = videoTexture;
            return newMat;
          });
          mesh.material = newMats.length === 1 ? newMats[0] : newMats;
        });
      }

      applyDeskLabels(lobbyModel);

      function purgeHologramLikeObjects(model){
        const removed = [];
        const killName = /(holo|hologram|sign|banner|billboard|placard|stand)/i;
        model.traverse((o)=>{
          if (!o.isMesh) return;
          const n = o.name || '';
          const mat = o.material;
          const mats = Array.isArray(mat) ? mat : [mat];
          const matNameHit = mats.some(m => (m?.name || '').toLowerCase().includes('holo'));
          if (killName.test(n) || matNameHit || o.userData?.isHologram) {
            removed.push(n || '(unnamed)');
            o.visible = false;
            if (o.material) {
              if (Array.isArray(o.material)) o.material.forEach((m)=>m?.dispose?.());
              else o.material.dispose?.();
            }
            o.geometry?.dispose?.();
            o.parent?.remove(o);
          }
        });
        if (removed.length) console.log('🧹 홀로그램/간판 후보 제거:', removed);
      }
      purgeHologramLikeObjects(lobbyModel);
      // 추가 안전망: PlaneGeometry / HUD-like / img.* 머티리얼 / 높은 Y 위치 등
      function purgeAdditionalPlanes(model){
        const removed = [];
        const matHints = ['img', 'hud', 'pre', 'placard', 'banner', 'billboard'];
        model.traverse((o)=>{
          if (!o.isMesh) return;
          if (o.userData?.isDesk) return;
          const type = o.geometry?.type || '';
          const y = (o.position && typeof o.position.y === 'number') ? o.position.y : 0;
          const name = o.name || '';
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const matNames = mats.map(m => (m && m.name || '')).join(' ').toLowerCase();
          const isPlane = type.toLowerCase().includes('plane');
          const matHintHit = matHints.some(h => matNames.includes(h));
          const nameHint = /(sign|banner|billboard|placard|hologram|holo)/i.test(name);
          if (isPlane && (y > 0.9 || matHintHit || nameHint)){
            removed.push(name || `(id:${o.id})`);
            try {
              o.visible = false;
              if (o.material) {
                if (Array.isArray(o.material)) o.material.forEach(m => m?.dispose?.());
                else o.material.dispose?.();
              }
              if (o.geometry && o.geometry.dispose) o.geometry.dispose();
              if (o.parent) o.parent.remove(o);
            } catch (e) {
              console.warn('purgeAdditionalPlanes: 제거 실패', o.name, e);
            }
          }
        });
        if (removed.length) console.log('🧹 추가 Plane 제거:', removed);
      }
      try { purgeAdditionalPlanes(lobbyModel); } catch(e){ console.warn('purgeAdditionalPlanes 실행 실패:', e); }

      function collectCylinderCandidates(model) {
        const out = [];
        model.traverse((obj) => {
          if (!obj.isMesh) return;
          const type = obj.geometry?.type || '';
          const name = (obj.name || '').toLowerCase();

          if (type.includes('Cylinder') || name.includes('cylinder') || name.includes('tube')) {
            out.push(obj);
          }
        });
        return out;
      }

      function findNearestMeshToPoint(meshes, worldPoint) {
        let best = null;
        let bestD = Infinity;
        const p = new THREE.Vector3();
        for (const m of meshes) {
          m.getWorldPosition(p);
          const d = p.distanceTo(worldPoint);
          if (d < bestD) { bestD = d; best = m; }
        }
        return { best, bestD };
      }

      const cylinders = collectCylinderCandidates(lobbyModel);

      const desks = [];
      lobbyModel.traverse((o) => {
        if (o.isMesh && o.userData?.isDesk && o.userData?.label) desks.push(o);
      });

      desks.forEach((desk) => {
        const wp = new THREE.Vector3();
        desk.getWorldPosition(wp);

        const { best, bestD } = findNearestMeshToPoint(cylinders, wp);

        if (best && bestD < 6.0) {
          addCameraFacingLabelSleeveOnCylinder(best, desk.userData.label);
        } else {
          console.warn(`⚠ 원통 매칭 실패/거리초과: ${desk.userData.label} (dist=${bestD.toFixed(2)})`);
        }
      });
      if (DEBUG_LOG_GLB_NAMES) console.log('GLB 오브젝트 이름 목록:', namesList);
      
      console.log('=== 씬의 모든 Mesh 객체 (홀로그램 찾기용) ===');
      const allMeshes = [];
      lobbyModel.traverse((obj) => {
        if (obj.isMesh) {
          allMeshes.push({
            name: obj.name || 'unnamed',
            type: obj.geometry?.type || 'unknown',
            position: obj.position,
            visible: obj.visible,
            materialName: obj.material?.name || (Array.isArray(obj.material) ? obj.material.map(m => m?.name).join(',') : 'none'),
            userData: obj.userData
          });
        }
      });
      console.log('총 Mesh 개수:', allMeshes.length);
      console.table(allMeshes);
      
      const suspiciousMeshes = allMeshes.filter(m => 
        m.type === 'PlaneGeometry' && 
        m.position.y > 1.0 &&
        (m.name.toLowerCase().includes('plane') || m.materialName.toLowerCase().includes('hud') || m.materialName.toLowerCase().includes('img'))
      );
      console.log('=== 홀로그램으로 의심되는 Mesh (Y > 1.0, PlaneGeometry) ===');
      console.table(suspiciousMeshes);
      
      window.debugScene = scene;
      window.debugLobbyModel = lobbyModel;
      window.debugRemoveMeshByName = function(name) {
        let found = false;
        scene.traverse((obj) => {
          if (obj.isMesh && obj.name === name) {
            obj.visible = false;
            if (obj.parent) obj.parent.remove(obj);
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach(m => { if (m && m.dispose) m.dispose(); });
              } else {
                if (obj.material.dispose) obj.material.dispose();
              }
            }
            if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
            console.log(`✓ 제거 완료: ${name}`);
            found = true;
          }
        });
        if (!found) console.log(`✗ 찾을 수 없음: ${name}`);
      };
      console.log('=== 디버깅 함수 사용법 ===');
      console.log('1. 위의 테이블에서 홀로그램으로 보이는 Mesh의 name을 확인');
      console.log('2. 콘솔에서 다음 명령어 실행:');
      console.log('   debugRemoveMeshByName("Mesh이름")');
      console.log('예: debugRemoveMeshByName("Plane035_8")');
      
      const originalPlane035_8 = [];
      lobbyModel.traverse((obj) => {
        if (obj.isMesh && obj.name === 'Plane035_8' && !obj.userData.isDesk) {
          originalPlane035_8.push(obj);
        }
      });
      
      originalPlane035_8.forEach((obj) => {
        obj.visible = false;
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.parent) {
          obj.parent.remove(obj);
          console.log(`✓ 원본 Plane035_8 완전 제거: ${obj.name}`);
        }
      });
      
      if (originalPlane035_8.length === 0) {
        console.log(`✓ 원본 Plane035_8 없음 (이미 제거됨)`);
      }
      // 추가로 발견된 문제 Plane 들을 강제 제거
      const EXTRA_CLEANUP_PLANES = ['Plane035_8', 'Plane040_8', 'Plane047_8', 'Plane054_8', 'Plane061_8'];
      const foundExtraPlanes = [];
      lobbyModel.traverse((obj) => {
        if (obj.isMesh && EXTRA_CLEANUP_PLANES.includes(obj.name) && !obj.userData?.isDesk) {
          foundExtraPlanes.push(obj);
        }
      });
      foundExtraPlanes.forEach((obj) => {
        obj.visible = false;
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.parent) {
          obj.parent.remove(obj);
          console.log(`✓ 강제 제거: ${obj.name}`);
        }
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
          else obj.material.dispose?.();
        }
      });
      if (foundExtraPlanes.length === 0) console.log('✓ 추가 제거 대상 없음 (이미 처리됨)');

      // 반복적으로 정리 실행: 일부 오브젝트는 후속 처리 루틴에서 추가될 수 있으므로
      // 즉시/지연(polling)으로 purge를 여러번 실행해 잔여물을 제거합니다.
      function runPurgesRepeatedly(model){
        try { purgeHologramLikeObjects(model); } catch(e){ console.warn('purgeHologramLikeObjects 실패:', e); }
        try { purgeAdditionalPlanes(model); } catch(e){ console.warn('purgeAdditionalPlanes 실패:', e); }
        setTimeout(()=>{ try{ purgeHologramLikeObjects(model); purgeAdditionalPlanes(model);}catch(e){} }, 300);
        setTimeout(()=>{ try{ purgeHologramLikeObjects(model); purgeAdditionalPlanes(model);}catch(e){} }, 1000);
      }
      try { runPurgesRepeatedly(lobbyModel); } catch(e){ console.warn('runPurgesRepeatedly 실패:', e); }
      
      scene.add(lobbyModel);
    },
    undefined,
    (err) => console.warn('GLB 로드 실패:', err)
  );

  window.addEventListener('resize', onResize);
}

function moveToTarget(targetPoint) {
  if (!controls || !camera) return;
  const clamped = targetPoint.clone();
  clamped.x = Math.max(LOBBY_BOUNDS.minX, Math.min(LOBBY_BOUNDS.maxX, clamped.x));
  clamped.y = Math.max(LOBBY_BOUNDS.minY, Math.min(LOBBY_BOUNDS.maxY, clamped.y));
  clamped.z = Math.max(LOBBY_BOUNDS.minZ, Math.min(LOBBY_BOUNDS.maxZ, clamped.z));
  const dir = new THREE.Vector3().subVectors(clamped, camera.position).normalize();
  const idealDistance = Math.min(12, Math.max(8, camera.position.distanceTo(clamped) * 0.6));
  targetLookAt.copy(clamped);
  targetPosition.copy(clamped).sub(dir.multiplyScalar(idealDistance));
  targetPosition.y = Math.max(1.5, Math.min(15, targetPosition.y));
  isMovingToTarget = true;
}

function moveCameraTo(cameraPos, cameraTarget) {
  if (!controls || !camera) return;
  const pos = new THREE.Vector3(cameraPos.x, cameraPos.y, cameraPos.z);
  const tgt = new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z);

  tgt.x = Math.max(LOBBY_BOUNDS.minX, Math.min(LOBBY_BOUNDS.maxX, tgt.x));
  tgt.y = Math.max(LOBBY_BOUNDS.minY, Math.min(LOBBY_BOUNDS.maxY, tgt.y));
  tgt.z = Math.max(LOBBY_BOUNDS.minZ, Math.min(LOBBY_BOUNDS.maxZ, tgt.z));

  pos.x = Math.max(LOBBY_BOUNDS.minX, Math.min(LOBBY_BOUNDS.maxX, pos.x));
  pos.y = Math.max(LOBBY_BOUNDS.minY, Math.min(LOBBY_BOUNDS.maxY, pos.y));
  pos.z = Math.max(LOBBY_BOUNDS.minZ, Math.min(LOBBY_BOUNDS.maxZ, pos.z));

  targetLookAt.copy(tgt);
  targetPosition.copy(pos);
  isMovingToTarget = true;
}

function findDeskFromObject(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.isDesk) return cur;
    cur = cur.parent;
  }
  return null;
}

function onCanvasClick(event) {
  if (!controls || !camera) return;

  if (deptRoot && deptRoot.classList.contains('open')) return;
  if (deskModal && deskModal.classList.contains('open')) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const meshes = [];
  if (lobbyModel) lobbyModel.traverse((c) => { if (c.isMesh) meshes.push(c); });

  const hits = raycaster.intersectObjects(meshes, true);

  if (hits.length > 0) {
    let deskMesh = null;
    let hitPoint = null;
    for (const h of hits) {
      const d = findDeskFromObject(h.object);
      if (d) { deskMesh = d; hitPoint = h.point?.clone?.() || null; break; }
    }

    if (deskMesh) {
      const deskId = deskMesh.userData.deskId || deskMesh.userData.deskName || normalizePlaneName(deskMesh.name) || deskMesh.name;
      const mapped = DESK_LINKS[deskId];
      if (mapped) {
        window.location.href = mapped;
        return;
      }

      const label = deskMesh.userData.label;
      const deptKey = DESK_TO_DEPTKEY[label] || null;
      selectedDeskData = {
        deptKey,
        label,
        deskId: deskId,
        planetIndex: deskMesh.userData.planetIndex,
        hitPoint
      };
      showDeptPanel(selectedDeskData);
      return;
    }

    hideDeptPanel();
    moveToTarget(hits[0].point);
    return;
  }

  raycaster.ray.intersectPlane(groundPlane, groundIntersect);
  hideDeptPanel();
  moveToTarget(groundIntersect);
}

function getDeskDataFromObject(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.isDesk) return cur.userData;
    cur = cur.parent;
  }
  return null;
}

function onCanvasTouch(event) {
  event.preventDefault();
  if (!controls || !camera || event.touches.length === 0) return;

  if (deptRoot && deptRoot.classList.contains('open')) return;
  if (deskModal && deskModal.classList.contains('open')) return;

  const touch = event.touches[0];
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const meshes = [];
  if (lobbyModel) lobbyModel.traverse((c) => { if (c.isMesh) meshes.push(c); });

  const hits = raycaster.intersectObjects(meshes, true);

  if (hits.length > 0) {
    let deskMesh = null;
    let hitPoint = null;
    for (const h of hits) {
      const d = findDeskFromObject(h.object);
      if (d) { deskMesh = d; hitPoint = h.point?.clone?.() || null; break; }
    }

    if (deskMesh) {
      const deskId = deskMesh.userData.deskId || deskMesh.userData.deskName || normalizePlaneName(deskMesh.name) || deskMesh.name;
      const mapped = DESK_LINKS[deskId];
      if (mapped) {
        window.location.href = mapped;
        return;
      }

      const label = deskMesh.userData.label;
      const deptKey = DESK_TO_DEPTKEY[label] || null;
      selectedDeskData = {
        deptKey,
        label,
        deskId: deskId,
        planetIndex: deskMesh.userData.planetIndex,
        hitPoint
      };
      showDeptPanel(selectedDeskData);
      return;
    }

    hideDeptPanel();
    moveToTarget(hits[0].point);
    return;
  }

  raycaster.ray.intersectPlane(groundPlane, groundIntersect);
  hideDeptPanel();
  moveToTarget(groundIntersect);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function clampTargetAndCamera() {
  const t = controls.target;
  t.x = Math.max(LOBBY_BOUNDS.minX, Math.min(LOBBY_BOUNDS.maxX, t.x));
  t.y = Math.max(LOBBY_BOUNDS.minY, Math.min(LOBBY_BOUNDS.maxY, t.y));
  t.z = Math.max(LOBBY_BOUNDS.minZ, Math.min(LOBBY_BOUNDS.maxZ, t.z));
  const p = camera.position;
  p.x = Math.max(LOBBY_BOUNDS.minX, Math.min(LOBBY_BOUNDS.maxX, p.x));
  p.y = Math.max(LOBBY_BOUNDS.minY, Math.min(LOBBY_BOUNDS.maxY, p.y));
  p.z = Math.max(LOBBY_BOUNDS.minZ, Math.min(LOBBY_BOUNDS.maxZ, p.z));
}

function updateDeskCylinderLabelFacing() {
  if (!camera || deskCylLabels.length === 0) return;

  const cylPos = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);

  for (const item of deskCylLabels) {
    const { cylinder, texture } = item;
    if (!cylinder || !texture) continue;

    cylinder.getWorldPosition(cylPos);

    const dx = camPos.x - cylPos.x;
    const dz = camPos.z - cylPos.z;
    const angle = Math.atan2(dx, dz);

    let u = (angle / (Math.PI * 2));
    u = (u % 1 + 1) % 1;

    texture.offset.x = (0.5 - u);
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !scene || !camera || !controls) return;
  if (isMovingToTarget) {
    if (camera.position.distanceTo(targetPosition) < 0.1 && controls.target.distanceTo(targetLookAt) < 0.1) {
      isMovingToTarget = false;
      camera.position.copy(targetPosition);
      controls.target.copy(targetLookAt);
    } else {
      camera.position.lerp(targetPosition, MOVE_SPEED);
      controls.target.lerp(targetLookAt, MOVE_SPEED);
      clampTargetAndCamera();
    }
  } else {
    controls.update();
    clampTargetAndCamera();
  }
  updateDeskCylinderLabelFacing();
  renderer.render(scene, camera);
}

initIntro();
initThree();
animate();
