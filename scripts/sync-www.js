// Копирует веб-приложение из корня проекта в www/ для Capacitor (webDir).
// Запуск: npm run sync-www
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');
const entries = ['index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icons'];

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const entry of entries) {
  const src = path.join(root, entry);
  const dest = path.join(www, entry);
  if (!fs.existsSync(src)) {
    console.warn(`skip: ${entry} not found`);
    continue;
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`copied: ${entry}`);
}
console.log('www/ ready');
