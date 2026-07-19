// Сборка игры в один самодостаточный HTML-файл (dist/iskra.html):
// весь JS/CSS инлайнится, ассеты вшиваются как base64 data-URL.
// Запуск: node tools/build_single.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const JS_FILES = [
  "js/config.js", "js/input.js", "js/engine.js", "js/assets.js",
  "js/entities.js", "js/levels.js", "js/game.js",
];

// собрать все PNG из assets/
const embedded = {};
function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (/\.(png|jpg|webp)$/i.test(e.name)) {
      const mime = e.name.endsWith(".png") ? "image/png" : e.name.endsWith(".webp") ? "image/webp" : "image/jpeg";
      embedded[rel] = `data:${mime};base64,` +
        fs.readFileSync(path.join(ROOT, rel)).toString("base64");
    }
  }
}
walk("assets");

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ИСКРА — сказка об угасшем свете</title>
<style>
${read("css/style.css")}
</style>
</head>
<body>
<canvas id="game" width="960" height="540"></canvas>
<script>window.EMBEDDED_ASSETS = ${JSON.stringify(embedded)};</script>
${JS_FILES.map((f) => `<script>\n${read(f)}\n</script>`).join("\n")}
</body>
</html>
`;

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/iskra.html"), html);
console.log("dist/iskra.html:", (html.length / 1024 / 1024).toFixed(2), "MB,",
  Object.keys(embedded).length, "embedded assets");
