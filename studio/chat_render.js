// Renderizza l'animazione della chat (chat.html) come sequenza PNG.
// Uso: node chat_render.js spec.json cartella_uscita larghezza altezza fps
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [specPath, outDir, w, h, fps] = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const proxy = process.env.HTTPS_PROXY;
  const b = await chromium.launch({ proxy: proxy ? { server: proxy } : undefined, args: ['--ignore-certificate-errors'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, 'chat.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(s => setup(s), spec);
  const N = Math.round(spec.dur * +fps);
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => at(t), i / +fps);
    await p.screenshot({ path: path.join(outDir, `c${String(i).padStart(5, '0')}.png`) });
  }
  await b.close();
})();
