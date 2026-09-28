# Mien — real-time facial expression reader

Mien watches a face through the camera and names what it is expressing, in real
time. It covers:

- **7 primary emotions**: happiness, sadness, surprise, fear, anger, disgust, contempt (plus neutral)
- **15 compound emotions** from Du, Tao & Martinez (2014): happily surprised, sadly angry, appalled, awe, …
- **Social & self-conscious states**: amusement, felt vs polite smile, embarrassment, shame, pride
- **Cognitive states**: concentration, confusion, worry, interest, skepticism, boredom
- **Physical states**: pain (with the clinical PSPI score), drowsiness (PERCLOS), yawning
- **Brief (micro) expressions**, blink rate and eyelid-closure statistics

For each label it shows **which facial muscles are doing the work** (FACS Action
Units), which face regions are active, and the research behind it. Everything runs
on the device; no images or data leave it.

> Faces show *expressions*, not guaranteed feelings. The same movement can mean
> different things in different people, contexts and cultures. See
> [docs/RESEARCH.md §7](docs/RESEARCH.md#7-limits-and-caveats).

## Two apps, one model

| | **Web app (PWA)** — `web/` | **Native iOS app** — `ios/` |
|---|---|---|
| Runs on | iPhone (Safari), Android (Chrome), desktop browsers | iPhone / iPad with Face ID (TrueDepth) |
| Face tracking | MediaPipe Face Landmarker (RGB camera) | ARKit face tracking (TrueDepth depth camera, 60 fps) |
| Install | Open a URL → *Add to Home Screen* | Build with Xcode on a Mac |
| Accuracy | Good; calibrate for best results | Best: depth-based, all 52 blendshapes active |

Both apps interpret the same expression model,
[`model/emotion-model.json`](model/emotion-model.json). The iOS engine is a Swift
port whose tests must reproduce the web engine's outputs exactly.

## Use it

### On your iPhone 16 Pro — web app (no Mac needed)

1. Enable GitHub Pages once: in this repository, go to **Settings → Pages → Build and
   deployment → Source: GitHub Actions**. Then re-run the latest **Web app**
   workflow (Actions tab), or push any change.
2. Open **https://ticksterius-afk.github.io/facial-expression/** in Safari.
3. Tap **Start camera** and allow camera access.
4. Tap **Calibrate** and hold a relaxed face for 3 seconds. This matters: see [why](docs/VALIDATION.md#1-what-mediapipe-actually-outputs).
5. Then do the **range calibration** it offers: seven faces made as strongly as you
   can (brows up, frown, eyes wide, lips stretched, smile, mouth down, nose wrinkle),
   about 20 seconds. It scales each signal to how far *your* face moves, which helps
   most with the brows. Redo it any time under Settings → *Calibrate expression range*.
6. Optional: Settings → **Extended emotion catalogue** adds triumph, frustration,
   anxiety, thinking, disappointment and sneer.
7. Optional: Share → **Add to Home Screen** for a full-screen app that also works offline.

### On your iPhone 16 Pro — native app (TrueDepth, most accurate)

You need a Mac with Xcode 16 or newer. A free Apple ID is enough to run on your own phone.

```sh
brew install xcodegen
cd ios && xcodegen          # generates Mien.xcodeproj from project.yml
open Mien.xcodeproj
```

In Xcode: select the **Mien** target → *Signing & Capabilities* → choose your
**Team**, and change the bundle identifier if Xcode asks. Then connect your
iPhone, select it as the run destination, and press **Run**. On first launch, allow
camera access. If iOS asks, trust the developer under *Settings → General → VPN &
Device Management* and enable *Developer Mode*.

### On Android

Open the same URL in **Chrome** → tap **Start camera** → calibrate. Chrome offers
**Install app** (menu → *Add to Home screen*) for a full-screen, offline-capable app.

### On a computer

Open the URL in Chrome, Edge, Safari or Firefox with a webcam. On the start screen,
**Analyze a video file** runs the same analysis on a recorded video.

## Develop

```sh
cd web
npm install
npm run dev              # http://localhost:5173 (camera works on localhost)
npm run dev:https        # https://<your-LAN-IP>:5173 for testing on a phone (accept the self-signed certificate)
npm run check            # model format, iOS model copy, typecheck, unit + golden tests
npm run build            # production build in web/dist (downloads the MediaPipe model once)
npm run e2e              # Playwright end-to-end tests (see web/tests/e2e/README.md)
```

Swift engine tests (macOS or Linux): `cd ios/EmotionEngine && swift test`.

After editing the model: `npm run format:model && npm run sync:ios && npm run golden && npm run check`.

## Repository layout

```
model/emotion-model.json     AU catalogue, per-platform AU recipes, 37 expression prototypes, citations
model/fixtures/              input sequences + golden outputs for cross-engine parity tests
web/src/engine/              TypeScript engine (baselines, AUs, scoring, temporal, display logic)
web/src/platform/mediapipe/  landmark geometry for MediaPipe (AU6, AU9, AU15, head pose, …)
web/src/app/, main.ts        web UI: camera, tracker, overlay, panels
web/tests/                   unit, geometry, golden and Playwright end-to-end tests
ios/EmotionEngine/           Swift package: engine port + tests (parity with the TypeScript engine)
ios/Mien/                    SwiftUI + ARKit app;  ios/project.yml → Xcode project (XcodeGen)
docs/RESEARCH.md             which facial movements portray which emotions — the science, with references
docs/ARCHITECTURE.md         pipeline and maths
docs/VALIDATION.md           how it was tested on real faces, and known weaknesses
```

## How it works (one paragraph)

The face tracker produces blendshape coefficients (and, on the web, landmark
geometry). These are compared with **your own neutral face** (calibrated, then
adapted continuously) and converted into **FACS Action Units**, e.g. AU1 inner brow
raiser, AU6 cheek raiser, AU12 lip corner puller. Each expression is a
**prototype**: combinations of Action Units that the literature associates with it
(EMFACS; Du et al., 2014; Keltner, 1995; Tracy & Robins, 2004; Prkachin & Solomon,
2008, and others), with alternative variants, supporting actions and actions that
argue against it. A soft-AND scores each prototype; temporal logic adds blinks,
PERCLOS, yawns, brief expressions and stable labels. Details:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy

Camera frames are processed in memory on the device and never stored or sent
anywhere. The web app downloads its code and the MediaPipe face model once, then
works offline. Only your calibration and settings are saved, locally
(`localStorage` / `UserDefaults`).

## Credits

Face tracking by [MediaPipe](https://ai.google.dev/edge/mediapipe) (Apache-2.0) and
Apple ARKit. The e2e test clip is a Pexels stock video from the
[py-feat](https://github.com/cosanlab/py-feat) test data. The expression science is
credited in [docs/RESEARCH.md](docs/RESEARCH.md#references).
