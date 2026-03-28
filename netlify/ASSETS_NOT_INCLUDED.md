Important: Large binary assets (GLB, textures, video files, .blend sources) are often NOT committed to Git — see repo root `.gitignore`.

## 3D 로비 GLB (필수)

- **경로**: `assets/nurion_lobby.glb` (즉 이 폴더 기준 `netlify/assets/nurion_lobby.glb`)
- 코드 상수: `netlify/app.js` 의 `LOBBY_MODEL_PATH` (기본값과 맞출 것)
- 처리 모드: `LOBBY_PROCESSING` — `minimal`(기본, 모델만) / `full`(기존 데스크·바닥영상 등 전체)

## 기타

- `assets/intro.mp4`, `assets/textures/`, `assets/lobby_2d5.mp4` 등은 배포 폴더에 함께 복사
- `dept/` — 정적 사업부 HTML (선택)

## 배포 시

1. `netlify/` 내용 + 위 에셋 폴더를 한 디렉터리로 모은 뒤 업로드하거나, Git 연동 시 에셋은 별도로 동기화

자세한 단계는 저장소 루트 `LOBBY_RESET_WORKFLOW.md` 참고.
