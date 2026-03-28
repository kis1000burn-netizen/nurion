# NURION 3D 로비 웹 앱

## 동작 순서
1. **인트로 영상** (`assets/intro.mp4`) 재생
2. 영상 종료 또는 "건너뛰기" 클릭 → **3D 로비** 표시
3. **nurion_lobby.glb** 로비만 표시 (사람·기존 텍스트는 숨김, 데스크는 추후 다른 방안으로 추가 예정)

## 실행 방법
- **로컬 서버 필수** (파일 직접 열면 GLB/영상 로드가 막힐 수 있음)
  - VS Code: Live Server 확장으로 `index.html` 열기
  - 또는 터미널: `npx serve .` 후 브라우저에서 `http://localhost:3000` 접속

## 현재 동작
- **GLB 로드 시 삭제:** 텍스트, 사람/캐릭터·검은 판떼기(shadow, silhouette, panel, slab 등)는 씬에서 **완전 삭제**합니다.
- **바닥 줄:** 오브젝트·머티리얼 이름에 `road_line`, `line_neon`, `line`, `strip`, `lane`, `road`가 포함되면 **숨김만** 처리(visible = false). 삭제하지 않아 나중에 다시 켤 수 있습니다.
- **데스크:** 기존 5개 데스크는 삭제됨. 추후 다른 방식으로 추가 예정.
- **추후 추가 예정:** 여성 캐릭터가 태블릿을 들고 보행하는 형태로 로비에 배치할 계획입니다.
- **바닥 파란색 면 → 광고 영상:** 로비 중앙의 파란색 직사각형 면을 찾아 그 위에 광고 영상을 재생합니다. 영상 경로는 `app.js`의 **VIDEO_AD_PATH** (기본값 `assets/ad.mp4`). 테스트 시 `assets/intro.mp4`로 바꿔도 됩니다.

**사람 형태가 여전히 보일 때:** `app.js`에서 `DEBUG_LOG_GLB_NAMES = true`로 바꾼 뒤 페이지 새로고침 → F12 콘솔에 GLB 오브젝트 이름 목록이 출력됩니다. 사람에 해당하는 이름을 `HIDE_OBJECT_NAMES_EXACT` 배열에 추가하면 해당 오브젝트도 삭제됩니다.

## 블렌더 수정본 반영
- 블렌더에서 씬을 수정한 뒤 웹에 반영하려면 **glTF 2.0(.glb)** 로 내보내서 `nurion_lobby.glb`를 덮어쓰고 브라우저 새로고침하면 됩니다.
- 자세한 단계는 **BLENDER_적용방법.md** 를 참고하세요.

## 사용 파일
| 용도 | 파일 |
|------|------|
| 인트로 | `assets/intro.mp4` |
| 3D 로비 | `nurion_lobby.glb` |
| 바닥 광고 영상 | `assets/ad.mp4` (없으면 `app.js`에서 VIDEO_AD_PATH를 `assets/intro.mp4`로 변경해 테스트 가능) |
