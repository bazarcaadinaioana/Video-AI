# Fotogramma Studio

Generatore di video brevi per TikTok, Instagram Reels e YouTube Shorts. Funziona interamente nel browser: scrivi le scene, scegli il kit del brand e scarichi un MP4 1080×1920 pronto da pubblicare.

## Cosa fa

- **Modelli pronti**: promo ebook (italiano e inglese), negozio/prodotto, attività locale.
- **6 tipi di scena**: gancio, elenco punti, prodotto (con copertina 3D generata o la tua immagine), numero grande, recensione, invito all'azione.
- **Testo animato parola per parola**, con parole evidenziate tra `*asterischi*`.
- **Kit del brand salvabili**: colori, font, logo, handle, sfondo animato (stelle, aurora, griglia, pulito), transizioni. Utile per gestire più clienti.
- **Formati**: 9:16, 4:5, 1:1, 16:9.
- **Audio**: basi musicali integrate (generate, quindi senza problemi di copyright), oppure il tuo file, più effetti "whoosh" ai cambi scena.
- **Aree sicure di TikTok**: mostra dove l'interfaccia dell'app copre il video.
- **Script con l'AI** (quando la pagina è aperta come Artifact su claude.ai): descrivi il prodotto e ottieni scene e didascalia con hashtag.

## Voce e personaggio parlante (gratis)

- **Voci neurali open source** (Piper) che girano direttamente nel browser: italiano (Paola, Riccardo), inglese, rumeno, spagnolo. Niente crediti né abbonamenti: la voce si scarica una volta (60-80 MB) e resta in cache.
- **Personaggi animati** disegnati a codice: il libro parlante, Bit il robot, la tazzina, oppure la tua immagine (ad esempio creata con ChatGPT o Gemini) con una bocca animata sopra.
- **Labiale automatico**: la bocca si muove seguendo l'audio, anche con una voce registrata da te.
- **Sottotitoli nel fumetto** sincronizzati parola per parola.

## Come si usa

Apri la versione pubblicata su GitHub Pages (Settings → Pages → Deploy from a branch) oppure servi la cartella con un qualsiasi server statico, in Chrome, Edge o Safari aggiornati (anche da telefono). Non serve installare nulla.

L'esportazione usa WebCodecs (H.264 + AAC) ed è più veloce del tempo reale. Sui browser senza WebCodecs registra il video in tempo reale.
