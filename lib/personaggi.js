/* Personaggi parlanti disegnati a codice, con labiale sincronizzato alla voce.
   Nessuna AI a pagamento: tutto è disegnato su canvas, fotogramma per fotogramma. */
(function () {
  "use strict";
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const TAU = Math.PI * 2;
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function lighten(hex, k) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v + (255 - v) * k)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  /* ---------- Labiale: dall'audio a "quanto è aperta la bocca" ---------- */
  // samples: Float32Array mono; restituisce per ogni fotogramma {o: apertura 0..1, r: rotondità 0..1}
  function lipsync(samples, sampleRate, fps) {
    const hop = sampleRate / fps, n = Math.ceil(samples.length / hop), rms = new Float32Array(n), zcr = new Float32Array(n);
    const win = Math.round(hop * 1.5);
    for (let f = 0; f < n; f++) {
      const c = Math.round(f * hop), a = Math.max(0, c - win / 2), b = Math.min(samples.length, c + win / 2);
      let s = 0, z = 0; for (let i = a; i < b; i++) { s += samples[i] * samples[i]; if (i > a && (samples[i] >= 0) !== (samples[i - 1] >= 0)) z++; }
      const len = Math.max(1, b - a); rms[f] = Math.sqrt(s / len); zcr[f] = z / len;
    }
    const sorted = Array.from(rms).filter(v => v > 0.005).sort((x, y) => x - y); const ref = sorted[Math.floor(sorted.length * 0.9)] || 0.1;
    const out = []; let cur = 0;
    for (let f = 0; f < n; f++) {
      let target = clamp(Math.pow(rms[f] / ref, 0.75)); if (rms[f] < ref * 0.12) target = 0;
      cur += (target - cur) * (target > cur ? 0.75 : 0.45);
      out.push({ o: cur, r: clamp(1 - zcr[f] * 9) });
    }
    return out;
  }

  /* ---------- Bocca generica ---------- */
  function mouth(ctx, x, y, w, o, r, opt = {}) {
    const open = clamp(o), wide = w * (1 - r * 0.38 * open), h = w * (0.08 + open * 0.62);
    ctx.save(); ctx.translate(x, y);
    if (open < 0.06) { // sorriso chiuso
      ctx.strokeStyle = opt.line || "#3b1220"; ctx.lineWidth = w * 0.09; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, -w * 0.22, w * 0.42, 0.22 * Math.PI, 0.78 * Math.PI); ctx.stroke(); ctx.restore(); return;
    }
    ctx.fillStyle = opt.inside || "#3b0d1c";
    ctx.beginPath(); ctx.ellipse(0, h * 0.1, wide / 2, h / 2, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = opt.tongue || "#ff6f8e"; ctx.beginPath(); ctx.ellipse(0, h * 0.55, wide * 0.32, h * 0.34, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillRect(-wide * 0.3, -h * 0.45, wide * 0.6, h * 0.16 * (open > 0.3 ? 1 : 0));
    ctx.restore();
    if (opt.outline) { ctx.strokeStyle = opt.outline; ctx.lineWidth = w * 0.05; ctx.beginPath(); ctx.ellipse(0, h * 0.1, wide / 2, h / 2, 0, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  function eyes(ctx, x, y, gap, r, blink, look, opt = {}) {
    for (const sx of [-1, 1]) {
      const ex = x + sx * gap / 2; ctx.save(); ctx.translate(ex, y); ctx.scale(1, Math.max(0.08, 1 - blink));
      ctx.fillStyle = opt.white || "#ffffff"; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.15, 0, 0, TAU); ctx.fill();
      if (opt.outline) { ctx.strokeStyle = opt.outline; ctx.lineWidth = r * 0.12; ctx.stroke(); }
      ctx.fillStyle = opt.pupil || "#1b1530"; ctx.beginPath(); ctx.ellipse(look * r * 0.25, r * 0.12, r * 0.58, r * 0.66, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(look * r * 0.25 + r * 0.22, -r * 0.12, r * 0.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  function blinkAt(t) { const k = Math.floor(t / 3.1), ph = t - k * 3.1 - hash(k) * 1.6; return ph > 0 && ph < 0.16 ? Math.sin(ph / 0.16 * Math.PI) : 0; }

  /* ---------- Robot "Bit" ---------- */
  function robot(ctx, s, st, B) {
    const acc = B.accent;
    // corpo
    ctx.save(); ctx.translate(0, s * 0.5);
    const bg = ctx.createLinearGradient(-s * 0.4, 0, s * 0.4, 0); bg.addColorStop(0, "#dfe6f2"); bg.addColorStop(0.5, "#ffffff"); bg.addColorStop(1, "#c9d3e4");
    ctx.fillStyle = bg; rr(ctx, -s * 0.36, 0, s * 0.72, s * 0.5, s * 0.16); ctx.fill();
    ctx.fillStyle = acc; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(st.t * 3); ctx.beginPath(); ctx.arc(0, s * 0.2, s * 0.07, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    // braccia
    for (const sx of [-1, 1]) {
      const wave = sx === 1 ? st.wave : 0; const ang = -sx * (0.35 + Math.sin(st.t * 2 + sx) * 0.06) - wave * (2.1 + Math.sin(st.t * 14) * 0.35);
      ctx.save(); ctx.translate(sx * s * 0.36, s * 0.08); ctx.rotate(ang);
      ctx.fillStyle = "#d7dfec"; rr(ctx, -s * 0.06, 0, s * 0.12, s * 0.3, s * 0.06); ctx.fill();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(0, s * 0.32, s * 0.075, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    // antenna
    ctx.strokeStyle = "#b8c3d6"; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo(0, -s * 0.38); ctx.lineTo(Math.sin(st.t * 3) * s * 0.03, -s * 0.56); ctx.stroke();
    ctx.shadowColor = acc; ctx.shadowBlur = s * 0.15; ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(Math.sin(st.t * 3) * s * 0.03, -s * 0.58, s * 0.055 * (1 + st.o * 0.3), 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    // orecchie
    for (const sx of [-1, 1]) { ctx.fillStyle = acc; rr(ctx, sx * s * 0.5 - s * 0.05, -s * 0.12, s * 0.1, s * 0.26, s * 0.05); ctx.fill(); }
    // testa
    const hg = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.4); hg.addColorStop(0, "#ffffff"); hg.addColorStop(1, "#cfd8e8");
    ctx.fillStyle = hg; rr(ctx, -s * 0.5, -s * 0.4, s, s * 0.8, s * 0.26); ctx.fill();
    // schermo
    ctx.fillStyle = "#0c1330"; rr(ctx, -s * 0.4, -s * 0.29, s * 0.8, s * 0.58, s * 0.18); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.08)"; rr(ctx, -s * 0.36, -s * 0.26, s * 0.4, s * 0.12, s * 0.06); ctx.fill();
    // occhi luminosi
    ctx.shadowColor = acc; ctx.shadowBlur = s * 0.08; ctx.fillStyle = acc;
    for (const sx of [-1, 1]) { ctx.save(); ctx.translate(sx * s * 0.16 + st.look * s * 0.03, -s * 0.06); ctx.scale(1, Math.max(0.1, 1 - st.blink)); rr(ctx, -s * 0.06, -s * 0.08, s * 0.12, s * 0.16, s * 0.06); ctx.fill(); ctx.restore(); }
    // bocca luminosa
    const mw = s * 0.2 * (1 - st.r * 0.3 * st.o), mh = s * (0.02 + st.o * 0.12);
    if (st.o < 0.06) { ctx.strokeStyle = acc; ctx.lineWidth = s * 0.025; ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(0, s * 0.06, s * 0.08, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    else { rr(ctx, -mw / 2, s * 0.14 - mh / 2, mw, mh, mh / 2); ctx.fill(); }
    ctx.shadowBlur = 0;
    // guance
    ctx.fillStyle = "rgba(255,120,160,0.35)"; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * s * 0.27, s * 0.1, s * 0.05, s * 0.03, 0, 0, TAU); ctx.fill(); }
  }

  /* ---------- Libro ---------- */
  function libro(ctx, s, st, B) {
    const w = s * 0.82, h = s * 1.08;
    // gambe e scarpe
    for (const sx of [-1, 1]) { ctx.strokeStyle = "#1b1530"; ctx.lineWidth = s * 0.035; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sx * w * 0.2, h * 0.45); ctx.lineTo(sx * w * 0.22, h * 0.62); ctx.stroke(); ctx.fillStyle = "#1b1530"; ctx.beginPath(); ctx.ellipse(sx * w * 0.22 + sx * s * 0.04, h * 0.64, s * 0.08, s * 0.045, 0, 0, TAU); ctx.fill(); }
    // braccia
    for (const sx of [-1, 1]) {
      const wave = sx === 1 ? st.wave : 0; const ang = -sx * (0.35 + Math.sin(st.t * 2.2 + sx) * 0.1) - wave * (2.0 + Math.sin(st.t * 14) * 0.35);
      ctx.save(); ctx.translate(sx * w * 0.5, h * 0.02); ctx.rotate(ang); ctx.strokeStyle = "#1b1530"; ctx.lineWidth = s * 0.035; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sx * s * 0.06, s * 0.15, 0, s * 0.28); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1b1530"; ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.arc(0, s * 0.31, s * 0.06, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // pagine
    ctx.fillStyle = "#f4efe3"; rr(ctx, -w / 2 + s * 0.03, -h / 2 + s * 0.03, w + s * 0.03, h - s * 0.02, s * 0.04); ctx.fill();
    // copertina
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, lighten(B.c2, 0.35)); g.addColorStop(1, B.c2);
    ctx.save(); ctx.shadowColor = "rgba(255,255,255,0.45)"; ctx.shadowBlur = s * 0.12;
    ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, s * 0.05); ctx.fill(); ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(-w / 2, -h / 2 + s * 0.02, s * 0.07, h - s * 0.04);
    ctx.strokeStyle = B.accent; ctx.lineWidth = s * 0.02; rr(ctx, -w / 2 + s * 0.11, -h / 2 + s * 0.05, w - s * 0.16, h - s * 0.1, s * 0.03); ctx.stroke();
    // titolo
    ctx.fillStyle = B.accent; ctx.font = `900 ${s * 0.085}px Montserrat, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(st.title || "AI", s * 0.035, -h * 0.36, w * 0.72);
    // faccia
    eyes(ctx, s * 0.035, -h * 0.1, s * 0.3, s * 0.1, st.blink, st.look);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = s * 0.02; ctx.lineCap = "round";
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.035 + sx * s * 0.1, -h * 0.1 - s * 0.17 - st.o * s * 0.02); ctx.lineTo(s * 0.035 + sx * s * 0.2, -h * 0.1 - s * 0.15); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,120,160,0.4)"; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.035 + sx * s * 0.24, h * 0.06, s * 0.05, s * 0.03, 0, 0, TAU); ctx.fill(); }
    mouth(ctx, s * 0.035, h * 0.1, s * 0.2, st.o, st.r, { line: "#fff" });
  }

  /* ---------- Tazzina ---------- */
  function tazza(ctx, s, st, B) {
    const w = s * 0.86, h = s * 0.8;
    // vapore
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = s * 0.03; ctx.lineCap = "round";
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const yy = -h / 2 - s * 0.05 - i * s * 0.025; const xx = k * s * 0.16 + Math.sin(i * 0.7 - st.t * 4 + k) * s * 0.035; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.globalAlpha = 0.5 + 0.3 * Math.sin(st.t * 2 + k); ctx.stroke(); } ctx.globalAlpha = 1;
    // piattino
    ctx.fillStyle = "#e9e3d8"; ctx.beginPath(); ctx.ellipse(0, h / 2 + s * 0.02, w * 0.72, s * 0.08, 0, 0, TAU); ctx.fill();
    // manico
    ctx.strokeStyle = "#f6f2ea"; ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.ellipse(w / 2, 0, s * 0.13, s * 0.16, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    // braccia
    for (const sx of [-1, 1]) {
      const wave = sx === -1 ? st.wave : 0; ctx.save(); ctx.translate(sx * w * 0.47, h * 0.05); ctx.rotate((sx === -1 ? wave * (1.9 + Math.sin(st.t * 14) * 0.3) : 0) + Math.sin(st.t * 2 + sx) * 0.06);
      ctx.strokeStyle = "#3b2a22"; ctx.lineWidth = s * 0.03; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sx * s * 0.12, s * 0.18); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx * s * 0.13, s * 0.21, s * 0.05, 0, TAU); ctx.fill(); ctx.restore();
    }
    // corpo tazza
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, "#e6dfd2"); g.addColorStop(0.45, "#ffffff"); g.addColorStop(1, "#ddd5c6");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.quadraticCurveTo(w * 0.48, h * 0.45, w * 0.3, h / 2); ctx.lineTo(-w * 0.3, h / 2); ctx.quadraticCurveTo(-w * 0.48, h * 0.45, -w / 2, -h / 2); ctx.fill();
    ctx.fillStyle = B.accent; ctx.fillRect(-w * 0.47, h * 0.22, w * 0.94, s * 0.05);
    // caffè
    ctx.fillStyle = "#6b4226"; ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, s * 0.08, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#c8a27a"; ctx.beginPath(); ctx.ellipse(0, -h / 2, w * 0.3, s * 0.04, 0, 0, TAU); ctx.fill();
    // faccia
    eyes(ctx, 0, -h * 0.08, s * 0.3, s * 0.085, st.blink, st.look, { outline: "#3b2a22" });
    ctx.fillStyle = "rgba(255,120,140,0.45)"; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * s * 0.25, h * 0.06, s * 0.05, s * 0.03, 0, 0, TAU); ctx.fill(); }
    mouth(ctx, 0, h * 0.1, s * 0.17, st.o, st.r);
  }

  /* ---------- Immagine personalizzata (il tuo personaggio) ---------- */
  function immagine(ctx, s, st, B, img, cfg) {
    if (!img) return;
    const k = Math.min(s * 1.3 / img.naturalWidth, s * 1.3 / img.naturalHeight); const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    const mx = -w / 2 + w * (cfg.mx ?? 0.5), my = -h / 2 + h * (cfg.my ?? 0.62), mw = w * (cfg.ms ?? 0.16);
    if (cfg.mouthBg) { ctx.fillStyle = cfg.mouthBg; ctx.beginPath(); ctx.ellipse(mx, my, mw * 0.62, mw * 0.42, 0, 0, TAU); ctx.fill(); }
    mouth(ctx, mx, my, mw, st.o, st.r, { outline: "rgba(0,0,0,0.35)" });
  }

  const DRAW = { robot, libro, tazza, immagine };
  /** Disegna il personaggio `kind` centrato in (cx, cy) con dimensione s.
   *  lip: {o, r} del fotogramma; t: tempo; talking: se sta parlando ora. */
  function draw(ctx, kind, cx, cy, s, t, lip, B, extra = {}) {
    const f = DRAW[kind]; if (!f) return;
    const o = lip ? lip.o : 0, r = lip ? lip.r : 0;
    const st = { t, o, r, blink: blinkAt(t), look: Math.sin(t * 0.7) * 0.6, wave: extra.wave || 0, title: extra.title };
    ctx.save(); ctx.translate(cx, cy + Math.sin(t * 2.2) * s * 0.025 - o * s * 0.015);
    ctx.rotate(Math.sin(t * 1.3) * 0.035 + (o - 0.3) * 0.02 * Math.sin(t * 5));
    const sq = 1 + o * 0.025; ctx.scale(1 / sq, sq);
    // ombra a terra
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(0, s * 0.72, s * 0.45, s * 0.06, 0, 0, TAU); ctx.fill();
    f(ctx, s, st, B, extra.img, extra.cfg || {});
    ctx.restore();
  }
  window.Personaggi = { draw, lipsync, kinds: { robot: "Bit, il robot", libro: "Il libro parlante", tazza: "La tazzina", immagine: "La mia immagine" } };
})();
