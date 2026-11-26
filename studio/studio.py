#!/usr/bin/env python3
"""Studio Pro: genera video verticali professionali da uno script, gratis.

Pipeline:
  1. voce neurale (edge-tts) scena per scena, con i tempi di ogni parola;
  2. clip video stock gratuite (Mixkit, licenza per uso commerciale) scelte per parola chiave;
  3. montaggio con tagli dinamici, zoom lento, color grading;
  4. sottotitoli animati parola per parola (stile TikTok) e titolo-gancio;
  5. musica di sottofondo abbassata automaticamente sotto la voce;
  6. scena prodotto con la copertina del libro in movimento.

Uso: python studio.py progetto.json uscita.mp4
"""
import asyncio, json, os, random, re, subprocess, sys, urllib.request, hashlib, math
from pathlib import Path

W, H, FPS = 1080, 1920, 30
CACHE = Path(os.environ.get("STUDIO_CACHE", Path(__file__).parent / ".cache"))
CACHE.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (StudioPro video generator)"}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg: " + r.stderr[-1500:])
    return r


def probe_dur(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", str(path)])
    return float(r.stdout.strip())


def fetch(url, dest):
    dest = Path(dest)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, open(str(dest) + ".part", "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    os.replace(str(dest) + ".part", dest)
    return dest


# ---------------------------------------------------------------- clip stock
def mixkit_search(keyword):
    slug = re.sub(r"[^a-z0-9]+", "-", keyword.lower()).strip("-")
    cache = CACHE / f"search-{slug}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    ids = []
    for url in (f"https://mixkit.co/free-stock-video/discover/{slug}/", f"https://mixkit.co/free-stock-video/{slug}/"):
        try:
            html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode("utf8", "ignore")
        except Exception:
            continue
        for m in re.finditer(r"videos/(\d+)/\1-360\.mp4", html):
            if m.group(1) not in ids:
                ids.append(m.group(1))
        if ids:
            break
    cache.write_text(json.dumps(ids))
    return ids


def clip_file(vid):
    for q in ("1080", "720"):
        try:
            return fetch(f"https://assets.mixkit.co/videos/{vid}/{vid}-{q}.mp4", CACHE / f"clip-{vid}-{q}.mp4")
        except Exception:
            continue
    raise RuntimeError(f"clip {vid} non disponibile")


# ---------------------------------------------------------------- voce
async def _tts(text, voice, rate, pitch, out):
    import ssl
    import edge_tts, edge_tts.communicate as ec
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if ca and os.path.exists(ca):  # dietro un proxy aziendale: usa il suo certificato
        ec._SSL_CTX = ssl.create_default_context(cafile=ca)
    words = []
    c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    with open(out, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append([ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7, ch["text"]])
    return words


def tts(text, voice, rate="+5%", pitch="+0Hz"):
    key = hashlib.sha1(f"{voice}|{rate}|{pitch}|{text}".encode()).hexdigest()[:16]
    mp3, js = CACHE / f"tts-{key}.mp3", CACHE / f"tts-{key}.json"
    if not (mp3.exists() and js.exists()):
        words = asyncio.run(_tts(text, voice, rate, pitch, mp3))
        js.write_text(json.dumps(words))
    return mp3, json.loads(js.read_text())


# ---------------------------------------------------------------- sottotitoli ASS
def ass_color(hex_, alpha=0):
    h = hex_.lstrip("#")
    return f"&H{alpha:02X}{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def ass_time(t):
    t = max(0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def ass_escape(s):
    return s.replace("\\", "").replace("{", "(").replace("}", ")")


def build_ass(project, timeline, path):
    b = project["brand"]
    acc, txt = ass_color(b.get("accent", "#FFD233")), ass_color("#FFFFFF")
    font = b.get("font", "Montserrat ExtraBold")
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},{project.get("caption_size", 104)},{txt},{acc},&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,8,4,5,60,60,0,1
Style: Hook,Montserrat Black,{project.get("hook_size", 96)},&H00111111,{acc},{acc},&H00000000,0,0,0,0,100,100,0,0,3,26,0,5,80,80,0,1
Style: Small,{font},40,{txt},{acc},&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,3,2,5,60,60,0,1
Style: CTA,Montserrat Black,78,&H00111111,{acc},{acc},&H00000000,0,0,0,0,100,100,0,0,3,30,0,5,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    cap_y = int(H * project.get("caption_y", 0.57 if project.get("mascot") else 0.64))
    # sottotitoli parola per parola, a gruppi di max 3 parole
    for sc in timeline:
        words = sc["words"]
        if not words or sc.get("no_captions"):
            continue
        groups, cur = [], []
        for w in words:
            if cur and (len(" ".join(x[2] for x in cur + [w])) > project.get("caption_chars", 15) or len(cur) >= project.get("caption_words", 3)):
                groups.append(cur); cur = []
            cur.append(w)
            if re.search(r"[.,!?;:]$", w[2]):
                groups.append(cur); cur = []
        if cur:
            groups.append(cur)
        for gi, g in enumerate(groups):
            g_end = g[-1][1] + 0.12
            if gi + 1 < len(groups):
                g_end = min(g_end, groups[gi + 1][0][0] - 0.01)
            for i, w in enumerate(g):
                st = w[0]
                en = g[i + 1][0] if i + 1 < len(g) else g_end
                parts = []
                for j, x in enumerate(g):
                    word = ass_escape(x[2].upper())
                    if j == i:
                        parts.append(r"{\c" + acc + r"\fscx112\fscy112}" + word + r"{\c" + txt + r"\fscx100\fscy100}")
                    else:
                        parts.append(word)
                pop = r"{\fscx70\fscy70\t(0,90,\fscx100\fscy100)}" if i == 0 else ""
                y = int(H * sc["caption_y"]) if sc.get("caption_y") else cap_y
                ev.append(f"Dialogue: 1,{ass_time(sc['t0'] + st)},{ass_time(sc['t0'] + en)},Cap,,0,0,0,,{{\\pos({int(W * (sc.get("caption_x") or project.get("caption_x", 0.5)))},{y})}}{pop}{' '.join(parts)}")
    # gancio in alto nei primi secondi
    hook = project.get("hook_text")
    if hook:
        end = min(timeline[0]["t1"], 3.6)
        lines = ass_escape(hook.upper()).replace("\n", "\\N")
        ev.append(f"Dialogue: 2,{ass_time(0.05)},{ass_time(end)},Hook,,0,0,0,,{{\\pos({W // 2},{int(H * project.get("hook_y", 0.25))})\\fscx60\\fscy60\\t(0,160,\\fscx100\\fscy100)\\fad(0,200)}}{lines}")
    # testi sovrapposti per scena (es. "LINK IN BIO")
    for sc in timeline:
        ov = sc.get("overlay")
        if ov:
            st = "CTA" if sc.get("kind") == "cta" else "Hook"
            ev.append(f"Dialogue: 2,{ass_time(sc['t0'] + 0.25)},{ass_time(sc['t1'])},{st},,0,0,0,,{{\\pos({int(W * 0.66) if (sc.get('kind') == 'cta' and project.get('mascot')) else W // 2},{int(H * ((0.63 if project.get('mascot') else 0.78) if sc.get('kind') == 'cta' else 0.25))})\\fscx50\\fscy50\\t(0,180,\\fscx100\\fscy100)}}{ass_escape(ov.upper())}")
    handle = b.get("handle")
    if handle:
        total = timeline[-1]["t1"]
        ev.append(f"Dialogue: 0,{ass_time(0)},{ass_time(total)},Small,,0,0,0,,{{\\pos({W // 2},{int(H * 0.085)})\\alpha&H30&}}{ass_escape(handle)}")
    Path(path).write_text(head + "\n".join(ev) + "\n", encoding="utf8")


# ---------------------------------------------------------------- segmenti video
GRADE = "eq=contrast=1.05:saturation=1.25:brightness=0.035,vignette=PI/8"


def stock_segment(src, start, dur, out, zoom_dir):
    """Ritaglia una clip in verticale con zoom lento (in o out) e color grading."""
    frames = int(round(dur * FPS))
    z = "min(1+0.0009*on,1.12)" if zoom_dir > 0 else "max(1.12-0.0009*on,1)"
    vf = (f"scale=-2:{int(H * 1.0)}:flags=lanczos,crop={W}:{H},fps={FPS},"
          f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},"
          f"{GRADE},format=yuv420p")
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", str(src), "-t", f"{dur:.3f}", "-an",
         "-vf", vf, "-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(out)])


def screen_segment(src, start, dur, out, spec, crop_x, work):
    """Clip con telefono a schermo verde: al posto del verde mette la chat animata, seguendo lo schermo."""
    import numpy as np
    from PIL import Image
    from scipy.ndimage import binary_fill_holes
    frames = int(round(dur * FPS))
    cdir = Path(work) / ("chat-" + hashlib.sha1(json.dumps(spec, sort_keys=True).encode() + f"{dur:.2f}".encode() + (Path(__file__).parent / "chat.html").read_bytes()).hexdigest()[:10])
    if not (cdir.exists() and len(list(cdir.glob("*.png"))) >= frames):
        sp = Path(work) / "chat-spec.json"
        sp.write_text(json.dumps({**spec, "dur": dur}))
        subprocess.run(["node", str(Path(__file__).parent / "chat_render.js"), str(sp), str(cdir), "600", "1200", str(FPS)], check=True, capture_output=True)
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{start:.2f}", "-i", str(src), "-t", f"{dur + 0.2:.3f}",
                            "-vf", f"scale=-2:{H},crop={W}:{H}:{crop_x}:0,fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-vf", f"{GRADE},format=yuv420p", "-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(out)], stdin=subprocess.PIPE)
    box, last = None, None
    GY = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    GX = np.linspace(0, 1, W, dtype=np.float32)[None, :, None]
    for i in range(frames):
        buf = dec.stdout.read(W * H * 3)
        if len(buf) == W * H * 3:
            last = buf
        a = np.frombuffer(last, np.uint8).reshape(H, W, 3).astype(np.float32)
        g = a[:, :, 1] - np.maximum(a[:, :, 0], a[:, :, 2])
        alpha = np.clip((g - 20) / 45, 0, 1)
        from scipy.ndimage import label
        lab, n = label(alpha > 0.5)
        if n:  # tieni solo la regione verde più grande: lo schermo (non le piante sullo sfondo)
            sizes = np.bincount(lab.ravel()); sizes[0] = 0
            screen = lab == sizes.argmax()
        else:
            screen = np.zeros(alpha.shape, bool)
        solid = binary_fill_holes(screen)               # riempie i segni di tracciamento sullo schermo
        ys, xs = np.nonzero(solid)
        if len(xs):
            m = np.zeros(alpha.shape, np.float32); m[max(0, ys.min() - 6):ys.max() + 7, max(0, xs.min() - 6):xs.max() + 7] = 1
            alpha = np.maximum(alpha * m, solid.astype(np.float32))
        else:
            alpha = alpha * 0
        if len(xs) > 500:
            # i 4 angoli reali dello schermo (anche se il telefono è inclinato o in prospettiva)
            sm, df = xs + ys, xs - ys
            quad = np.array([[xs[sm.argmin()], ys[sm.argmin()]], [xs[df.argmax()], ys[df.argmax()]],
                             [xs[sm.argmax()], ys[sm.argmax()]], [xs[df.argmin()], ys[df.argmin()]]], np.float32)
            box = quad if box is None else box * 0.35 + quad * 0.65
        if box is not None:
            cimg = Image.open(cdir / f"c{min(i, frames - 1):05d}.png").convert("RGB")
            cw, ch = cimg.size
            # trasformazione prospettica: punto del fotogramma -> punto della chat
            A, Bv = [], []
            for (X, Y), (u, v) in zip(box, [(0, 0), (cw, 0), (cw, ch), (0, ch)]):
                A += [[X, Y, 1, 0, 0, 0, -u * X, -u * Y], [0, 0, 0, X, Y, 1, -v * X, -v * Y]]; Bv += [u, v]
            coef = np.linalg.solve(np.array(A, np.float64), np.array(Bv, np.float64))
            C = np.asarray(cimg.transform((W, H), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC), np.float32)
            # luce della stanza e riflesso del vetro
            C = C * 0.93 + 6
            C = C + 16 * np.clip(1 - np.abs((GX * 0.7 + GY * 0.6) - 0.55) * 6, 0, 1)
            # togli il riflesso verde dai bordi
            a[:, :, 1] = np.where(alpha > 0, np.minimum(a[:, :, 1], np.maximum(a[:, :, 0], a[:, :, 2])), a[:, :, 1])
            a = a * (1 - alpha[..., None]) + C * alpha[..., None]
        enc.stdin.write(np.clip(a, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close(); enc.wait(); dec.kill()


def product_segment(cover, bg_src, dur, out, accent, cy=0.5):
    """Copertina che entra con zoom e galleggia sopra uno sfondo sfocato in movimento."""
    frames = int(round(dur * FPS))
    flt = (f"[0:v]scale=-2:{H},crop={W}:{H},fps={FPS},gblur=sigma=26,eq=brightness=-0.07:saturation=1.2,format=yuv420p[bg];"
           f"[1:v]format=rgba,scale=w='min(780,520+1300*t)':h=-1:eval=frame[cv];"
           f"[bg][cv]overlay=x='(W-w)/2':y='H*{cy}-h/2-190*{1 if cy == 0.5 else 0}+18*sin(2*PI*t/3)':eval=frame,vignette=PI/4,format=yuv420p[v]")
    run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(bg_src), "-loop", "1", "-framerate", str(FPS), "-i", str(cover),
         "-filter_complex", flt, "-map", "[v]", "-t", f"{dur:.3f}", "-frames:v", str(frames), "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(out)])


# ---------------------------------------------------------------- progetto
def make(project_path, out_path):
    P = json.loads(Path(project_path).read_text())
    base = Path(project_path).parent
    work = CACHE / ("job-" + hashlib.sha1(Path(project_path).read_bytes()).hexdigest()[:10])
    work.mkdir(exist_ok=True)
    rnd = random.Random(P.get("seed", 7))
    voice, rate, pitch = P.get("voice", "it-IT-IsabellaNeural"), P.get("rate", "+6%"), P.get("pitch", "+0Hz")
    used = set()
    timeline, t, segs, voice_parts = [], 0.0, [], []
    gap = 0.18
    for i, sc in enumerate(P["scenes"]):
        mp3, words = tts(sc["say"], voice, rate, pitch)
        if P.get("voice_fx"):
            fx = CACHE / (mp3.stem + "-fx-" + hashlib.sha1(P["voice_fx"].encode()).hexdigest()[:8] + ".mp3")
            if not fx.exists():
                run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-af", P["voice_fx"], "-c:a", "libmp3lame", "-b:a", "192k", str(fx)])
            mp3 = fx
        vd = probe_dur(mp3)
        dur = round(max(vd + gap, sc.get("min_dur", 0)), 2)
        timeline.append({"t0": t, "t1": t + dur, "words": words, "overlay": sc.get("overlay"), "kind": sc.get("kind", "stock"),
                         "no_captions": sc.get("no_captions", False), "caption_y": sc.get("caption_y"), "caption_x": sc.get("caption_x")})
        voice_parts.append((mp3, t))
        # video della scena
        if sc.get("screen"):
            scr = sc["screen"]
            src = clip_file(str(scr["clip"]))
            seg = work / f"s{i:02d}.mp4"
            screen_segment(src, scr.get("start", 0.3), dur, seg, {k: v for k, v in scr.items() if k not in ("clip", "start", "crop_x")}, scr.get("crop_x", 1166), work)
            segs.append(seg)
        elif sc.get("kind") in ("product", "cta"):
            bgid = str(sc["clips"][0]) if sc.get("clips") else next((v for kw in sc.get("keywords", ["abstract"]) for v in mixkit_search(kw) if v not in used), None)
            used.add(bgid)
            seg = work / f"s{i:02d}.mp4"
            product_segment(base / P["cover"], clip_file(bgid), dur, seg, P["brand"].get("accent", "#FFD233"), cy=0.36 if P.get("mascot") else 0.5)
            segs.append(seg)
        else:
            fixed = [str(v) for v in sc.get("clips", [])]
            pool = fixed or [v for kw in sc["keywords"] for v in mixkit_search(kw)]
            n_cuts = max(1, math.ceil(dur / P.get("cut_every", 2.6)))
            piece = dur / n_cuts
            for k in range(n_cuts):
                cand = [v for v in pool if v not in used] or pool
                vid = fixed[k % len(fixed)] if fixed else (cand[0] if k == 0 and i == 0 else rnd.choice(cand[:6]))
                used.add(vid)
                src = clip_file(vid)
                sd = probe_dur(src)
                start = rnd.uniform(0.3, max(0.4, sd - piece - 0.3))
                seg = work / f"s{i:02d}_{k}.mp4"
                stock_segment(src, start, piece, seg, 1 if (i + k) % 2 == 0 else -1)
                segs.append(seg)
        t += dur
    total = t
    # unisci i segmenti
    lst = work / "list.txt"
    lst.write_text("".join(f"file '{s}'\n" for s in segs))
    joined = work / "joined.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])
    # sottotitoli
    ass = work / "subs.ass"
    build_ass(P, timeline, ass)
    # audio: voce + musica abbassata sotto la voce
    inputs, flt = ["-i", str(joined)], []
    for k, (mp3, st) in enumerate(voice_parts):
        inputs += ["-i", str(mp3)]
        flt.append(f"[{k + 1}:a]adelay={int(st * 1000)}|{int(st * 1000)},aformat=channel_layouts=stereo[v{k}]")
    nv = len(voice_parts)
    flt.append("".join(f"[v{k}]" for k in range(nv)) + f"amix=inputs={nv}:normalize=0,dynaudnorm=f=150:g=7:p=0.9,highpass=f=90,equalizer=f=3000:t=q:w=1.2:g=3,asplit=2[voice][side]")
    music = P.get("music")
    if music:
        mfile = fetch(f"https://assets.mixkit.co/music/{music}/{music}.mp3", CACHE / f"music-{music}.mp3")
        inputs += ["-stream_loop", "-1", "-i", str(mfile)]
        mi = nv + 1
        flt.append(f"[{mi}:a]volume={P.get('music_volume', 0.12)},equalizer=f=1500:t=q:w=1.5:g=-6,equalizer=f=3000:t=q:w=1.5:g=-5,afade=t=in:d=0.6,afade=t=out:st={max(0, total - 1.5):.2f}:d=1.5,aformat=channel_layouts=stereo[m]")
        flt.append("[m][side]sidechaincompress=threshold=0.015:ratio=14:attack=10:release=400:makeup=1[mduck]")
        flt.append("[voice][mduck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=9,alimiter=limit=0.95[aout]")
    else:
        flt.append("[voice]anull[aout]")
    fonts = str(Path.home() / ".fonts")
    vin = "[0:v]"
    M = P.get("mascot")
    if M:
        # voce completa (mono) per il labiale, poi fotogrammi trasparenti del personaggio
        vwav = work / "voice.wav"
        vf = [f"[{k}:a]adelay={int(st * 1000)}|{int(st * 1000)}[a{k}]" for k, (mp3, st) in enumerate(voice_parts)]
        vf.append("".join(f"[a{k}]" for k in range(nv)) + f"amix=inputs={nv}:normalize=0,apad,atrim=0:{total:.2f}[o]")
        run(["ffmpeg", "-v", "error", "-y", *sum([["-i", str(m)] for m, _ in voice_parts], []), "-filter_complex", ";".join(vf), "-map", "[o]", "-ac", "1", "-ar", "24000", str(vwav)])
        fr = work / "mascot"
        if fr.exists():
            for f in fr.glob("*.png"):
                f.unlink()
        size = int(M.get("size", 520))
        if M.get("kind") in ("robot3d", "nova3d"):
            cmd = ["node", str(Path(__file__).parent / "robot3d.js"), str(vwav), str(fr), str(FPS), f"{total:.2f}", P["brand"].get("accent", "#FFD233"), str(size), M.get("glow", "#6be4ff" if M["kind"] == "robot3d" else "#ff4fae"), M["kind"]]
        else:
            cmd = ["node", str(Path(__file__).parent / "mascot.js"), str(vwav), str(fr), str(FPS), f"{total:.2f}", M.get("kind", "robot"), P["brand"].get("accent", "#FFD233"), str(size)]
        subprocess.run(cmd, check=True, capture_output=True)
        inputs += ["-framerate", str(FPS), "-i", str(fr / "f%05d.png")]
        idx = sum(1 for x in inputs if x == "-i") - 1
        mx, my = int(W * M.get("x", 0.02)), int(H * M.get("y", 0.62))
        flt.append(f"[0:v][{idx}:v]overlay=x={mx}:y={my}:eof_action=pass[vm]")
        vin = "[vm]"
    flt.append(f"{vin}ass={ass}:fontsdir={fonts}[vout]")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(flt), "-map", "[vout]", "-map", "[aout]",
         "-t", f"{total:.2f}", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out_path)])
    return total


if __name__ == "__main__":
    d = make(sys.argv[1], sys.argv[2])
    print(f"OK {sys.argv[2]} · {d:.1f}s")
