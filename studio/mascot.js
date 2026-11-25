// Renderizza il personaggio parlante (con labiale dalla voce) come sequenza PNG trasparente.
// Uso: node mascot.js voce.wav cartella_uscita fps durata kind accent size
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [wav, outDir, fps = '30', dur, kind = 'robot', accent = '#FFC21A', size = '600'] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const S = +size, F = +fps, N = Math.round(+dur * F);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(`<canvas id="c" width="${S}" height="${Math.round(S * 1.15)}"></canvas>`);
  await p.addScriptTag({ path: path.join(__dirname, '..', 'lib', 'personaggi.js') });
  const b64 = fs.readFileSync(wav).toString('base64');
  await p.evaluate(async ([b64, F]) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ac = new OfflineAudioContext(1, 24000, 24000);
    const buf = await ac.decodeAudioData(bytes.buffer);
    window.LIP = Personaggi.lipsync(buf.getChannelData(0), buf.sampleRate, F);
  }, [b64, F]);
  for (let i = 0; i < N; i += 10) {
    const frames = await p.evaluate(([i0, n, N, F, kind, accent]) => {
      const c = document.getElementById('c'), ctx = c.getContext('2d'), out = [];
      const B = { accent, c1: '#061229', c2: '#1b5fd1' };
      for (let i = i0; i < Math.min(i0 + n, N); i++) {
        const t = i / F; ctx.clearRect(0, 0, c.width, c.height);
        const lip = LIP[Math.min(LIP.length - 1, i)] || { o: 0, r: 0 };
        const wave = t < 1.8 ? Math.sin(Math.min(1, t / 1.8) * Math.PI) : 0;
        Personaggi.draw(ctx, kind, c.width / 2, c.height * 0.47, c.width * 0.62, t, lip, B, { wave });
        out.push(c.toDataURL('image/png').split(',')[1]);
      }
      return out;
    }, [i, 10, N, F, kind, accent]);
    frames.forEach((f, k) => fs.writeFileSync(path.join(outDir, `f${String(i + k).padStart(5, '0')}.png`), Buffer.from(f, 'base64')));
  }
  await b.close();
  console.log('frames', N);
})();
