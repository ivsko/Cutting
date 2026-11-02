// Сглобява един самостоятелен HTML файл: node scripts/build-single.mjs [--sandbox] [--fragment]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const sandbox = process.argv.includes('--sandbox');
const fragment = process.argv.includes('--fragment');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}\n</style>`);
const flag = sandbox ? '<script>window.__CUTTING_SANDBOXED__=true;</script>\n  ' : '';
html = html.replace('<script src="optimizer.js"></script>', () => `${flag}<script>\n${safe(read('optimizer.js'))}\n</script>`);
html = html.replace('<script src="main.js"></script>', () => `<script>\n${safe(read('main.js'))}\n</script>`);
if (fragment) html = html.replace(/<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*<meta charset="UTF-8">\s*<meta name="viewport"[^>]*>/i, '').replace(/<\/head>\s*<body>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
mkdirSync(new URL('dist/', root), { recursive: true });
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || new URL('dist/index.html', root);
writeFileSync(out, html);
console.log('OK', String(out), html.length);
