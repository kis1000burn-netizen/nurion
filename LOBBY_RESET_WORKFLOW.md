# 3D 로비 파일 초기화·재적용 워크플로

## 코드에서 정하는 것 (`netlify/app.js`)

| 상수 | 의미 |
|------|------|
| `LOBBY_MODEL_PATH` | 로드할 GLB 경로(기본 `assets/nurion_lobby.glb`) |
| `LOBBY_PROCESSING` | `minimal` = 모델만 씬에 표시 / `full` = 데스크 치환·바닥 영상·퍼지 등 기존 전체 후처리 |

- 새 GLB를 넣고 **위치·스케일만** 확인할 때는 **`minimal`** 유지.
- 예전처럼 데스크·바닥 영상까지 쓰려면 **`full`** 로 바꾼 뒤 `npm run build:netlify` 로 `bundle.js` 재생성.

## 파일 위치

- 배포용 GLB: **`netlify/assets/nurion_lobby.glb`**
- 안내 문구: **`netlify/assets/README.txt`**

## 권장 순서 (삭제 → 푸시 → 재적용 → 푸시 → 수정)

1. `netlify/assets/nurion_lobby.glb` 삭제 또는 백업 폴더로 이동
2. Git 커밋 후 원격 저장소에 푸시
3. Blender 등에서 내보낸 새 `nurion_lobby.glb` 를 `netlify/assets/` 에 복사
4. 다시 커밋·푸시
5. `LOBBY_PROCESSING` · `LOBBY_MODEL_PATH` 조정 필요 시 `app.js` 수정 → `npm run build:netlify` → 커밋·푸시

## 참고

- 이 저장소를 처음 쓰는 경우 프로젝트 루트에서 `git init` 후 원격을 연결하면 됩니다.
- `.gitignore` 에 `*.glb` 등이 있으면 **GLB는 Git에 올리지 않고**, Netlify 등에 **수동 업로드**하거나 별도 아티팩트 저장소를 쓸 수 있습니다. GLB를 Git으로 관리하려면 `.gitignore`에서 해당 줄을 제거하세요.
