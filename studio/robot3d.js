// Renderizza l'assistente 3D "Nova" con il labiale dalla voce, come PNG trasparenti.
// Uso: node robot3d.js voce.wav cartella_uscita fps durata accent larghezza [glow]
//      node robot3d.js --preview out.png
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const args = process.argv.slice(2);
  const preview = args[0] === '--preview';
  const [wav, outDir, fps = '30', dur = '1', accent = '#FFC21A', width = '600', glow = '#6be4ff', sceneName = 'robot3d'] = preview ? [null, null, '30', '1', '#FFC21A', '600', args[2] || '#6be4ff', args[3] || 'robot3d'] : args;
  const Wd = +width, Ht = Math.round(Wd * 1.15), F = +fps;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: Wd, height: Ht } });
  p.on('pageerror', e => console.error('pageerror', e.message));
  await p.route('https://local.test/**', r => { const u = new URL(r.request().url()); const f = path.join(__dirname, '..', decodeURIComponent(u.pathname)); r.fulfill({ path: f, contentType: f.endsWith('.js') ? 'text/javascript' : 'text/html' }); });
  await p.goto(`https://local.test/studio/${sceneName}.html?w=${Wd}&h=${Ht}&accent=${encodeURIComponent(accent)}&glow=${encodeURIComponent(glow)}`);
  await p.waitForFunction(() => window.READY, null, { timeout: 60000 });
  if (preview) {
    // anteprima: 4 pose con bocca chiusa / aperta
    const shots = [];
    for (const [i, o] of [[10, 0], [40, 0.9], [70, 0.5], [100, 0.2]]) {
      await p.evaluate(([i, o]) => setLip(Array.from({ length: 200 }, () => ({ o, r: 0.3 }))), [i, o]);
      shots.push(await p.evaluate(([i]) => frame(i, 30), [i]));
    }
    shots.forEach((s, k) => fs.writeFileSync(args[1].replace('.png', `-${k}.png`), Buffer.from(s, 'base64')));
    await b.close(); return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  await p.evaluate(([b64, F]) => computeLip(b64, F), [fs.readFileSync(wav).toString('base64'), F]);
  const N = Math.round(+dur * F);
  for (let i = 0; i < N; i++) {
    const png = await p.evaluate(([i, F]) => frame(i, F), [i, F]);
    fs.writeFileSync(path.join(outDir, `f${String(i).padStart(5, '0')}.png`), Buffer.from(png, 'base64'));
  }
  await b.close(); console.log('frames', N);
})();
