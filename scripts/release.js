// After `electron-builder`, publish dist/Fukuro-Setup-<version>.exe as a GitHub release. Installed copies
// check the latest release and offer "Restart to update".
// Usage: npm run release   (or: node scripts/release.js "what changed")
// Needs a token with access to the repo: GH_TOKEN, or the one git already uses for github.com.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// some networks time out on IPv6
require('dns').setDefaultResultOrder('ipv4first');
const pkg = require('../package.json');

const repo = pkg.repository.url.match(/github\.com[:/](.+?)(\.git)?$/)[1];
const tag = 'v' + pkg.version, file = `Fukuro-Setup-${pkg.version}.exe`;
const src = path.join(__dirname, '..', 'dist', file);
if (!fs.existsSync(src)) { console.error(`Missing ${src}. Run electron-builder first.`); process.exit(1); }

const token = process.env.GH_TOKEN || (() => {
  try { return execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString().match(/^password=(.+)$/m)[1]; }
  catch { return null; }
})();
if (!token) { console.error('No GitHub token: set GH_TOKEN.'); process.exit(1); }
// flaky connections time out now and then: try a few times before giving up
async function gh(url, opts = {}){
  for (let i = 1; ; i++) {
    try {
      return await fetch(url.startsWith('http') ? url : `https://api.github.com/repos/${repo}${url}`, {
        ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'fukuro-release', ...opts.headers },
      });
    } catch (e) { if (i === 5) throw e; await new Promise(r => setTimeout(r, 1500)); }
  }
}

(async () => {
  let r = await gh(`/releases/tags/${tag}`);
  let rel = r.ok ? await r.json() : null;
  if (!rel) {
    r = await gh('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, name: `Fukurō ${pkg.version}`, body: process.argv[2] || '' }) });
    if (!r.ok) throw new Error(`Creating the release failed: ${r.status} ${await r.text()}`);
    rel = await r.json();
  }
  for (let i = 1; ; i++) {
    // a failed upload can leave a half-made asset with the same name behind
    const assets = await (await gh(`/releases/${rel.id}/assets`)).json(), old = assets.find(a => a.name === file);
    if (old) await gh(`/releases/assets/${old.id}`, { method: 'DELETE' });
    r = await gh(rel.upload_url.replace(/\{.*$/, '') + '?name=' + encodeURIComponent(file), {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(src),
    }).catch(e => ({ ok: false, status: e.cause?.code || e.message, text: () => '' }));
    if (r.ok) break;
    if (i === 3) throw new Error(`Upload failed: ${r.status} ${await r.text()}`);
    console.log(`Upload failed (${r.status}), trying again`);
  }
  console.log(`Published ${file} to ${rel.html_url}`);
})().catch(e => { console.error(e.message, e.cause ? e.cause.code || e.cause.message : ''); process.exit(1); });
