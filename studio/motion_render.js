// Renderizza motion.html fotogramma per fotogramma in un MP4 (senza audio).
// Uso: node motion_render.js timeline.json uscita.mp4 fps
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'); const { spawn } = require('child_process');
(async () => {
  const [tlPath, out, fps = '30'] = process.argv.slice(2);
  const data = JSON.parse(fs.readFileSync(tlPath, 'utf8')); const F = +fps, N = Math.round(data.total * F);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.error('pageerror', e.message));
  await p.goto('file://' + path.join(__dirname, 'motion.html'));
  await p.waitForFunction(() => window.READY && window.gsap);
  await p.evaluate(d => setup(d), data);
  await p.evaluate(() => document.fonts.ready);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(F), '-c:v', 'mjpeg', '-i', '-', '-frames:v', String(N),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => seek(t), i / F);
    const jpg = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
  console.log('frames', N);
})();
