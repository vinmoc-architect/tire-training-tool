# Tire Training Tool

Web-app sperimentale per gestire un flusso di segmentazione immagini (SAM2) destinato alla creazione di dataset su pneumatici. Questa base di progetto fornisce:

- interfaccia React + Vite per caricare singole immagini o cartelle intere;
- gestione locale dello stato con preview, stato di avanzamento e editor interattivo per SAM2;
- API Node/Express (placeholder) che riceve gli upload e restituirà il risultato della segmentazione SAM2.

## Requisiti
- Node.js 18+
- npm 9+

## Avvio rapido
```bash
npm install
npm run dev
```
Il comando avvia client Vite (porta 5173) e API Express (porta 4000) con proxy automatico `/api`.

## Script disponibili
- `npm run dev` avvia client e server in parallelo.
- `npm run dev:client` avvia solo la UI.
- `npm run dev:server` avvia solo le API in watch mode.
- `npm run build` produce il bundle Vite.
- `npm run preview` serve il bundle già compilato.
- `npm run lint` esegue ESLint su client e server.

## Struttura
```
├── src/                # Front-end (React + Vite)
│   ├── components/     # Uploader, griglia, controlli SAM2
│   ├── hooks/          # Store Zustand per le immagini
│   ├── lib/            # Client API verso il backend
│   └── styles/         # Stili di base
├── server/             # API Express (placeholder SAM2)
└── README.md
```

## Backend SAM/SAM2
Il server Node richiama un runner Python (`server/run_segmentation.py`) che usa il modulo `server/segmentation.py` basato su [Ultralytics SAM](https://docs.ultralytics.com/models/sam/). Prima di avviare l’app:

```bash
cd server
python -m venv .venv && source .venv/bin/activate   # oppure conda, come preferisci
pip install -r requirements.txt
```

Scarica i pesi SAM/SAM2 (formato `.pt`) nelle posizioni desiderate e imposta le variabili d’ambiente (puoi indicare solo quelle che usi):

```bash
export SEGMENTATION_PYTHON_PATH=/percorso/al/python         # opzionale, default python3
export SEGMENTATION_DEFAULT_ALGORITHM=sam2                  # opzionale (sam | sam2)
export SEGMENTATION_DEFAULT_MODEL_SIZE=base                 # opzionale (tiny|small|base|large)

# Pesi SAM
export SAM_MODEL_TINY_PATH=/models/sam_t.pt
export SAM_MODEL_SMALL_PATH=/models/sam_s.pt
export SAM_MODEL_BASE_PATH=/models/sam_b.pt
export SAM_MODEL_LARGE_PATH=/models/sam_l.pt

# Pesi SAM2
export SAM2_MODEL_TINY_PATH=/models/sam2_t.pt
export SAM2_MODEL_SMALL_PATH=/models/sam2_s.pt
export SAM2_MODEL_BASE_PATH=/models/sam2_b.pt
export SAM2_MODEL_LARGE_PATH=/models/sam2_l.pt
```

Finché l’ambiente Python resta attivo (o `SEGMENTATION_PYTHON_PATH` punta al suo interprete) puoi avviare l’applicazione con `npm run dev`.

Endpoint `/api/segment` accetta richieste `multipart/form-data` con i campi:

- `image` (file): immagine di input.
- `points` (stringa JSON opzionale): array di punti `{ "x": <pixel>, "y": <pixel>, "label": 0|1 }`.
- `boundary` (stringa JSON opzionale): poligono `{ "points": [ { "x": .., "y": .. }, ... ] }`.
- `prompt` (stringa opzionale): annotazioni testuali salvate nei metadati.
- `promptType` (`point` | `box`), `algorithm` (`sam`|`sam2`) e `modelSize` (`tiny`|`small`|`base`|`large`): selezionati dal front-end e inoltrati al runner Python.
- `rootDir` (stringa, solo per `POST /api/save-mask`): cartella base scelta dall’utente in cui il backend crea le sottocartelle `OK/`, `SHOULDER_IN/`, etc.
- Endpoint extra: `POST /api/preprocess/grayscale` (body JSON `{ imageData: string, mode: 'standard'|'clahe'|'adaptive'|'gaussian' }`) restituisce la nuova data URL processata tramite OpenCV.

Almeno uno tra `points` o `boundary` deve essere presente.

### Salvataggio con label
- Dopo la segmentazione, scegli una label tra `OK`, `SHOULDER_IN`, `SHOULDER_OUT`, `BALS`, `UNEVEN`.
- Nella home page puoi indicare la cartella root dove verranno creati i sottodirectory delle label; il valore è salvato in `localStorage` per comodità.
- Il front-end invia la mask (data URL) all’endpoint `POST /api/save-mask`, che salva il PNG all’interno di `<root>/<LABEL>/`.
- Nei metadati della card viene mostrato il percorso salvato per riferimento rapido.
- Per il preprocessing è disponibile l’endpoint `POST /api/preprocess/grayscale` (body JSON `{ imageData, mode }`) con i filtri OpenCV `standard`, `clahe`, `adaptive`, `gaussian`; la response contiene la nuova data URL usata dagli step successivi del wizard.

### Debug suggerito
- Dopo ogni step, la UI stampa in console (`console.debug`) messaggi `[wizard]` con lunghezza delle data URL e step corrente. Apri gli strumenti dev e controlla queste entry per assicurarti che lo step 3 stia usando l’output dello step 2.
- Verifica che `maskPreviewLocal` venga aggiornato con la lunghezza attesa dopo la segmentazione e dopo l’applicazione del filtro grayscale (console log `[wizard] segmentation done` / `[wizard] applying grayscale`).
- Se lo step 4 mostra l’immagine originale, accertati che gli step precedenti non abbiano resettato lo stato (messaggi `[wizard] state snapshot` evidenziano eventuali reset).

## Flusso UI
1. Carica immagini o cartelle dal pannello principale.
2. Configura la cartella root dove salvare le mask (pannello dedicato).
3. Per ogni carta clicca `Apri editor`: si apre una modale a cinque step (`Crop → Segmenta → Normalizza → Grayscale → Review`).
4. Step 1 (Crop): seleziona l’area da ritagliare (crop) oppure salta.
5. Step 2 (Segmenta): scegli `Points` o `Boundary`, l’algoritmo e la dimensione del modello, poi premi `Applica SAM/SAM2`.
6. Step 3 (Normalizza): ridimensiona l’immagine segmentata (224×224 oppure 320×320) e applica eventuali rotazioni/flip, oppure salta lo step.
7. Step 4 (Grayscale): scegli il filtro OpenCV (standard, CLAHE, adaptive threshold, gaussian blur) e applicalo; puoi anche usare direttamente il risultato SAM/SAM2.
8. Step 5 (Review): verifica l’output finale e salva scegliendo la label; è sempre possibile tornare indietro agli step precedenti per correggere.

## Prossimi passi suggeriti
1. Migliorare gli strumenti grafici (zoom, modifica dei vertici, supporto multi-istanza).
2. Salvare temporaneamente su disco i file caricati e i risultati della segmentazione.
3. Introdurre un job queue per elaborazioni batch/asincrone.
4. Gestire utenti e progressi (auth + persistenza stato).
5. Scalare il backend con code di job e caching dei modelli per gestire batch di grandi dimensioni.
