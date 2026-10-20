// The app is plain scripts sharing one global scope: two files declaring the same top-level name
// silently overwrite each other (that broke Timers twice). Run before every release.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const seen = new Map(), clashes = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    const name = m[1];
    if (seen.has(name) && seen.get(name) !== f) clashes.push(`${name}: ${seen.get(name)} and ${f}`);
    else seen.set(name, f);
  }
  try { new (require('vm').Script)(src, { filename: f }); } catch (e) { clashes.push(`${f}: ${e.message}`); }
}
if (clashes.length) { console.error('Problems found:\n  ' + clashes.join('\n  ')); process.exit(1); }
console.log(`OK · ${files.length} scripts, ${seen.size} top-level names, no clashes`);
