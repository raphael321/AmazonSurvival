// Monta a versão "página única" do jogo (para publicar como Artifact ou hospedar sem servidor):
// código empacotado + modelos .glb embutidos em base64. Uso: npm run page -- <saída.html>
import { build } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const out = process.argv[2] || 'dist/amazon-survival-3d.html';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false });
const js = r.outputFiles[0].text.replaceAll('</script', '<\\/script');
const assets = {};
for (const f of readdirSync('www/assets').filter((f) => f.endsWith('.glb'))) assets['assets/' + f] = readFileSync('www/assets/' + f).toString('base64');
const game = `<script>\nwindow.__EMBEDDED_ASSETS = ${JSON.stringify(assets)};\nwindow.__ASSET_BASE = "";\n${js}\n</script>`;
const html = readFileSync('tools/page-template.html', 'utf8').replace('<!--GAME-->', () => game); // função: o código tem '$' que o replace interpretaria
writeFileSync(out, html);
console.log(out, (html.length / 1024 / 1024).toFixed(2) + ' MB');
