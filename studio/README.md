# Studio Pro

Motore che monta video verticali (1080×1920) da uno script JSON, tutto gratis:

- voce neurale con i tempi di ogni parola (edge-tts);
- clip stock vere da Mixkit (licenza gratuita, uso commerciale consentito), scelte a mano (`clips`) o per parola chiave (`keywords`);
- tagli ogni ~2,5 s, zoom lento, color grading;
- sottotitoli animati parola per parola in stile TikTok e gancio iniziale;
- musica Mixkit abbassata automaticamente sotto la voce;
- scena prodotto con copertina in movimento e chiusura "Link in bio".

```
pip install edge-tts
python studio.py progetto.json uscita.mp4
```

Serve ffmpeg con libass e il font Montserrat (ExtraBold e Black) installato.
