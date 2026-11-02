// Copy node_modules/sharp/dist into the public tree so the browser can use it.
// The engine only imports from ./engine/*.js; this script is for dev convenience.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'sharp');
const dst = path.join(__dirname, '..', 'public', 'sharp-dist');
if (!fs.existsSync(path.join(__dirname, '..', 'public'))) {
  fs.mkdirSync(path.join(__dirname, '..', 'public'), { recursive: true });
}
if (!fs.existsSync(dst)) {
  fs.mkdirSync(dst, { recursive: true });
  cp(src, dst);
  console.log('copied sharp/dist → public/sharp-dist');
}
function cp(s, d) {
  for (const ent of fs.readdirSync(s, { withFileTypes: true })) {
    const srcP = path.join(s, ent.name);
    const dstP = path.join(d, ent.name);
    if (ent.isDirectory()) { cp(srcP, dstP); }
    else { fs.copyFileSync(srcP, dstP); }
  }
}
