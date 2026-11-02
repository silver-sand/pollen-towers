// Copy engine/*.js into public/engine/ so the browser can import them.
// The browser app never needs sharp — that's a Node-only dev dependency.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'engine');
const dst = path.join(__dirname, '..', 'public', 'engine');
fs.mkdirSync(dst, { recursive: true });
for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
  if (ent.isFile() && ent.name.endsWith('.js')) {
    fs.copyFileSync(path.join(src, ent.name), path.join(dst, ent.name));
    console.log('copied', ent.name);
  }
}