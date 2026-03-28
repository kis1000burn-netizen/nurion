3D 로비 GLB 를 여기에 둡니다.

파일명: nurion_lobby.glb  (app.js 의 LOBBY_MODEL_PATH 와 동일해야 함)

워크플로 예:
1) 기존 nurion_lobby.glb 삭제(또는 백업)
2) 변경 사항 커밋 후 푸시
3) 새 GLB 를 이 폴더에 복사
4) 다시 커밋·푸시
5) 필요 시 netlify/app.js 에서 LOBBY_PROCESSING 을 "full" 로 바꾼 뒤 npm run build:netlify
