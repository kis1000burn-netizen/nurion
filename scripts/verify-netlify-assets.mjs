import { accessSync, constants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  join(root, "netlify", "index.html"),
  join(root, "netlify", "app.js"),
];

for (const p of required) {
  try {
    accessSync(p, constants.F_OK);
  } catch {
    console.error(
      "[build] 필수 파일이 없습니다:",
      p,
      "\n→ Git에 netlify/index.html 등이 커밋·푸시되었는지 확인하세요. 없으면 Netlify 배포 루트에 index 가 없어 404가 납니다."
    );
    process.exit(1);
  }
}
