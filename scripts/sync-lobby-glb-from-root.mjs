/**
 * 프로젝트 루트의 GLB 를 netlify/assets 로 복사할 때 사용.
 * 파일명은 netlify/app.js 의 LOBBY_GLB_FILENAME 과 같아야 함 (기본 nurion_lobby1.glb).
 */
import { copyFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const glbName = "nurion_lobby.glb";
const src = join(root, glbName);
const dest = join(root, "netlify", "assets", glbName);

if (!existsSync(src)) {
  console.error("[sync-glb] 없음:", src);
  process.exit(1);
}
copyFileSync(src, dest);
const a = statSync(src);
const b = statSync(dest);
console.log("[sync-glb] 복사 완료:", dest, "| bytes:", b.size, "(원본과 동일:", a.size === b.size, ")");
