// Voce neurale gratuita nel browser: modelli Piper (open source) + onnxruntime-web.
// Nessuna chiave, nessun credito. I modelli si scaricano una volta e restano in cache.
const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/";
const ORT = "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/";
const PHON = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";
const PHON_JS = "https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/piper-DeOu3H9E.js";

export const VOICES = {
  "it-paola":    { label: "Paola · italiano (donna)",    path: "it/it_IT/paola/medium/it_IT-paola-medium" },
  "it-riccardo": { label: "Riccardo · italiano (uomo)",  path: "it/it_IT/riccardo/x_low/it_IT-riccardo-x_low" },
  "en-female":   { label: "Hannah · English (woman)",    path: "en/en_US/hfc_female/medium/en_US-hfc_female-medium" },
  "en-male":     { label: "Ryan · English (man)",        path: "en/en_US/ryan/medium/en_US-ryan-medium" },
  "ro-mihai":    { label: "Mihai · română (bărbat)",     path: "ro/ro_RO/mihai/medium/ro_RO-mihai-medium" },
  "es-davefx":   { label: "Dave · español (hombre)",     path: "es/es_ES/davefx/medium/es_ES-davefx-medium" },
};

let ortP = null, phonP = null; const sessions = new Map();
function loadScript(src) { return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("impossibile caricare " + src)); document.head.append(s); }); }
async function getOrt() {
  if (!ortP) ortP = (window.ort ? Promise.resolve() : loadScript(ORT + "ort.min.js")).then(() => { window.ort.env.wasm.wasmPaths = ORT; window.ort.env.wasm.numThreads = 1; return window.ort; });
  return ortP;
}
async function cachedFetch(url, onProgress) {
  let cache = null; try { cache = await caches.open("fotogramma-voci-v1"); const hit = await cache.match(url); if (hit) return hit.arrayBuffer(); } catch (e) {}
  const res = await fetch(url); if (!res.ok) throw new Error("download non riuscito (" + res.status + ")");
  const total = +res.headers.get("Content-Length") || 0; const reader = res.body.getReader(); const parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress && onProgress(got, total); }
  const blob = new Blob(parts); try { cache && await cache.put(url, new Response(blob)); } catch (e) {}
  return blob.arrayBuffer();
}
async function phonemize(text, espeakVoice) {
  if (!phonP) phonP = import(PHON_JS);
  const mod = await phonP; const create = mod.createPiperPhonemize || mod.default || Object.values(mod).find(v => typeof v === "function");
  return new Promise(async (ok, ko) => {
    try {
      const m = await create({ print: l => ok(JSON.parse(l).phoneme_ids), printErr: l => ko(new Error(l)), locateFile: f => f.endsWith(".wasm") ? PHON + ".wasm" : f.endsWith(".data") ? PHON + ".data" : f });
      m.callMain(["-l", espeakVoice, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]);
    } catch (e) { ko(e); }
  });
}
async function session(id, onProgress) {
  if (sessions.has(id)) return sessions.get(id);
  const p = (async () => {
    const v = VOICES[id]; const ort = await getOrt();
    const cfg = JSON.parse(new TextDecoder().decode(await cachedFetch(HF + v.path + ".onnx.json")));
    const model = await cachedFetch(HF + v.path + ".onnx", onProgress);
    const s = await ort.InferenceSession.create(model);
    return { s, cfg };
  })();
  sessions.set(id, p); p.catch(() => sessions.delete(id)); return p;
}
export async function isCached(id) { try { const c = await caches.open("fotogramma-voci-v1"); return !!(await c.match(HF + VOICES[id].path + ".onnx")); } catch (e) { return false; } }

/** Sintetizza `text`. speed: 0.7–1.4 (1 normale). pitch: 0.8–1.6 (1 normale; >1 voce più acuta da personaggio).
 *  Restituisce { samples: Float32Array, sampleRate }. */
export async function speak(text, { voice = "it-paola", speed = 1, pitch = 1, onProgress } = {}) {
  const { s, cfg } = await session(voice, onProgress); const ort = await getOrt();
  const sr = cfg.audio.sample_rate; const out = [];
  // una frase alla volta: pause naturali e niente limiti di lunghezza
  const sentences = String(text).replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*["»”]?\s*/g) || [String(text)];
  for (const sent of sentences) {
    const t = sent.trim(); if (!t) continue;
    const ids = await phonemize(t, cfg.espeak.voice);
    const feeds = {
      input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor("float32", Float32Array.from([cfg.inference.noise_scale, cfg.inference.length_scale * pitch / speed, cfg.inference.noise_w]), [3]),
    };
    if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
    const r = await s.run(feeds); out.push(r.output.data);
    out.push(new Float32Array(Math.round(sr * (/[.!?…]$/.test(t) ? 0.28 : 0.12))));
  }
  let len = out.reduce((a, b) => a + b.length, 0); let pcm = new Float32Array(len); let o = 0; for (const b of out) { pcm.set(b, o); o += b.length; }
  // effetto "personaggio": ricampiona per alzare il tono mantenendo la durata (la durata è già compensata sopra)
  if (pitch !== 1) { const n = Math.floor(pcm.length / pitch); const res = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * pitch, k = Math.floor(x), f = x - k; res[i] = (pcm[k] || 0) * (1 - f) + (pcm[k + 1] || 0) * f; } pcm = res; }
  // normalizza
  let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v)); if (peak > 0) { const g = 0.92 / peak; for (let i = 0; i < pcm.length; i++) pcm[i] *= g; }
  return { samples: pcm, sampleRate: sr };
}
