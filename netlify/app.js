/**
 * (주)누리온홀딩스 3D 로비
 * - 인트로 후 LOBBY_MODEL_PATH(GLB) 로드. 기본 minimal(원본만). full=데스크 행성 등(이름이 예전 로비와 맞을 때만).
 * - 브라우저가 읽는 건 netlify/bundle.js 뿐(esbuild). 이 파일만 고치면 반영 안 됨 → npm run build:netlify 또는 watch:netlify
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/** app.js 수정 후 bundle 재생성했는지 확인용(콘솔·?lobbydebug=1 패널) */
const LOBBY_BUILD_STAMP = "20260411a";
try {
  window.__LOBBY_BUILD_STAMP = LOBBY_BUILD_STAMP;
} catch (_) {}
console.info("[LOBBY] bundle stamp:", LOBBY_BUILD_STAMP);

// GLB에서 삭제할 오브젝트 이름 패턴 (사람·검은 판떼기·텍스트)
const HIDE_PEOPLE_PATTERN = /armature|human|person|character|body|man|woman|people|head|hair|arm|leg|hand|foot|torso|face|skin|rig|bone|limb|cap|shirt|pants|shoe|avatar|figure|shadow|silhouette|panel|slab|outline|black/;
const HIDE_TEXT_PATTERN = /^text\.|text$/i;
const HIDE_FLOOR_LINE_MAT_PATTERN = /road_line|line_neon/;
const DEBUG_LOG_GLB_NAMES = false;
/** 이름이 정확히 일치하면 메시 제거(예: GLB에 남은 오브젝트명을 문자열로 추가) */
const HIDE_OBJECT_NAMES_EXACT = [];

/** 바닥 위 Blender 기본체(Cube/Cylinder 등) — 이름·높이로 제거. 패턴에 없으면 FLOOR_OBSTACLE_NAMES_EXACT */
const FLOOR_OBSTACLE_NAME_PATTERN = /^(?:Cube|Circle|Cylinder|Sphere|Cone)(?:\.\d+)?$/i;
const FLOOR_OBSTACLE_NAMES_EXACT = [];
/** 바닥면(floorRefY) 위로 중심이 이 정도 넘으면 제외(조명·상부 메시 방지) */
const FLOOR_OBSTACLE_MAX_CENTER_ABOVE_FLOOR = 2.35;
/** 바닥면 기준 꼭대기가 이 높이를 넘으면 제외(기둥 등) */
const FLOOR_OBSTACLE_MAX_TOP_ABOVE_FLOOR = 3.45;
const FLOOR_OBSTACLE_MAX_DIM = 22;
/** 메시 하단이 바닥면에서 이만큼 위에 있으면 ‘바닥 위’가 아님(파란 매트·소형 단차 포함) */
const FLOOR_OBSTACLE_MAX_ONFLOOR_GAP = 1.35;
/** 실내 박스(LOBBY_BOUNDS) XZ 중심 근처 — 전역 bbox 중심과 어긋나는 로비 중앙 장애물용 */
const FLOOR_CENTER_OBSTACLE_RADIUS_FRAC = 0.5;
/** 아주 작은 중앙 장애물(키오스크 등) 추가 반경 비율 */
const FLOOR_TINY_OBSTACLE_RADIUS_FRAC = 0.38;

/**
 * 에셋·dept HTML 의 기준 URL. 우선순위: meta[name=lobby-asset-base] → bundle.js 위치 → document.baseURI
 * (루트 index 에서 netlify/ 만 쓰는 경우 meta 에 content="netlify/" 를 두면 확실합니다.)
 */
function getBundleScriptBaseUrl() {
  const meta = document.querySelector('meta[name="lobby-asset-base"]');
  if (meta && meta.content != null) {
    const c = String(meta.content).trim();
    if (c && c.toLowerCase() !== "auto") {
      try {
        const pageDir = new URL(".", location.href).href;
        return new URL(c, pageDir).href;
      } catch (e) {
        console.warn("[LOBBY] meta lobby-asset-base 무시:", meta.content, e);
      }
    }
  }
  const list = document.querySelectorAll('script[type="module"][src*="bundle.js"]');
  const el = list.length ? list[list.length - 1] : null;
  if (el && el.src) {
    return new URL(".", el.src).href;
  }
  return new URL("./", document.baseURI).href;
}

function assetUrl(relativePath) {
  return new URL(relativePath, getBundleScriptBaseUrl()).href;
}

/** PC·모바일 공통 진입 영상 */
const INTRO_SHARED = assetUrl("assets/intro.mp4");
/** PC 3D 로비 바닥(파란 면) 동영상 텍스처 */
const VIDEO_AD_PATH = assetUrl("assets/intro.mp4");
/** 모바일: 인트로 후 재생할 2.5D 로비 영상(추후 `assets/lobby_2d5.mp4`로 교체) */
const LOBBY_25D_VIDEO = assetUrl("assets/lobby_2d5.mp4");

/**
 * GLB 파일만 덮어썼는데 화면이 예전 그대로면 대부분 브라우저 캐시 — 아래 숫자만 1 올리고 bundle 재빌드.
 * @type {string}
 */
const LOBBY_GLB_CACHE_BUST = "8";

/** netlify/assets/ 안의 로비 GLB 파일명. 부분 내보내기(용량 매우 작음)는 씬이 거의 비어 보일 수 있음 → 전체 씬 glb 권장. */
const LOBBY_GLB_FILENAME = "nurion_lobby.glb";

/**
 * 3D 로비 GLB — 배포 시 netlify/assets/{LOBBY_GLB_FILENAME} (?v= 캐시 무력화).
 * @type {string}
 */
const LOBBY_MODEL_PATH = (() => {
  const u = new URL(assetUrl("assets/" + LOBBY_GLB_FILENAME));
  u.searchParams.set("v", LOBBY_GLB_CACHE_BUST);
  return u.href;
})();

/**
 * minimal: GLB를 씬에만 올림(그림자). 새 내보내기·이름이 예전과 다를 때 기본 권장.
 * full: 데스크 행성·Plane 제거·퍼지 등 — 원본 로비(Plane035 등 이름)와 맞을 때만. 아니면 메시 대부분이 지워져 모니터만 남을 수 있음.
 * @type {'minimal' | 'full'}
 */
const LOBBY_PROCESSING = "minimal";

/** URL: ?lobbyMinimal=1 → minimal | ?lobbyFull=1 → full (행성 데스크·바닥영상 등). 기본은 LOBBY_PROCESSING. */
function effectiveLobbyProcessing() {
  try {
    const q = location.search || "";
    if (/[?&]lobbyMinimal=1(?:&|$)/i.test(q)) return "minimal";
    if (/[?&]lobbyFull=1(?:&|$)/i.test(q)) return "full";
  } catch (_) {}
  return LOBBY_PROCESSING;
}

/**
 * index.html 이 모바일에서 로드된 경우(리다이렉트 우회 등)에만 의미 있음.
 * 일반 모바일은 head 에서 mobile-lobby.html 로 보내므로 여기까지 오지 않음.
 * true: WebGL 생략 · 인트로 후 #mobile-lobby-25d(2.5D) 분기 — ?mobileLobby=1 로 PC에서 테스트 시에만 사용 권장.
 */
function isMobileDevice() {
  try {
    const q = location.search || "";
    if (/[?&](?:force3d|desktop|pc)=1(?:&|$)/i.test(q)) return false;
    if (/[?&](?:forceMobile|mobileLobby)=1(?:&|$)/i.test(q)) return true;
    const ua = navigator.userAgent || "";
    if (
      /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile\/|Silk|wv\)|SamsungBrowser/i.test(ua) ||
      /iPad|Android(?!.*Mobile)/i.test(ua)
    ) {
      return true;
    }
    if (typeof window.matchMedia === "function") {
      try {
        if (window.matchMedia("(max-width: 900px)").matches && window.matchMedia("(pointer: coarse)").matches) {
          return true;
        }
      } catch (_) {}
    }
    try {
      if (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0 && window.innerWidth < 900) {
        return true;
      }
    } catch (_) {}
    return false;
  } catch (_) {
    return false;
  }
}

function useMobileLobbyPath() {
  try {
    const q = location.search || "";
    if (/[?&](?:force3d|desktop|pc)=1(?:&|$)/i.test(q)) return false;
    if (/[?&]mobileLobby=1(?:&|$)/i.test(q)) return true;
  } catch (_) {}
  return isMobileDevice();
}

// 5개 모니터별 행성 텍스처 — planetTexture 만 바꾸면 됨 (full 모드 + 데스크 치환 시)
// 예: jupiter.png, mars.png, moon.png, saturn.jpg, saturn_ring.png, venus.png
const DESK_LABELS = [
  // 1. Plane035
  { name: 'Plane035', label: '기업컨설팅', planetTexture: assetUrl('assets/textures/planets/jupiter.png'), cameraPos: {x: -6, y: 3.5, z: 6}, cameraTarget: {x: -2, y: 2, z: 3} },
  // 2. Plane040
  { name: 'Plane040', label: '인터넷신문사', planetTexture: assetUrl('assets/textures/planets/mars.png'), cameraPos: {x: 4, y: 3.5, z: 6}, cameraTarget: {x: 2, y: 2, z: 3} },
  // 3. Plane047
  { name: 'Plane047', label: '창고형 전자문서', planetTexture: assetUrl('assets/textures/planets/moon.png'), cameraPos: {x: 8, y: 3.5, z: 2}, cameraTarget: {x: 6, y: 2, z: 1} },
  // 4. Plane054
  { name: 'Plane054', label: '응용 소프트웨어 개발', planetTexture: assetUrl('assets/textures/planets/saturn_ring.png'), cameraPos: {x: 2, y: 3.5, z: -6}, cameraTarget: {x: 1, y: 2, z: -3} },
  // 5. Plane061
  { name: 'Plane061', label: '태양광 사업', planetTexture: assetUrl('assets/textures/planets/venus.png'), cameraPos: {x: -4, y: 3.5, z: -6}, cameraTarget: {x: -2, y: 2, z: -3} },
];

/**
 * 각 데스크 모니터 앞 벽면 Cube(GLB 이름) — DESK_LABELS 와 같은 순서로 사업부명 라벨 부착.
 * (monitor_planet1~5 앞 Cube: .023, .027, .028, .029, .032)
 */
const MONITOR_WALL_CUBE_MESH_NAMES = [
  "Cube.023",
  "Cube.027",
  "Cube.028",
  "Cube.029",
  "Cube.032",
];

/** 사업부명 돌출 레이어(동일 텍스처 다층) + animate() 에서 펄스·UV 이동 */
const WALL_DEPT_EXTRUDE_LAYERS = 18;
const WALL_DEPT_LAYER_STEP = 0.014;
const wallDeptExtrusionAnimators = [];

console.info(
  "[LOBBY] 에셋 기준:",
  getBundleScriptBaseUrl(),
  "| GLB:",
  LOBBY_MODEL_PATH,
  "| GLB 캐시버스트:",
  LOBBY_GLB_CACHE_BUST,
  "(바꿀 때마다 +1)",
  "| 후처리:",
  effectiveLobbyProcessing(),
  "(minimal=원본 | URL ?lobbyFull=1=행성·바닥 등 full)"
);

const DESK_TO_DEPTKEY = {
  '기업컨설팅': 'consulting',
  '인터넷신문사': 'news',
  '창고형 전자문서': 'edocs',
  '응용 소프트웨어 개발': 'software',
  '태양광 사업': 'solar',
};

const DESK_LINKS = {
  plane035: assetUrl("dept/consulting.html"),
  plane040: assetUrl("dept/news.html"),
  plane047: assetUrl("dept/edocs.html"),
  plane054: assetUrl("dept/software.html"),
  plane061: assetUrl("dept/solar.html"),
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
  solar: {
    kicker: 'SOLAR',
    title: '태양광사업',
    sub: '지붕형·영농형·주민참여형·RE100·협동조합 설립까지 통합 지원',
    blocks: [
      { title: '1) 사업 유형·구조', items: ['지붕형·영농형·주차장형', '주민참여형 검토', 'RE100·탄소중립 방향', '부지·건물 특성 정리'] },
      { title: '2) 협동조합·문서', items: ['정관·총회 기초안', '주민 설명자료', 'PM·협의 문안', '인허가 기초 문서'] },
      { title: '3) 인허가·운영', items: ['대관·절차 정리', '사업 문서·PM 범위', '실무 협의 동선', '후속 운영 기준'] },
      { title: '4) 실행·확장', items: ['추진 단계별 검토', '역할 분담', '후속 보완 방향', '운영 정착 지원'] },
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

/** GLB에 이 이름의 오브젝트가 있으면 진입 카메라를 여기 기준으로 둠(없으면 자동 박스 방식) */
const LOBBY_CAMERA_ANCHOR_NAME = "Cube002";
const LOBBY_CAMERA_ANCHOR_FORWARD_M = 2;
const LOBBY_CAMERA_ANCHOR_UP_M = 2;

const _floorEstBox = new THREE.Box3();
const _cubeAnchorBox = new THREE.Box3();
const _v3AnchorPos = new THREE.Vector3();
const _v3AnchorFwd = new THREE.Vector3();
const _anchorQuat = new THREE.Quaternion();
const _flipLookT = new THREE.Vector3();

/**
 * 전역 bbox.minY는 지형·기단 때문에 실제 로비 바닥면보다 낮을 수 있음.
 * 얇은 메시의 world 상단 Y 중 하단 띠에 있는 후보로 바닥면 높이를 추정한다.
 */
function estimateLobbyFloorSurfaceY(model, worldBox) {
  const sy = worldBox.max.y - worldBox.min.y;
  if (sy < 0.05) return null;
  const lowBand = worldBox.min.y + sy * 0.28;
  let best = worldBox.min.y;
  let found = false;
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    _floorEstBox.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    const h = _floorEstBox.max.y - _floorEstBox.min.y;
    const thin = h < Math.max(sy * 0.16, 0.28);
    if (thin && _floorEstBox.max.y <= lowBand && _floorEstBox.max.y >= worldBox.min.y - 0.05) {
      best = Math.max(best, _floorEstBox.max.y);
      found = true;
    }
  });
  return found ? best : null;
}

/** GLB 외곽 박스에서 안쪽으로 들여 '로비 실내' 이동 범위만 만듭니다. (밖으로 팽창하면 카메라가 외벽 밖으로 나감) */
function expandLobbyBoundsFromModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return;
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  const span = Math.max(sx, sy, sz, 1);
  const insetH = Math.min(Math.max(0.45, span * 0.07), sx * 0.45, sz * 0.45, 8);
  LOBBY_BOUNDS.minX = box.min.x + insetH;
  LOBBY_BOUNDS.maxX = box.max.x - insetH;
  LOBBY_BOUNDS.minZ = box.min.z + insetH;
  LOBBY_BOUNDS.maxZ = box.max.z - insetH;
  // 야외 지면·건물 하부 외곽이 bbox 최하단에 있으면 minY가 실내 바닥보다 낮아져
  // 카메라가 ‘밖·아래’에서 시작하는 것처럼 보임 → 세로 높이 비율로 하단을 더 들임
  const insetBottom = Math.min(4.2, Math.max(0.38, sy * 0.075));
  // 천장·지붕 메시에 가깝지 않게 위쪽을 더 들여 실내 체류 구간을 바닥~중간 높이로
  const insetTop = Math.min(3.2, Math.max(0.55, sy * 0.14));
  const meshFloorY = estimateLobbyFloorSurfaceY(model, box);
  let minY = box.min.y + insetBottom;
  if (meshFloorY != null && meshFloorY > box.min.y + 0.06) {
    minY = Math.max(minY, meshFloorY - 0.03);
  }
  LOBBY_BOUNDS.minY = minY;
  LOBBY_BOUNDS.maxY = box.max.y - insetTop;
  if (meshFloorY != null) {
    console.info("[LOBBY] 바닥면 추정 Y:", meshFloorY.toFixed(3), "(bbox.min:", box.min.y.toFixed(3), ")");
  }
  if (LOBBY_BOUNDS.minX >= LOBBY_BOUNDS.maxX) {
    const m = (box.min.x + box.max.x) * 0.5;
    LOBBY_BOUNDS.minX = m - 0.08;
    LOBBY_BOUNDS.maxX = m + 0.08;
  }
  if (LOBBY_BOUNDS.minZ >= LOBBY_BOUNDS.maxZ) {
    const m = (box.min.z + box.max.z) * 0.5;
    LOBBY_BOUNDS.minZ = m - 0.08;
    LOBBY_BOUNDS.maxZ = m + 0.08;
  }
  if (LOBBY_BOUNDS.minY >= LOBBY_BOUNDS.maxY) {
    LOBBY_BOUNDS.minY = box.min.y + 0.08;
    LOBBY_BOUNDS.maxY = box.max.y - 0.08;
  }
}

function findLobbyObjectByName(model, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}$`, "i");
  let found = null;
  model.traverse((o) => {
    if (found) return;
    const n = (o.name || "").trim();
    if (n && re.test(n)) found = o;
  });
  return found;
}

function getObjectWorldCenter(obj, out) {
  _cubeAnchorBox.setFromObject(obj);
  if (!_cubeAnchorBox.isEmpty()) {
    _cubeAnchorBox.getCenter(out);
    return out;
  }
  return obj.getWorldPosition(out);
}

/**
 * 사람/실루엣/그림자 등(HIDE_PEOPLE_PATTERN) + 텍스트 메시 제거.
 * 예전에는 full 후처리 안에서만 돌아가 minimal 에서는 GLB 그대로였음 → 둘 다에서 호출.
 */
function removeLobbyPeopleAndTextMeshes(model) {
  const toRemove = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    const n = (child.name || "").toLowerCase();
    const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
    const matName = mats.map((m) => (m && m.name) || "").join(" ").toLowerCase();
    const rawName = child.name || "";
    const isText = HIDE_TEXT_PATTERN.test(rawName) || n.includes("text");
    const isPeople =
      HIDE_PEOPLE_PATTERN.test(n) || HIDE_PEOPLE_PATTERN.test(matName) || HIDE_OBJECT_NAMES_EXACT.includes(rawName);
    if (isText || isPeople) toRemove.push(child);
  });
  toRemove.forEach((obj) => {
    if (obj.parent) obj.parent.remove(obj);
  });
  if (toRemove.length) {
    console.info("[LOBBY] people/text 메시 제거:", toRemove.length, "(minimal·full 공통)");
  }
}

/** expandLobbyBoundsFromModel 이 먼저 호출된 뒤: 시선·위치를 '내부 박스' 안에만 두도록 설정 */
function frameLobbyCameraToModel(model) {
  if (!camera || !controls || !model) return;
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) {
    console.warn("[LOBBY] 바운딩 박스가 비어 있어 카메라 자동 맞춤을 건너뜁니다.");
    return;
  }
  const outerSize = new THREE.Vector3();
  box.getSize(outerSize);
  const maxDim = Math.max(outerSize.x, outerSize.y, outerSize.z, 0.1);

  const innerW = Math.max(0.05, LOBBY_BOUNDS.maxX - LOBBY_BOUNDS.minX);
  const innerH = Math.max(0.05, LOBBY_BOUNDS.maxY - LOBBY_BOUNDS.minY);
  const innerD = Math.max(0.05, LOBBY_BOUNDS.maxZ - LOBBY_BOUNDS.minZ);
  const innerMin = Math.min(innerW, innerH, innerD);

  model.updateMatrixWorld(true);
  const anchor = findLobbyObjectByName(model, LOBBY_CAMERA_ANCHOR_NAME);
  if (anchor) {
    getObjectWorldCenter(anchor, _v3AnchorPos);
    anchor.getWorldQuaternion(_anchorQuat);
    _v3AnchorFwd.set(0, 0, -1).applyQuaternion(_anchorQuat).normalize();
    camera.position.copy(_v3AnchorPos).addScaledVector(_v3AnchorFwd, LOBBY_CAMERA_ANCHOR_FORWARD_M);
    camera.position.y += LOBBY_CAMERA_ANCHOR_UP_M;
    controls.target.copy(_v3AnchorPos);
    clampTargetAndCamera();
    controls.update();
    console.info(
      "[LOBBY] 앵커 진입:",
      LOBBY_CAMERA_ANCHOR_NAME,
      "→ 로컬 −Z",
      LOBBY_CAMERA_ANCHOR_FORWARD_M,
      "m + 월드 Y",
      LOBBY_CAMERA_ANCHOR_UP_M,
      "m (이후 시선 180° 반전)"
    );
  } else {
    const innerCx = (LOBBY_BOUNDS.minX + LOBBY_BOUNDS.maxX) * 0.5;
    const innerCz = (LOBBY_BOUNDS.minZ + LOBBY_BOUNDS.maxZ) * 0.5;
    const floorY = LOBBY_BOUNDS.minY;

    const lookY = floorY + Math.min(Math.max(innerH * 0.12, 1.0), 1.45);
    controls.target.set(innerCx, lookY, innerCz);

    let eyeY = floorY + 2.0;
    eyeY = Math.min(eyeY, LOBBY_BOUNDS.maxY - 0.15);
    eyeY = Math.max(eyeY, LOBBY_BOUNDS.minY + 0.12);
    const offX = innerW * 0.18;
    const offZ = innerD * 0.16;
    camera.position.set(innerCx + offX * 0.45, eyeY, innerCz + offZ * 0.4);
    clampTargetAndCamera();
    console.info(
      "[LOBBY] 바닥 +2m 눈높이 진입 (내부 W/H/D)",
      innerW.toFixed(2),
      innerH.toFixed(2),
      innerD.toFixed(2),
      "— 이후 시선 180° 반전"
    );
  }

  // 같은 카메라 위치에서 시선만 180° 반전: 새 타깃 = 2·카메라 − 기존 타깃
  _flipLookT.copy(controls.target);
  controls.target.copy(camera.position).multiplyScalar(2).sub(_flipLookT);
  clampTargetAndCamera();

  camera.near = Math.max(0.01, maxDim / 2000);
  camera.far = Math.max(600, maxDim * 80);
  camera.updateProjectionMatrix();
  if (scene && scene.fog) {
    scene.fog.near = Math.max(8, innerMin * 1.2);
    scene.fog.far = Math.max(80, maxDim * 18);
  }
  // 오빗 반경: 내부 박스에 비례해 제한 (타깃 기준 구가 실내 박스에 들어가도록)
  controls.minDistance = Math.max(0.75, innerMin * 0.045);
  let maxOrb = Math.min(innerMin * 0.24, Math.min(innerW, innerD) * 0.26);
  maxOrb = Math.min(maxOrb, 12);
  controls.maxDistance = Math.max(controls.minDistance + 0.35, maxOrb);
  controls.maxPolarAngle = Math.PI / 2 - 0.1;
  controls.update();
  clampTargetAndCamera();
  controls.update();
}

/** 브라우저에 저장된 로비 첫 진입 카메라(위치·시선). F12 콘솔에서 __saveLobbyEntry() 로 현재 화면을 진입점으로 저장 */
const LOBBY_ENTRY_STORAGE_KEY = "nurionLobbyEntryV1";

function lobbyMaxEyeYForSavedEntry() {
  const floorY = LOBBY_BOUNDS.minY;
  // 기본 진입 ~2m + 소폭 여유; 천장에 붙은 지붕 시점은 maxY 근처라 걸러짐
  return Math.min(LOBBY_BOUNDS.maxY - 0.12, floorY + 2.35);
}

function applySavedLobbyEntryIfAny() {
  if (!camera || !controls) return false;
  try {
    const raw = localStorage.getItem(LOBBY_ENTRY_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data.px !== "number" || typeof data.tx !== "number") return false;
    const maxEye = lobbyMaxEyeYForSavedEntry();
    const pyClamped = Math.max(LOBBY_BOUNDS.minY, Math.min(LOBBY_BOUNDS.maxY, data.py));
    if (pyClamped > maxEye + 0.02) {
      try {
        localStorage.removeItem(LOBBY_ENTRY_STORAGE_KEY);
      } catch (_) {}
      console.info(
        "[LOBBY] 저장된 진입점이 지붕/높이 쪽이라 무시하고 자동 프레이밍을 유지합니다. (이전에 ?clearLobbyEntry=1 또는 __clearLobbyEntry 로 지웠을 수 있음)"
      );
      return false;
    }
    camera.position.set(data.px, data.py, data.pz);
    controls.target.set(data.tx, data.ty, data.tz);
    camera.updateProjectionMatrix();
    controls.update();
    clampTargetAndCamera();
    controls.update();
    console.info("[LOBBY] 저장된 진입 카메라 적용 (저장 시각:", data.savedAt || "?", ")");
    return true;
  } catch (e) {
    console.warn("[LOBBY] 저장 진입점 파싱 실패:", e);
    return false;
  }
}

function saveLobbyEntryToStorage() {
  if (!camera || !controls) {
    console.warn("[LOBBY] 카메라가 없어 저장할 수 없습니다.");
    return;
  }
  const p = camera.position;
  const t = controls.target;
  const data = {
    px: p.x,
    py: p.y,
    pz: p.z,
    tx: t.x,
    ty: t.y,
    tz: t.z,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LOBBY_ENTRY_STORAGE_KEY, JSON.stringify(data));
    captureLobbyRecoveryCamera();
    console.info("[LOBBY] 현재 시점이 로비 진입점으로 저장되었습니다. 새로고침 후 이 위치에서 시작합니다.", data);
  } catch (e) {
    console.error("[LOBBY] localStorage 저장 실패:", e);
  }
}

function clearLobbyEntryStorage() {
  try {
    localStorage.removeItem(LOBBY_ENTRY_STORAGE_KEY);
    console.info("[LOBBY] 저장된 진입점을 삭제했습니다. 다음 로드는 자동 프레이밍을 사용합니다.");
  } catch (e) {}
}

function maybeClearLobbyEntryFromUrl() {
  try {
    if (/[?&]clearLobbyEntry=1(?:&|$)/i.test(location.search || "")) clearLobbyEntryStorage();
  } catch (_) {}
}

try {
  window.__saveLobbyEntry = saveLobbyEntryToStorage;
  window.__clearLobbyEntry = clearLobbyEntryStorage;
} catch (_) {}

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
  ['solar', document.getElementById('dept-solar')],
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
    if (v && useMobileLobbyPath()) v.pause();
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
    if (v && useMobileLobbyPath()) v.play().catch(() => {});
  } catch (e) {}

  if (updateHash) location.hash = '';
}

document.addEventListener('click', (e)=>{
  const back = e.target.closest('[data-action="dept-back"]');
  if (back) closeDept();
});

window.addEventListener('load', ()=>{
  const m = location.hash.match(/^#dept-(consulting|news|edocs|software|solar)$/);
  if (m) openDept(m[1], { updateHash:false });
});
window.addEventListener('hashchange', ()=>{
  const m = location.hash.match(/^#dept-(consulting|news|edocs|software|solar)$/);
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

  dmKicker && (dmKicker.textContent = d.kicker || '(주)누리온홀딩스');
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

/** 유휴 시 카메라 위치만 이 지점으로 복귀(시선 방향은 복귀 직전 그대로) */
const recoveryCameraPosition = new THREE.Vector3();
let recoveryCameraCaptured = false;
/** 0 = 아직 사용자 입력 없음(유휴 복구 비활성). 이후 orbit/휠 등으로 갱신 */
let lastLobbyInputAt = 0;
let suppressIdleRecoveryResetUntil = 0;
const IDLE_RECOVERY_MS = 3000;
/** 로비 AABB 경계에 너무 가까울 때(벽 밖 시야 느낌) 유휴 복구까지 대기 시간 */
const EDGE_RECOVERY_MS = 1000;

function captureLobbyRecoveryCamera() {
  if (!camera || !controls) return;
  recoveryCameraPosition.copy(camera.position);
  recoveryCameraCaptured = true;
}

function applyIdleRecoveryToCamera() {
  if (!camera || !controls || !recoveryCameraCaptured) return;
  try {
    if (window.__isMobile) return;
  } catch (_) {}
  if (isMovingToTarget) return;
  const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
  const len = dir.length();
  if (len < 1e-4) {
    lastLobbyInputAt = performance.now();
    return;
  }
  dir.multiplyScalar(1 / len);
  const dist = Math.max(controls.minDistance + 0.001, Math.min(controls.maxDistance, len));
  camera.position.copy(recoveryCameraPosition);
  controls.target.copy(recoveryCameraPosition).addScaledVector(dir, dist);
  clampTargetAndCamera();
  controls.update();
  suppressIdleRecoveryResetUntil = performance.now() + 450;
  lastLobbyInputAt = performance.now();
}

function pingIdleRecoveryUserActivity() {
  if (performance.now() < suppressIdleRecoveryResetUntil) return;
  if (!recoveryCameraCaptured) return;
  lastLobbyInputAt = performance.now();
}

try {
  window.__captureLobbyRecoveryCamera = captureLobbyRecoveryCamera;
} catch (_) {}

/** 인트로 종료 직후: ?mobileLobby=1 일 때만 2.5D 로비(그 외에는 3D 캔버스 유지) */
function enterMainAfterIntro() {
  if (!useMobileLobbyPath()) return;
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

/** index.html 이 루트(netlify/) 또는 저장소 루트에서 열렸는지에 따라 모바일 로비 HTML 경로 */
function mobileLobbyHtmlPath() {
  try {
    const m = document.querySelector('meta[name="lobby-asset-base"]');
    const c = (m && m.getAttribute("content")) || "";
    if (!c || c === "auto") return "mobile-lobby.html";
    if (/netlify/i.test(c)) return "netlify/mobile-lobby.html";
  } catch (_) {}
  return "mobile-lobby.html";
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
    try {
      container.classList.add('hidden');
      container.style.zIndex = '0';
      container.style.visibility = 'hidden';
      container.style.display = 'none';
    } catch (e) {}
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
    try {
      video.load();
    } catch (e) {}

    const tryPlay = () => {
      if (done || !video) return;
      const pp = video.play();
      if (pp && pp.catch) {
        pp.catch((e) => {
          if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) return;
          console.warn("intro play failed:", e);
          showLobby();
        });
      }
    };
    video.addEventListener("canplay", tryPlay, { once: true });
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
  }, isMobileDevice() ? 5000 : 2500);

  /** 사업부 상세의 "로비로" 링크(?lobby=1): PC는 인트로 생략 후 3D. 모바일은 PNG 로비(mobile-lobby.html)로 이동 */
  try {
    const q = location.search || "";
    if (/[?&]lobby=1(?:&|$)/i.test(q)) {
      if (useMobileLobbyPath()) {
        location.replace(mobileLobbyHtmlPath() + q);
        return;
      }
      showLobby();
      return;
    }
  } catch (_) {}

  applyIntroSrc();
  try {
    window.addEventListener("orientationchange", applyIntroSrc);
    window.addEventListener("resize", applyIntroSrc);
  } catch (e) {}

  try {
    video && video.addEventListener("error", showLobby);
  } catch (e) {}
  try {
    video && video.addEventListener('stalled', () => setTimeout(() => !done && showLobby(), 1200));
  } catch (e) {}
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

/** 사업부명 — 흰 글자 알파만(다층 메시에 색 곱해 돌출). 이탤릭 유지 */
function createDeptNameAlphaTexture(text) {
  const w = 1536;
  const h = 640;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  const pad = Math.min(w, h) * 0.06;
  const len = Math.max(text.length, 4);
  const fontSize = Math.min(128, Math.floor((w - pad * 2) / (len * 0.82)));
  ctx.font = `italic 700 ${fontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const _wallFaceCenterA = new THREE.Vector3();
const _wallFaceCenterB = new THREE.Vector3();
const _wallNL = new THREE.Vector3();
const _lobbyMidForWall = new THREE.Vector3();

const _wallBasePos = new THREE.Vector3();

/** 벽 Cube 앞면에 사업부명: 다층 Plane으로 돌출 + 매 프레임 앞뒤 펄스·UV 흐름(원본 메시 유지) */
function addWallCubeDeptExtrudedAnimatedLabel(mesh, text) {
  if (!mesh?.isMesh || !mesh.geometry || mesh.userData.__wallDeptLabel) return;
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const min = g.boundingBox.min;
  const max = g.boundingBox.max;
  const sx = max.x - min.x;
  const sy = max.y - min.y;
  const sz = max.z - min.z;
  const midLocal = new THREE.Vector3((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);

  _lobbyMidForWall.set(
    (LOBBY_BOUNDS.minX + LOBBY_BOUNDS.maxX) * 0.5,
    (LOBBY_BOUNDS.minY + LOBBY_BOUNDS.maxY) * 0.5,
    (LOBBY_BOUNDS.minZ + LOBBY_BOUNDS.maxZ) * 0.5
  );
  mesh.worldToLocal(_lobbyMidForWall);

  const dims = [
    { name: "x", size: sx },
    { name: "y", size: sy },
    { name: "z", size: sz },
  ];
  dims.sort((a, b) => a.size - b.size);
  const thin = dims[0].name;

  let planeW;
  let planeH;
  if (thin === "x") {
    planeW = sz * 0.9;
    planeH = sy * 0.9;
    _wallFaceCenterA.set(min.x, midLocal.y, midLocal.z);
    _wallNL.set(-1, 0, 0);
    _wallFaceCenterB.set(max.x, midLocal.y, midLocal.z);
  } else if (thin === "z") {
    planeW = sx * 0.9;
    planeH = sy * 0.9;
    _wallFaceCenterA.set(midLocal.x, midLocal.y, min.z);
    _wallNL.set(0, 0, -1);
    _wallFaceCenterB.set(midLocal.x, midLocal.y, max.z);
  } else {
    planeW = sx * 0.9;
    planeH = sz * 0.9;
    _wallFaceCenterA.set(midLocal.x, min.y, midLocal.z);
    _wallNL.set(0, -1, 0);
    _wallFaceCenterB.set(midLocal.x, max.y, midLocal.z);
  }

  const nB = _wallNL.clone().negate();
  const dotA = _wallNL.dot(_lobbyMidForWall.clone().sub(_wallFaceCenterA));
  const dotB = nB.dot(_lobbyMidForWall.clone().sub(_wallFaceCenterB));
  const useA = dotA >= dotB;
  const faceCenter = useA ? _wallFaceCenterA : _wallFaceCenterB;
  const nLoc = useA ? _wallNL : nB;
  nLoc.normalize();

  const tex = createDeptNameAlphaTexture(text);
  const group = new THREE.Group();
  group.name = `__wall_dept_extrude__${text}`;
  group.renderOrder = 14;

  _wallBasePos.copy(faceCenter).addScaledVector(nLoc, 0.016);
  group.position.copy(_wallBasePos);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nLoc);

  const cBack = new THREE.Color(0x051a2e);
  const cFront = new THREE.Color(0xccffff);
  for (let i = 0; i < WALL_DEPT_EXTRUDE_LAYERS; i++) {
    const u = WALL_DEPT_EXTRUDE_LAYERS > 1 ? i / (WALL_DEPT_EXTRUDE_LAYERS - 1) : 1;
    const col = cBack.clone().lerp(cFront, u);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.78 + u * 0.2,
      alphaTest: 0.04,
      depthWrite: u > 0.7,
      depthTest: true,
      side: THREE.DoubleSide,
      color: col,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
    plane.position.z = i * WALL_DEPT_LAYER_STEP;
    plane.renderOrder = 10 + i;
    group.add(plane);
  }

  mesh.add(group);
  mesh.userData.__wallDeptLabel = true;

  wallDeptExtrusionAnimators.push({
    group,
    basePos: _wallBasePos.clone(),
    n: nLoc.clone(),
    phase: Math.random() * Math.PI * 2,
    tex,
  });
}

function updateWallDeptExtrusionLabels() {
  const t = performance.now() * 0.001;
  for (let i = wallDeptExtrusionAnimators.length - 1; i >= 0; i--) {
    const item = wallDeptExtrusionAnimators[i];
    if (!item.group?.parent) {
      wallDeptExtrusionAnimators.splice(i, 1);
      continue;
    }
    const pulse = Math.sin(t * 1.35 + item.phase) * 0.042;
    item.group.position.copy(item.basePos).addScaledVector(item.n, pulse);
    if (item.tex) {
      item.tex.offset.x = Math.sin(t * 0.62 + item.phase) * 0.038;
      item.tex.offset.y = Math.cos(t * 0.48 + item.phase * 0.55) * 0.018;
    }
  }
}

function applyMonitorWallCubeDeptLabels(model) {
  if (!model || MONITOR_WALL_CUBE_MESH_NAMES.length !== DESK_LABELS.length) return;
  model.updateMatrixWorld(true);
  let count = 0;
  MONITOR_WALL_CUBE_MESH_NAMES.forEach((raw, i) => {
    const label = DESK_LABELS[i]?.label || "";
    if (!label) return;
    const obj = findLobbyObjectByName(model, raw.trim());
    if (!obj) {
      console.warn("[LOBBY] 벽 Cube GLB에서 찾지 못함(이름·대소문자 확인):", raw);
      return;
    }
    if (obj.isMesh) {
      addWallCubeDeptExtrudedAnimatedLabel(obj, label);
      count++;
      return;
    }
    let applied = false;
    obj.traverse((child) => {
      if (applied || !child.isMesh) return;
      addWallCubeDeptExtrudedAnimatedLabel(child, label);
      applied = true;
      count++;
    });
    if (!applied) console.warn("[LOBBY] 벽 Cube 오브젝트에 Mesh 자식 없음:", raw, obj.type);
  });
  if (count) console.info("[LOBBY] 벽 Cube 사업부명 돌출·움직임 라벨 부착:", count);
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

function findNearestMeshToPoint(meshes, worldPoint) {
  let best = null;
  let bestD = Infinity;
  const p = new THREE.Vector3();
  for (const m of meshes) {
    m.getWorldPosition(p);
    const d = p.distanceTo(worldPoint);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return { best, bestD };
}

const _colBox = new THREE.Box3();
const _colSize = new THREE.Vector3();

/**
 * 데스크 옆 홀로그램 기둥 후보. Cylinder 외 Cone/Lathe·이름 패턴·세로로 긴 메시(Plane 제외)까지 포함.
 * 후보가 비면 findNearest → dist=Infinity 가 되어 라벨이 빠지므로, 호출부에서 합성 앵커로 폴백합니다.
 */
function collectCylinderLabelAnchorCandidates(model) {
  const out = [];
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    if (obj.userData?.isDesk) return;
    const n = (obj.name || "").toLowerCase();
    if (n.startsWith("desk_") || n.startsWith("__desk_")) return;

    const type = (obj.geometry.type || "").toLowerCase();
    const nameHit =
      type.includes("cylinder") ||
      type.includes("cone") ||
      type.includes("lathe") ||
      n.includes("cylinder") ||
      n.includes("cone") ||
      n.includes("tube") ||
      n.includes("round") ||
      n.includes("column") ||
      n.includes("pillar") ||
      n.includes("pole") ||
      n.includes("stand") ||
      n.includes("tower");

    if (nameHit) {
      out.push(obj);
      return;
    }

    if (type.includes("plane")) return;

    try {
      obj.updateMatrixWorld(true);
      _colBox.setFromObject(obj);
      _colBox.getSize(_colSize);
      const h = _colSize.y;
      const horiz = Math.max(_colSize.x, _colSize.z);
      if (h >= 0.35 && horiz >= 0.06 && h >= horiz * 1.75) out.push(obj);
    } catch (_) {}
  });
  return out;
}

/** GLB에 매칭할 원통이 없거나 너무 멀 때, 데스크 위쪽에 보이지 않는 원통 + 라벨 슬리브 */
function addSyntheticCylinderLabelAnchor(deskMesh, text) {
  if (!deskMesh || !scene) return;
  deskMesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(deskMesh);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const anchor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, Math.min(1.5, Math.max(size.y, 0.2) + 0.5), 32),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
    })
  );
  anchor.name = `__desk_label_anchor__${text}`;
  anchor.position.copy(center);
  anchor.position.y += size.y * 0.5 + 0.9;
  anchor.renderOrder = 5;
  scene.add(anchor);
  addCameraFacingLabelSleeveOnCylinder(anchor, text);
  console.log(`✓ 라벨 앵커(합성 기둥): ${text}`);
}

function normalizePlaneName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/\./g, '').replace(/_\d+$/, '');
}

/** DESK_LABELS 순서(1~5)와 동일 — 사업부 HTML (DESK_LINKS 키 = normalizePlaneName(Plane 이름)) */
function getDeptPageUrlForPlanetSlot(slot1to5) {
  const i = slot1to5 - 1;
  if (i < 0 || i >= DESK_LABELS.length) return null;
  const key = normalizePlaneName(DESK_LABELS[i].name);
  return DESK_LINKS[key] || null;
}

/**
 * 클릭한 메시가 monitor_planet1~5 하위이거나, 모니터 앞 벽 Cube(Cube.023 등)인 경우 1~5 슬롯 반환.
 */
function findPlanetClickSlotFromObject(obj) {
  let cur = obj;
  while (cur) {
    const n = (cur.name || "").trim();
    const m = /^monitor_planet(\d+)$/i.exec(n);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (idx >= 1 && idx <= 5) return idx;
    }
    cur = cur.parent;
  }
  let cur2 = obj;
  while (cur2) {
    const key = (cur2.name || "").trim().toLowerCase();
    const wi = MONITOR_WALL_CUBE_MESH_NAMES.findIndex((x) => x.trim().toLowerCase() === key);
    if (wi >= 0) return wi + 1;
    cur2 = cur2.parent;
  }
  return null;
}

/**
 * minimal 모드(데스크 행성 치환 없음)에서도 동작: 조상 이름이 Plane035 / Plane035_8 등이면 DESK_LABELS 와 매칭.
 * full 모드에서 monitor_planet·isDesk 가 없을 때도 동일.
 */
function findDeskSlotFromPlaneMesh(obj) {
  let cur = obj;
  while (cur) {
    const key = normalizePlaneName(cur.name || "");
    const idx = DESK_LABELS.findIndex((d) => normalizePlaneName(d.name) === key);
    if (idx >= 0) return idx + 1;
    cur = cur.parent;
  }
  return null;
}

function openDeptForPlanetSlot(slot1to5, hitPoint) {
  const url = getDeptPageUrlForPlanetSlot(slot1to5);
  if (url) {
    window.location.href = url;
    return true;
  }
  const i = slot1to5 - 1;
  const label = DESK_LABELS[i]?.label;
  if (!label) return false;
  const deptKey = DESK_TO_DEPTKEY[label] || null;
  const deskId = normalizePlaneName(DESK_LABELS[i].name);
  selectedDeskData = {
    deptKey,
    label,
    deskId,
    planetIndex: i,
    planetPath: DESK_LABELS[i]?.planetTexture || null,
    hitPoint: hitPoint || null,
  };
  showDeptPanel(selectedDeskData);
  return true;
}

const _floorObsBox = new THREE.Box3();
const _floorObsSize = new THREE.Vector3();
const _floorObsCenter = new THREE.Vector3();

function isLobbyCameraAnchorMeshName(name) {
  if (!name || !LOBBY_CAMERA_ANCHOR_NAME) return false;
  return name.trim().toLowerCase() === LOBBY_CAMERA_ANCHOR_NAME.trim().toLowerCase();
}

/** 바닥 장애물: (1) Blender 기본체 이름 (2) 실내 박스 XZ 중심 근처·바닥면 위 작은 메시. minimal·full 공통 */
function removeFloorObstacleMeshes(model) {
  const deskKeys = new Set(DESK_LABELS.map((d) => normalizePlaneName(d.name)));
  const deskArrowPlaneKeys = new Set();
  DESK_ARROW_PLANES.forEach((g) => {
    g.names.forEach((n) => deskArrowPlaneKeys.add(normalizePlaneName(n)));
  });
  const removed = [];
  model.updateMatrixWorld(true);
  expandLobbyBoundsFromModel(model);

  const toRemoveSet = new Set();

  const worldBoxForFloor = new THREE.Box3().setFromObject(model);
  const floorRefY = worldBoxForFloor.isEmpty()
    ? 0
    : estimateLobbyFloorSurfaceY(model, worldBoxForFloor) ?? worldBoxForFloor.min.y;

  const innerW = Math.max(0.05, LOBBY_BOUNDS.maxX - LOBBY_BOUNDS.minX);
  const innerD = Math.max(0.05, LOBBY_BOUNDS.maxZ - LOBBY_BOUNDS.minZ);
  const lobbyCx = (LOBBY_BOUNDS.minX + LOBBY_BOUNDS.maxX) * 0.5;
  const lobbyCz = (LOBBY_BOUNDS.minZ + LOBBY_BOUNDS.maxZ) * 0.5;
  /** GLB 전역 bbox XZ 중심(실내 LOBBY_BOUNDS 중심과 다를 수 있음 — 휴리스틱 2·3번 앵커) */
  const worldCx = worldBoxForFloor.isEmpty()
    ? lobbyCx
    : (worldBoxForFloor.min.x + worldBoxForFloor.max.x) * 0.5;
  const worldCz = worldBoxForFloor.isEmpty()
    ? lobbyCz
    : (worldBoxForFloor.min.z + worldBoxForFloor.max.z) * 0.5;

  /** 모니터 앞 사업부명 붙일 벽 Cube — 바닥 장애물 휴리스틱(Cube.* 제거)에서 반드시 제외 */
  const monitorWallCubeKeys = new Set(MONITOR_WALL_CUBE_MESH_NAMES.map((n) => n.trim().toLowerCase()));

  const excludeDeskAndFloor = (o) => {
    const name = (o.name || "").trim();
    const low = name.toLowerCase();
    if (monitorWallCubeKeys.has(low)) return true;
    if (low.includes("floor")) return true;
    if (isLobbyCameraAnchorMeshName(name)) return true;
    if (deskKeys.has(normalizePlaneName(name))) return true;
    if (deskArrowPlaneKeys.has(normalizePlaneName(name))) return true;
    if (low.startsWith("desk_")) return true;
    return false;
  };

  model.traverse((o) => {
    if (!o.isMesh || o.userData?.isDesk) return;
    const name = (o.name || "").trim();
    if (!name) return;
    const matchesPattern = FLOOR_OBSTACLE_NAME_PATTERN.test(name);
    const matchesExact = FLOOR_OBSTACLE_NAMES_EXACT.includes(name);
    if (!matchesPattern && !matchesExact) return;
    if (excludeDeskAndFloor(o)) return;

    _floorObsBox.setFromObject(o);
    _floorObsBox.getSize(_floorObsSize);
    _floorObsBox.getCenter(_floorObsCenter);
    const maxDim = Math.max(_floorObsSize.x, _floorObsSize.y, _floorObsSize.z);
    if (maxDim > FLOOR_OBSTACLE_MAX_DIM) return;
    if (_floorObsBox.min.y < floorRefY - 0.2) return;
    if (_floorObsBox.min.y > floorRefY + FLOOR_OBSTACLE_MAX_ONFLOOR_GAP) return;
    if (_floorObsCenter.y > floorRefY + FLOOR_OBSTACLE_MAX_CENTER_ABOVE_FLOOR) return;
    if (_floorObsBox.max.y > floorRefY + FLOOR_OBSTACLE_MAX_TOP_ABOVE_FLOOR) return;

    toRemoveSet.add(o);
  });

  const rLobby = Math.min(innerW, innerD) * FLOOR_CENTER_OBSTACLE_RADIUS_FRAC;
  const rTiny = Math.min(innerW, innerD) * FLOOR_TINY_OBSTACLE_RADIUS_FRAC;

  const tryPassCenterObstacle = (o, maxRadius, maxDimHi, maxYSize, maxCenterAbove) => {
    if (!o.isMesh || o.userData?.isDesk) return;
    if (toRemoveSet.has(o)) return;
    if (excludeDeskAndFloor(o)) return;

    _floorObsBox.setFromObject(o);
    _floorObsBox.getSize(_floorObsSize);
    _floorObsBox.getCenter(_floorObsCenter);
    const dLobby = Math.hypot(_floorObsCenter.x - lobbyCx, _floorObsCenter.z - lobbyCz);
    const dWorld = Math.hypot(_floorObsCenter.x - worldCx, _floorObsCenter.z - worldCz);
    if (Math.min(dLobby, dWorld) > maxRadius) return;
    const maxDim = Math.max(_floorObsSize.x, _floorObsSize.y, _floorObsSize.z);
    const minH = Math.min(_floorObsSize.x, _floorObsSize.z);
    if (maxDim > maxDimHi) return;
    if (_floorObsSize.y > maxYSize) return;
    if (_floorObsBox.min.y < floorRefY - 0.2) return;
    if (_floorObsBox.min.y > floorRefY + FLOOR_OBSTACLE_MAX_ONFLOOR_GAP) return;
    if (_floorObsCenter.y > floorRefY + maxCenterAbove) return;
    if (_floorObsSize.y < 0.22 && minH > 2.5) return;

    toRemoveSet.add(o);
  };

  model.traverse((o) => {
    tryPassCenterObstacle(o, rLobby, 12, 5, 2.85);
  });

  model.traverse((o) => {
    tryPassCenterObstacle(o, rTiny, 3.2, 2.45, 2.65);
  });

  /** 실내 XZ와 겹치는 작은 바닥 물체(이름 없는 Mesh·코너 등 원형 반경 밖도 포함). 벽/큰 바닥판은 제외 */
  const roomMinSpan = Math.min(innerW, innerD);
  const tryPassInRoomFloorClutter = (o) => {
    if (!o.isMesh || o.userData?.isDesk) return;
    if (toRemoveSet.has(o)) return;
    if (excludeDeskAndFloor(o)) return;

    _floorObsBox.setFromObject(o);
    _floorObsBox.getSize(_floorObsSize);
    _floorObsBox.getCenter(_floorObsCenter);
    const minXZ = Math.min(_floorObsSize.x, _floorObsSize.z);
    const maxXZ = Math.max(_floorObsSize.x, _floorObsSize.z);
    const maxDim = Math.max(_floorObsSize.x, _floorObsSize.y, _floorObsSize.z);

    if (maxDim > 14) return;
    if (_floorObsBox.min.y < floorRefY - 0.2) return;
    if (_floorObsBox.min.y > floorRefY + FLOOR_OBSTACLE_MAX_ONFLOOR_GAP) return;
    if (_floorObsCenter.y > floorRefY + 3.05) return;
    if (_floorObsBox.max.y > floorRefY + FLOOR_OBSTACLE_MAX_TOP_ABOVE_FLOOR + 0.4) return;

    if (_floorObsSize.y > 2.0 && minXZ < 0.38 && maxXZ > minXZ * 3) return;
    if (_floorObsSize.y < 0.1 && maxXZ > 0.55 * roomMinSpan && minXZ > 0.2 * roomMinSpan) return;
    if (_floorObsSize.y < 0.14 && minXZ > 0.38 * roomMinSpan) return;

    if (_floorObsBox.max.x < LOBBY_BOUNDS.minX || _floorObsBox.min.x > LOBBY_BOUNDS.maxX) return;
    if (_floorObsBox.max.z < LOBBY_BOUNDS.minZ || _floorObsBox.min.z > LOBBY_BOUNDS.maxZ) return;

    if (maxXZ > 0.72 * roomMinSpan) return;

    toRemoveSet.add(o);
  };

  model.traverse((o) => {
    tryPassInRoomFloorClutter(o);
  });

  toRemoveSet.forEach((o) => {
    removed.push(o.name);
    try {
      if (o.material) {
        if (Array.isArray(o.material)) {
          o.material.forEach((m) => {
            if (m?.map) m.map.dispose?.();
            m?.dispose?.();
          });
        } else {
          if (o.material.map) o.material.map.dispose?.();
          o.material.dispose?.();
        }
      }
      o.geometry?.dispose?.();
      o.parent?.remove(o);
    } catch (e) {
      console.warn("removeFloorObstacleMeshes:", o.name, e);
    }
  });
  if (removed.length) console.log("🧹 바닥 장애물 제거:", removed.length, removed);
}

const _listNearBox = new THREE.Box3();
const _listC = new THREE.Vector3();
const _listS = new THREE.Vector3();

/** 이름이 비어 있어도 Three.js uuid 로 식별 가능 — 콘솔: __listLobbyMeshesNearCenter() → __removeLobbyMeshByUuid('…') */
function listLobbyMeshesNearCenter(maxRadiusFrac = 0.32) {
  if (!lobbyModel) {
    console.warn("[LOBBY] lobbyModel 없음 — GLB 로드 후 다시 실행하세요.");
    return [];
  }
  lobbyModel.updateMatrixWorld(true);
  const worldBox = new THREE.Box3().setFromObject(lobbyModel);
  if (worldBox.isEmpty()) return [];
  const sx = worldBox.max.x - worldBox.min.x;
  const sz = worldBox.max.z - worldBox.min.z;
  const cx = (worldBox.min.x + worldBox.max.x) * 0.5;
  const cz = (worldBox.min.z + worldBox.max.z) * 0.5;
  const r = Math.min(sx, sz) * maxRadiusFrac;
  const rows = [];
  lobbyModel.traverse((o) => {
    if (!o.isMesh) return;
    _listNearBox.setFromObject(o);
    _listNearBox.getCenter(_listC);
    _listNearBox.getSize(_listS);
    const dist = Math.hypot(_listC.x - cx, _listC.z - cz);
    if (dist > r) return;
    rows.push({
      name: o.name || "(unnamed)",
      uuid: o.uuid,
      distXZ: dist,
      cx: _listC.x,
      cy: _listC.y,
      cz: _listC.z,
      sx: _listS.x,
      sy: _listS.y,
      sz: _listS.z,
    });
  });
  rows.sort((a, b) => a.distXZ - b.distXZ);
  console.table(
    rows.map((row) => ({
      name: row.name,
      uuid: row.uuid,
      distXZ: +row.distXZ.toFixed(3),
      cx: +row.cx.toFixed(2),
      cy: +row.cy.toFixed(2),
      cz: +row.cz.toFixed(2),
      sx: +row.sx.toFixed(2),
      sy: +row.sy.toFixed(2),
      sz: +row.sz.toFixed(2),
    }))
  );
  console.info(
    "[LOBBY] 후보 제거: __removeLobbyMeshByUuid('uuid') — 영구 반영은 블렌더에서 이름 지정 후 app.js 의 FLOOR_OBSTACLE_NAMES_EXACT 등에 추가"
  );
  return rows;
}

function removeLobbyMeshByUuid(uuid) {
  if (!lobbyModel || !uuid) {
    console.warn("[LOBBY] lobbyModel 이 없거나 uuid 가 비어 있습니다.");
    return false;
  }
  let found = null;
  lobbyModel.traverse((o) => {
    if (o.isMesh && o.uuid === uuid) found = o;
  });
  if (!found) {
    console.warn("[LOBBY] 해당 uuid 의 Mesh 없음:", uuid);
    return false;
  }
  if (isLobbyCameraAnchorMeshName(found.name)) {
    console.warn("[LOBBY] 카메라 앵커 메시는 제거하지 않습니다:", found.name);
    return false;
  }
  try {
    if (found.material) {
      if (Array.isArray(found.material)) {
        found.material.forEach((m) => {
          if (m?.map) m.map.dispose?.();
          m?.dispose?.();
        });
      } else {
        if (found.material.map) found.material.map.dispose?.();
        found.material.dispose?.();
      }
    }
    found.geometry?.dispose?.();
    found.parent?.remove(found);
  } catch (e) {
    console.warn("[LOBBY] Mesh 제거 실패:", e);
    return false;
  }
  console.info("[LOBBY] Mesh 제거됨:", found.name || "(unnamed)", found.uuid);
  return true;
}

try {
  window.__listLobbyMeshesNearCenter = (frac) => listLobbyMeshesNearCenter(frac === undefined ? 0.32 : frac);
  window.__removeLobbyMeshByUuid = removeLobbyMeshByUuid;
} catch (_) {}

function analyzeDeskTextures(model) {
  const nameToLabel = new Map(
    DESK_LABELS.map((d) => [normalizePlaneName(d.name), d])
  );
  
  console.log('=== 데스크 모니터 화면 텍스처 분석 (지구/행성 이미지) ===');
  
  const allPlanes = [];
  model.traverse((child) => {
    if (child.isMesh && (child.name || "").toLowerCase().includes('plane')) {
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
      planet: ${deskData.planetPath || deskData.planetTexture || '-'}
    </div>
  `;
  deptPanel.classList.remove('hidden');
}

/**
 * 5개 모니터(Plane035 / Plane.035 등)에 행성 텍스처를 입힙니다.
 * 텍스처 로드가 비동기이므로 Promise로 감싸 후속(purge·원통 라벨)이 올바른 순서로 실행되게 합니다.
 */
/** 노드 이름이 Plane.035 이고 Mesh가 자식만 있을 때 등, 첫 Mesh를 집어줍니다. */
function findDeskMeshForKey(model, wantKey) {
  let picked = null;
  model.traverse((child) => {
    if (picked) return;
    const key = normalizePlaneName(child.name);
    if (key !== wantKey) return;
    if (child.isMesh) {
      picked = child;
      return;
    }
    child.traverse((c) => {
      if (picked || !c.isMesh) return;
      picked = c;
    });
  });
  return picked;
}

async function applyDeskLabelsAsync(model) {
  const foundDesks = [];
  for (const d of DESK_LABELS) {
    const want = normalizePlaneName(d.name);
    const mesh = findDeskMeshForKey(model, want);
    if (mesh) foundDesks.push({ mesh, key: want, deskInfo: d });
  }

  console.log(`=== 데스크 원본 발견: ${foundDesks.length}개 ===`);
  console.log(foundDesks.map((d) => d.mesh.name));
  try {
    window.__lobbyDeskCount = foundDesks.length;
  } catch (_) {}

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

  function replaceDeskWithIndependentMesh(desk, onDone) {
    const finish = () => {
      try {
        onDone && onDone();
      } catch (_) {}
    };
    const originalMesh = desk.mesh;
    const { label, planetTexture } = desk.deskInfo;
    const planetPath = planetTexture;

    if (!planetPath) {
      console.warn(`행성 텍스처 경로 없음: ${originalMesh.name}`);
      finish();
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

        const deskEntryIndex = DESK_LABELS.findIndex((d) => normalizePlaneName(d.name) === desk.key);
        newMesh.userData = {
          isDesk: true,
          deskId: desk.key,
          deskName: originalMesh.name,
          label,
          planetPath,
          planetIndex: deskEntryIndex >= 0 ? deskEntryIndex : undefined,
        };

        if (parent) parent.add(newMesh);
        else model.add(newMesh);

        console.log(`✓ 데스크 교체 완료: ${originalMesh.name} → ${newMesh.name} (${label})`);
        finish();
      },
      undefined,
      (err) => {
        console.error(`✗ 텍스처 로드 실패: ${originalMesh.name} - ${planetPath}`, err);
        finish();
      }
    );
  }

  await Promise.all(
    foundDesks.map(
      (desk) =>
        new Promise((resolve) => {
          replaceDeskWithIndependentMesh(desk, resolve);
        })
    )
  );
}

/**
 * minimal: 행성 데스크 치환·바닥 영상 등 full 후처리 없음.
 * 다만 사람/텍스트 제거·바닥 장애물 휴리스틱·바운딩·카메라 앵커는 적용됨.
 */
function applyMinimalLobbyPostProcess(model) {
  removeLobbyPeopleAndTextMeshes(model);
  removeFloorObstacleMeshes(model);
  expandLobbyBoundsFromModel(model);
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  scene.add(model);
  expandLobbyBoundsFromModel(model);
  applyMonitorWallCubeDeptLabels(model);
  frameLobbyCameraToModel(model);
  applySavedLobbyEntryIfAny();
  captureLobbyRecoveryCamera();
  showGlbVerifyBannerIfRequested();
  console.info(
    '[LOBBY] minimal 모드: 데스크 행성·바닥영상 등 full 후처리 없음(사람·장애물 휴리스틱·카메라는 적용). full 은 ?lobbyFull=1 또는 LOBBY_PROCESSING="full" + npm run build:netlify'
  );
}

/** URL에서 앞부분만 읽어 형식을 판별합니다(대용량 .blend 전체 다운로드 방지). */
async function sniffFirstBytesFromUrl(url, maxLen = 16) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body?.getReader?.();
  if (!reader) {
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab.slice(0, Math.min(maxLen, ab.byteLength)));
  }
  const out = new Uint8Array(maxLen);
  let n = 0;
  while (n < maxLen) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.length, maxLen - n);
    out.set(value.subarray(0, take), n);
    n += take;
  }
  try {
    await reader.cancel();
  } catch (_) {}
  return out.subarray(0, n);
}

function isBlenderBlendMagic(u8) {
  if (!u8 || u8.length < 7) return false;
  return String.fromCharCode(...u8.slice(0, 7)) === "BLENDER";
}

/** glTF 2.0 binary — magic uint32 0x46546C67 → LE 바이트 67 6C 54 46 = ASCII "glTF" */
function isGLBinaryMagic(u8) {
  if (!u8 || u8.length < 4) return false;
  return u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46;
}

function isProbablyGltfJson(u8) {
  if (!u8 || u8.length < 1) return false;
  const b = u8[0];
  return b === 0x7b || b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;
}

function showLobbyLoadError(innerHtml) {
  const cc = document.getElementById("canvas-container");
  if (!cc || cc.querySelector(".lobby-load-error")) return;
  const el = document.createElement("div");
  el.className = "lobby-load-error";
  el.setAttribute("role", "alert");
  el.style.cssText =
    "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#e8eeff;padding:24px;text-align:center;background:#0a0e17;z-index:4;font-family:system-ui,sans-serif;line-height:1.5;max-width:100%;box-sizing:border-box;";
  el.innerHTML = innerHtml;
  cc.appendChild(el);
}

function lobbyLoadErrorGeneric() {
  showLobbyLoadError(
    '<p>3D 로비 모델을 불러오지 못했습니다.<br><span style="opacity:.75;font-size:13px">파일 경로·네트워크·또는 Draco/KHR 확장 호환 여부를 확인해 주세요. (브라우저 개발자 도구 콘솔 참고)</span></p>'
  );
}

/** URL ?glbverify=1 — GLB가 진짜 바뀌었는지(지문)·full 모드 여부를 화면에 표시 */
function showGlbVerifyBannerIfRequested() {
  try {
    if (!/[?&]glbverify=1(?:&|$)/.test(location.search || "")) return;
    if (document.getElementById("lobby-glb-verify")) return;
    const fp = window.__lobbyGlbFingerprint;
    const div = document.createElement("div");
    div.id = "lobby-glb-verify";
    div.setAttribute("role", "status");
    div.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:10000;max-width:min(96vw,440px);background:rgba(40,12,12,.93);color:#fec;font:12px/1.4 ui-monospace,monospace;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,160,100,.45);pointer-events:none;white-space:pre-wrap;word-break:break-all;box-shadow:0 4px 16px rgba(0,0,0,.45)";
    const lines = [
      "[GLB 검증] ?glbverify=1",
      fp
        ? `지문(후처리 전): mesh=${fp.meshCount} | 박스≈${fp.sizeX.toFixed(2)}×${fp.sizeY.toFixed(2)}×${fp.sizeZ.toFixed(2)}`
        : "(지문 없음)",
      `처리 모드: ${fp?.processing || "?"}`,
      String(fp?.url || LOBBY_MODEL_PATH),
      "",
      "GLB만 교체했는데 지문이 그대로 → 다른 경로 파일이거나 캐시.",
      "지문은 바뀌는데 화면만 이상함 → ?lobbyFull=1 이 메시를 지웠을 수 있음. 기본 minimal 로 비교.",
    ];
    div.textContent = lines.join("\n");
    document.body.appendChild(div);
  } catch (_) {}
}

function shouldShowLobbyDebug() {
  try {
    return /[?&]lobbydebug=1(?:&|$)/i.test(location.search || "");
  } catch (_) {
    return false;
  }
}

function createLobbyDebugOverlay() {
  if (document.getElementById("lobby-debug-overlay")) return;
  const div = document.createElement("div");
  div.id = "lobby-debug-overlay";
  div.setAttribute("role", "status");
  div.style.cssText =
    "position:fixed;left:6px;bottom:6px;z-index:9999;max-width:min(96vw,420px);background:rgba(0,20,40,.88);color:#aee;font:11px/1.35 ui-monospace,monospace;padding:10px 12px;border-radius:10px;border:1px solid rgba(120,200,255,.35);pointer-events:none;white-space:pre-wrap;word-break:break-all;box-shadow:0 4px 20px rgba(0,0,0,.4)";
  document.body.appendChild(div);
  const tick = () => {
    const lines = [
      "[LOBBY DEBUG] URL 에 ?lobbydebug=1",
      "build stamp → " + LOBBY_BUILD_STAMP,
      "__isMobile (= ?mobileLobby=1) → " + (typeof window.__isMobile !== "undefined" ? window.__isMobile : "(unset)"),
      "__useThreeLobby → " + (typeof window.__useThreeLobby !== "undefined" ? window.__useThreeLobby : "(unset)"),
      "asset base → " + getBundleScriptBaseUrl(),
      "GLB → " + LOBBY_MODEL_PATH,
      "후처리 → " + effectiveLobbyProcessing() + " (?lobbyFull=1=full, 기본 minimal)",
      "매칭 데스크 수 → " + (typeof window.__lobbyDeskCount !== "undefined" ? window.__lobbyDeskCount : "(로드 전)"),
      "",
      "2.5D만: ?mobileLobby=1 (기본은 항상 3D)",
      "진입 카메라: 콘솔 __saveLobbyEntry() / __clearLobbyEntry() / URL ?clearLobbyEntry=1",
    ];
    div.textContent = lines.join("\n");
  };
  tick();
  setInterval(tick, 1500);
}

function lobbyLoadErrorBlendFile() {
  showLobbyLoadError(
    '<p>이 파일은 <strong>Blender 원본(.blend)</strong>입니다. 웹에서는 <strong>glTF 2.0 바이너리(.glb)</strong>만 불러올 수 있습니다.</p>' +
      '<p style="opacity:.85;font-size:13px;margin-top:12px;text-align:left;max-width:520px;margin-left:auto;margin-right:auto">' +
      "Blender 메뉴에서 <strong>파일 → 내보내기 → glTF 2.0 (.glb)</strong>로 내보낸 뒤, 그 파일을 <code style=\"font-size:12px\">netlify/assets/" +
      LOBBY_GLB_FILENAME +
      "</code> 위치에 두고 <code style=\"font-size:12px\">npm run build:netlify</code> 후 다시 배포하세요. " +
      "<strong>.blend</strong>를 복사한 뒤 확장자만 <code>.glb</code>로 바꾸면 동작하지 않습니다." +
      "</p>"
  );
}

function initThree() {
  window.__isMobile = useMobileLobbyPath();
  window.__useThreeLobby = !window.__isMobile;
  if (shouldShowLobbyDebug()) {
    createLobbyDebugOverlay();
  }
  if (window.__isMobile) {
    console.warn(
      "[LOBBY] 모바일 UA 또는 ?mobileLobby=1 — WebGL 생략. 일반 PC는 index head 에서 mobile-lobby.html 로 분리됩니다."
    );
    return;
  }

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
  controls.minDistance = 4;
  controls.maxDistance = 36;
  controls.maxPolarAngle = Math.PI / 2 - 0.08;
  controls.minPolarAngle = 0.15;
  controls.target.set(0, 2, 0);
  maybeClearLobbyEntryFromUrl();

  // 유휴 복구: OrbitControls 'change'는 damp·clamp 후에도 매 프레임 올 수 있어 lastLobbyInputAt이
  // 영원히 갱신됨 → 3초 유휴가 성립하지 않음. 실제 포인터·휠만 반영.
  renderer.domElement.addEventListener("pointerdown", pingIdleRecoveryUserActivity);
  renderer.domElement.addEventListener(
    "pointermove",
    (e) => {
      if (e.buttons !== 0) pingIdleRecoveryUserActivity();
    },
    { passive: true }
  );
  renderer.domElement.addEventListener("wheel", pingIdleRecoveryUserActivity, { passive: true });

  scene.add(new THREE.AmbientLight(0x404080, 0.5));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(15, 25, 15);
  dir.castShadow = true;
  scene.add(dir);
  scene.add(new THREE.HemisphereLight(0x80a0ff, 0x202040, 0.4));

  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener(
    "pointermove",
    (e) => {
      deskHoverLastX = e.clientX;
      deskHoverLastY = e.clientY;
      if (deskHoverRaf) return;
      deskHoverRaf = requestAnimationFrame(() => {
        deskHoverRaf = 0;
        updateDeskDeptHoverTooltip(deskHoverLastX, deskHoverLastY);
      });
    },
    { passive: true }
  );
  renderer.domElement.addEventListener(
    "pointerleave",
    () => {
      const tel = document.getElementById("desk-tooltip");
      if (tel) tel.style.display = "none";
      setDeptHoverCursor(false);
    },
    { passive: true }
  );
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
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
  loader.setDRACOLoader(dracoLoader);

  (async () => {
    try {
      const head = await sniffFirstBytesFromUrl(LOBBY_MODEL_PATH);
      if (isBlenderBlendMagic(head)) {
        console.error("[LOBBY] .blend 파일이 로비 GLB 경로에 있습니다:", LOBBY_MODEL_PATH);
        lobbyLoadErrorBlendFile();
        return;
      }
      if (!isGLBinaryMagic(head) && !isProbablyGltfJson(head)) {
        console.warn("[LOBBY] glTF 바이너리/JSON 시그니처가 아닙니다. 첫 바이트:", head[0], head[1], head[2], head[3]);
      }
    } catch (sniffErr) {
      console.warn("[LOBBY] 파일 헤더 확인 실패 — GLTFLoader로 계속합니다:", sniffErr);
    }

    loader.load(
    LOBBY_MODEL_PATH,
    (gltf) => {
      lobbyModel = gltf.scene;

      lobbyModel.updateMatrixWorld(true);
      const _fpBox = new THREE.Box3().setFromObject(lobbyModel);
      const _fpSize = new THREE.Vector3();
      _fpBox.getSize(_fpSize);
      let _fpMesh = 0;
      lobbyModel.traverse((c) => {
        if (c.isMesh) _fpMesh++;
      });
      try {
        window.__lobbyGlbFingerprint = {
          meshCount: _fpMesh,
          sizeX: _fpSize.x,
          sizeY: _fpSize.y,
          sizeZ: _fpSize.z,
          processing: effectiveLobbyProcessing(),
          url: LOBBY_MODEL_PATH,
        };
      } catch (_) {}
      console.info(
        "[LOBBY] GLB 지문(후처리 전): mesh=" +
          _fpMesh +
          " | 월드 박스 크기≈" +
          _fpSize.x.toFixed(2) +
          "×" +
          _fpSize.y.toFixed(2) +
          "×" +
          _fpSize.z.toFixed(2) +
          " | 모드=" +
          effectiveLobbyProcessing()
      );
      console.info(
        "[LOBBY] GLB 파일을 바꿨는데 이 지문 숫자가 그대로면 → 다른 경로의 파일이거나 캐시입니다. 화면만 이상하면 ?lobbyFull=1(full)이 메시를 많이 지웠을 수 있음 → 기본 minimal로 비교."
      );
      if (effectiveLobbyProcessing() === "full") {
        console.info(
          "[LOBBY] full: Plane 이름·퍼지가 새 GLB와 안 맞으면 로비가 거의 사라질 수 있음. 문제 시 ?lobbyFull 제거(기본 minimal) 또는 전체 씬 glb 사용"
        );
      }

      if (effectiveLobbyProcessing() === 'minimal') {
        applyMinimalLobbyPostProcess(lobbyModel);
        return;
      }

      (async () => {
      try {

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
      let floorMaterialColor = null;
      const blueFloorMeshes = [];

      lobbyModel.traverse((child) => {
        const nm = child.name || "";
        if (child.isMesh && nm.toLowerCase().includes('floor')) {
          const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
          if (mats.length > 0 && mats[0].color) floorMaterialColor = mats[0].color.clone();
        }
      });

      removeLobbyPeopleAndTextMeshes(lobbyModel);

      lobbyModel.traverse((child) => {
        if (DEBUG_LOG_GLB_NAMES) namesList.push(child.name || '(unnamed)');
        if (child.isMesh) child.castShadow = child.receiveShadow = true;
        const n = (child.name || "").toLowerCase();
        const mats = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
        const matName = mats.map((m) => (m && m.name) || '').join(' ').toLowerCase();
        const rawName = child.name || "";
        const isPageText = HIDE_PAGE_TEXT_PATTERN.test(rawName);
        const isFloor = n.includes('floor');
        const isFloorLineMat = HIDE_FLOOR_LINE_MAT_PATTERN.test(matName);
        const isBlue = rawName.includes('n_419') || n.includes('blue') || matName.includes('blue_light') ||
          mats.some((m) => m && m.color && m.color.b > m.color.r && m.color.b > m.color.g && m.color.b > 0.2);

        if (isPageText) child.visible = false;
        if (isFloorLineMat && !isFloor) child.visible = false;
        if (isBlue && !isFloor) blueFloorMeshes.push(child);
      });

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

      // 데스크 행성 텍스처(await) 전에 씬에 올려 인트로 직후 검은 화면만 보이는 현상 방지
      if (!lobbyModel.parent) {
        scene.add(lobbyModel);
        expandLobbyBoundsFromModel(lobbyModel);
        frameLobbyCameraToModel(lobbyModel);
        applySavedLobbyEntryIfAny();
        captureLobbyRecoveryCamera();
        console.info("[LOBBY] 모델을 씬에 먼저 추가함(데스크 텍스처·후처리는 계속 진행)");
      }

      await applyDeskLabelsAsync(lobbyModel);

      removeFloorObstacleMeshes(lobbyModel);
      applyMonitorWallCubeDeptLabels(lobbyModel);

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

      const cylinders = collectCylinderLabelAnchorCandidates(lobbyModel);
      if (cylinders.length === 0) {
        console.info("[LOBBY] 원통·기둥 후보 메시 0개 — 데스크별 합성 앵커로 라벨 부착");
      }

      const desks = [];
      lobbyModel.traverse((o) => {
        if (o.isMesh && o.userData?.isDesk && o.userData?.label) desks.push(o);
      });

      const LABEL_MATCH_MAX_DIST = 10.0;

      desks.forEach((desk) => {
        const wp = new THREE.Vector3();
        desk.getWorldPosition(wp);

        const { best, bestD } = findNearestMeshToPoint(cylinders, wp);

        if (best && bestD < LABEL_MATCH_MAX_DIST) {
          if (best.userData.__hasDeskLabel) {
            addSyntheticCylinderLabelAnchor(desk, desk.userData.label);
            console.info(`ℹ ${desk.userData.label}: 인근 원통이 이미 라벨 사용 중 → 합성 앵커`);
          } else {
            addCameraFacingLabelSleeveOnCylinder(best, desk.userData.label);
          }
        } else {
          addSyntheticCylinderLabelAnchor(desk, desk.userData.label);
          if (cylinders.length > 0 && best) {
            console.info(`ℹ ${desk.userData.label}: 최근접 기둥 거리 ${bestD.toFixed(2)}m — 합성 앵커`);
          }
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
      
      if (!lobbyModel.parent) scene.add(lobbyModel);
      showGlbVerifyBannerIfRequested();
      } catch (fullErr) {
        console.error("[LOBBY] full 후처리 중 오류 — minimal 모드로 표시합니다:", fullErr);
        applyMinimalLobbyPostProcess(lobbyModel);
      }
      })().catch((e) => console.error("[LOBBY] GLB 로드 후 비동기 파이프라인 실패:", e));
    },
    undefined,
    (err) => {
      console.error("GLB 로드 실패:", err);
      const m = String((err && err.message) || err || "");
      if (/BLENDER/i.test(m)) {
        lobbyLoadErrorBlendFile();
      } else {
        lobbyLoadErrorGeneric();
      }
    }
    );
  })().catch((e) => console.error("[LOBBY] 스니프/로더 래퍼 실패:", e));

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

/** 포인터 호버: onCanvasClick 과 동일 우선순위로 사업부 한글 명칭만 반환 */
function resolveHoveredDeptLabelFromHits(hits) {
  if (!hits || hits.length === 0) return null;
  let deskMesh = null;
  for (const h of hits) {
    const slot = findPlanetClickSlotFromObject(h.object);
    if (slot) {
      const i = slot - 1;
      return DESK_LABELS[i]?.label || null;
    }
    const slotPlane = findDeskSlotFromPlaneMesh(h.object);
    if (slotPlane) {
      const i = slotPlane - 1;
      return DESK_LABELS[i]?.label || null;
    }
    const d = findDeskFromObject(h.object);
    if (d) {
      deskMesh = d;
      break;
    }
  }
  if (deskMesh) {
    const label = deskMesh.userData && deskMesh.userData.label;
    if (label) return label;
    const deskId =
      deskMesh.userData.deskId ||
      deskMesh.userData.deskName ||
      normalizePlaneName(deskMesh.name) ||
      deskMesh.name;
    const nk = normalizePlaneName(String(deskId));
    const idx = DESK_LABELS.findIndex((d) => normalizePlaneName(d.name) === nk);
    if (idx >= 0) return DESK_LABELS[idx].label;
  }
  return null;
}

let deskHoverRaf = 0;
let deskHoverLastX = 0;
let deskHoverLastY = 0;

function updateDeskDeptHoverTooltip(clientX, clientY) {
  const el = document.getElementById("desk-tooltip");
  const introEl = document.getElementById("intro-container");
  if (!renderer || !camera || !lobbyModel || !el) return;
  if (introEl && !introEl.classList.contains("hidden")) {
    el.style.display = "none";
    setDeptHoverCursor(false);
    return;
  }
  if (useMobileLobbyPath()) {
    el.style.display = "none";
    setDeptHoverCursor(false);
    return;
  }
  try {
    if (deptRoot && deptRoot.classList.contains("open")) {
      el.style.display = "none";
      setDeptHoverCursor(false);
      return;
    }
    if (deskModal && deskModal.classList.contains("open")) {
      el.style.display = "none";
      setDeptHoverCursor(false);
      return;
    }
  } catch (_) {}

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const meshes = [];
  lobbyModel.traverse((c) => {
    if (c.isMesh) meshes.push(c);
  });
  const hits = raycaster.intersectObjects(meshes, true);
  const label = resolveHoveredDeptLabelFromHits(hits);
  if (label) {
    el.textContent = label;
    el.style.display = "block";
    el.style.left = `${clientX}px`;
    el.style.top = `${clientY}px`;
    setDeptHoverCursor(true);
  } else {
    el.style.display = "none";
    setDeptHoverCursor(false);
  }
}

function setDeptHoverCursor(pointer) {
  try {
    if (!renderer || !renderer.domElement) return;
    renderer.domElement.style.cursor = pointer ? "pointer" : "";
  } catch (_) {}
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
      const slot = findPlanetClickSlotFromObject(h.object);
      if (slot) {
        openDeptForPlanetSlot(slot, h.point?.clone?.() || null);
        return;
      }
      const slotPlane = findDeskSlotFromPlaneMesh(h.object);
      if (slotPlane) {
        openDeptForPlanetSlot(slotPlane, h.point?.clone?.() || null);
        return;
      }
      const d = findDeskFromObject(h.object);
      if (d) {
        deskMesh = d;
        hitPoint = h.point?.clone?.() || null;
        break;
      }
    }

    if (deskMesh) {
      const deskId =
        deskMesh.userData.deskId ||
        deskMesh.userData.deskName ||
        normalizePlaneName(deskMesh.name) ||
        deskMesh.name;
      const mapped = DESK_LINKS[deskId] || DESK_LINKS[normalizePlaneName(String(deskId))];
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
        planetPath: deskMesh.userData.planetPath,
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
      const slot = findPlanetClickSlotFromObject(h.object);
      if (slot) {
        openDeptForPlanetSlot(slot, h.point?.clone?.() || null);
        return;
      }
      const slotPlane = findDeskSlotFromPlaneMesh(h.object);
      if (slotPlane) {
        openDeptForPlanetSlot(slotPlane, h.point?.clone?.() || null);
        return;
      }
      const d = findDeskFromObject(h.object);
      if (d) {
        deskMesh = d;
        hitPoint = h.point?.clone?.() || null;
        break;
      }
    }

    if (deskMesh) {
      const deskId =
        deskMesh.userData.deskId ||
        deskMesh.userData.deskName ||
        normalizePlaneName(deskMesh.name) ||
        deskMesh.name;
      const mapped = DESK_LINKS[deskId] || DESK_LINKS[normalizePlaneName(String(deskId))];
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
        planetPath: deskMesh.userData.planetPath,
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

/** 카메라/타깃이 LOBBY AABB 안쪽 면까지의 최소 거리(가장 가까운 벽·천장·바닥) */
function minDistToLobbyBoundsSurface(v) {
  const dx = Math.min(v.x - LOBBY_BOUNDS.minX, LOBBY_BOUNDS.maxX - v.x);
  const dy = Math.min(v.y - LOBBY_BOUNDS.minY, LOBBY_BOUNDS.maxY - v.y);
  const dz = Math.min(v.z - LOBBY_BOUNDS.minZ, LOBBY_BOUNDS.maxZ - v.z);
  return Math.min(dx, dy, dz);
}

/** 벽·코너에 너무 붙어 바깥을 보는 느낌 → 짧은 유휴 시간 후 복구 */
function isLobbyCameraNearBoundsEdge() {
  if (!camera || !controls) return false;
  const dCam = minDistToLobbyBoundsSurface(camera.position);
  const dTgt = minDistToLobbyBoundsSurface(controls.target);
  return dCam < 0.22 || dTgt < 0.35;
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
      clampTargetAndCamera();
      controls.update();
      pingIdleRecoveryUserActivity();
    } else {
      camera.position.lerp(targetPosition, MOVE_SPEED);
      controls.target.lerp(targetLookAt, MOVE_SPEED);
      clampTargetAndCamera();
    }
  } else {
    controls.update();
    clampTargetAndCamera();
    let skipIdleRecovery = false;
    try {
      if (window.__isMobile) skipIdleRecovery = true;
    } catch (_) {}
    if (
      !skipIdleRecovery &&
      recoveryCameraCaptured &&
      lastLobbyInputAt > 0 &&
      performance.now() >= suppressIdleRecoveryResetUntil
    ) {
      const needMs = isLobbyCameraNearBoundsEdge() ? EDGE_RECOVERY_MS : IDLE_RECOVERY_MS;
      if (performance.now() - lastLobbyInputAt >= needMs) {
        applyIdleRecoveryToCamera();
      }
    }
  }
  updateDeskCylinderLabelFacing();
  updateWallDeptExtrusionLabels();
  renderer.render(scene, camera);
}

initIntro();
initThree();
animate();
