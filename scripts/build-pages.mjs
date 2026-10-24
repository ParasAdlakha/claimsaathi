// Builds docs/app: the full app running in the browser with no server, for GitHub Pages.
// node scripts/build-pages.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}docs/app/`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${root}public`, out, { recursive: true });
cpSync(`${root}core`, `${out}core`, { recursive: true });
cpSync(`${root}data/sample`, `${out}data/sample`, { recursive: true });
cpSync(`${root}scripts/static-api.mjs`, `${out}static-api.mjs`);

const banner = `<div style="background:#14231f;color:#c6d2cd;font:500 13px/1.4 Inter,system-ui,sans-serif;padding:8px 16px;text-align:center">Browser demo on GitHub Pages: sample policy, bill and letter, English and Hindi. Bill photos and more languages need the local app with an OpenAI key. <a style="color:#7fe0c6" href="https://github.com/ParasAdlakha/claimsaathi">Code</a></div>`;
const html = readFileSync(`${out}index.html`, 'utf8')
  .replaceAll('/docs/demo/bill.png', '../demo/bill.png')
  .replace('<script src="app.js" type="module"></script>', '<script>window.CLAIMSAATHI_STATIC = true;</script>\n<script src="app.js" type="module"></script>')
  .replace('<body>', `<body>\n${banner}`);
writeFileSync(`${out}index.html`, html);
console.log('built', out);
