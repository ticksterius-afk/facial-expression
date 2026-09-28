# Validation

How the model was checked against real faces, what the numbers mean, and what is
still weak. The short version: **happiness and surprise are reliable; sadness,
anger and disgust are hard for any camera-only system without per-person
calibration; the app is built around calibration for that reason.**

## 1. What MediaPipe actually outputs

The web app uses MediaPipe Face Landmarker (478 landmarks + 52 ARKit-style
blendshapes). Before writing any rules, the blendshapes were measured on 2,110
labelled face photos (see §3). Three findings shaped the design:

- **`cheekSquint*` and `noseSneer*` are always 0.** MediaPipe's blendshape model
  never activates them. These are the channels for **AU6** (the "Duchenne" cheek
  raise) and **AU9** (the nose wrinkle at the core of disgust). The web app
  therefore measures them from **landmark geometry**: the outer malar (under-eye
  cheek) surface lifting, lower-lid height, and the nostril wings rising towards
  the inner eye corners. See `web/src/platform/mediapipe/geometry.ts`.
- **`eyeWide*` and `mouthFrown*` are weak** (their 99th percentile is ~0.2 and ~0.4).
  Each gets a small range plus a geometric partner (eye aperture; lip-corner height
  relative to the lip midline).
- **Resting values differ hugely between people.** `browDown` at rest ranges from
  0 to 0.55 across neutral faces (eyebrow anatomy), `eyeSquint` from 0.15 to 0.69.
  A fixed threshold turns resting faces into "anger". Each signal therefore has a
  measured **between-person spread** that sets a dead-zone. The dead-zone is wide
  on a new face, narrows as the adaptive baseline learns the person, and is small
  after calibration.

MediaPipe also reads the crying grimace as `mouthSmile` ≈ 0.8. Landmark geometry
disagrees (the lip corners do not rise relative to the lip midline), so AU12
blends both. A raised chin (AU17), which is present when crying and absent when
laughing, argues against happiness.

ARKit on the iPhone's TrueDepth camera does not have these gaps: all 52
blendshapes are depth-backed and active, so the iOS app maps them directly.

## 2. Rest values and ranges come from data

For every MediaPipe measurement the model stores
(`model/emotion-model.json → platforms.mediapipe.measurements`):

- `rest`: the median over neutral faces,
- `spread`: the between-person spread at rest (P90−P50 for one-sided signals, half of P90−P10 for two-sided ones),
- AU recipe ranges (`r`): roughly the 95th percentile of the change from a person's own neutral photo to their expressive photos.

## 3. Photo benchmark (uncalibrated)

**Data:** a stratified sample of 2,110 detectable faces from the crowd-labelled
[muxspace/facial_expressions](https://github.com/muxspace/facial_expressions)
set (in-the-wild photos, 8 labels). It was used locally for measurement only and is
not redistributed. The labels are noisy. "Disgust" is mostly ambiguous film stills
and "anger" is mostly open-mouthed shouting. There are only 18 fear and 9 contempt
images.

**Setting:** single photos, no calibration, no temporal smoothing. This is the
hardest case for the app, which normally calibrates and uses video.

Primary label (rows: true label, columns: predicted):

| true \ predicted | neutral | happy | surprise | sad | anger | disgust | fear | contempt | recall |
|---|---|---|---|---|---|---|---|---|---|
| neutral (696) | **453** | 13 | 41 | 53 | 47 | 34 | 3 | 52 | 65% |
| happiness (392) | 58 | **255** | 7 | 21 | 3 | 30 | 1 | 17 | 65% |
| surprise (363) | 127 | 31 | **148** | 6 | 17 | 11 | 4 | 19 | 41% |
| sadness (238) | 94 | 25 | 13 | **61** | 13 | 21 | 2 | 9 | 26% |
| anger (242) | 79 | 54 | 10 | 15 | **23** | 42 | 0 | 19 | 10% |
| disgust (152) | 81 | 9 | 15 | 23 | 1 | **17** | 1 | 5 | 11% |

Accuracy 45.6%; balanced accuracy over the six well-populated classes 36%.

**Reference ceiling.** To see whether the rules or the features are the limit, a
logistic regression and a gradient-boosted classifier were trained on the same
MediaPipe features with person-grouped 5-fold cross-validation:

| Model | Balanced accuracy (6 classes) |
|---|---|
| Logistic regression on raw blendshapes + geometry | 48% |
| Logistic regression on the app's AU features | 44% |
| Gradient boosting on raw features | 45% |
| **App's rules (no training)** | **36%** |

No trained model could learn this dataset's "disgust" label (≤9% recall). The AU
features keep almost all the information in the raw signals (44% vs 48%). The
rules trade about 8 points of balanced accuracy for being transparent, grounded in
the literature, and explainable action by action. **The weights the classifier
learned agree with FACS:** AU12 and AU6 for happiness; AU25, AU5 and AU1 for
surprise; AU1, AU41 and AU15 for sadness, with AU2 and AU5 *against* it; AU7, AU9
and an open mouth for anger, with AU1 strongly *against* it.

## 4. Video (stateful engine)

A 20-second stock clip (Pexels, via the py-feat test data) of an actress going
from downcast, through crying, to open laughter and a shy smile was run through the
full engine with filtering, adaptive baselines and calibration:

- **Laughter** is read as happiness, with amusement or felt (Duchenne) smile as the complex state.
- **Crying**, after calibration, is read as sadness via the "crying face" variant,
  with pain-like and embarrassment-like complex states. Before calibration,
  MediaPipe's smile reading on the crying mouth wins. This is the clearest
  illustration of why the app asks for a neutral calibration.
- There were no false brief-expression, yawn or drowsiness events. Asymmetric smile
  onsets used to trigger "brief contempt", so contempt is excluded from brief
  expressions. Eyes squeezed shut while crying used to raise PERCLOS, so only
  relaxed closure now counts.

## 5. Automated tests

| Suite | What it checks |
|---|---|
| `web/tests/model.test.ts` | Model compiles for both platforms; every reference, AU and citation resolves; formatting |
| `web/tests/engine.test.ts` | Prototype faces for every primary emotion; compounds; felt vs polite smiles; shame vs pride; PSPI; asymmetry fading; hysteresis; calibration; blinks; PERCLOS; yawns; brief expressions; no false labels on a noisy resting face; face loss |
| `web/tests/geometry.test.ts` | Head pose recovered within 0.5° per axis; geometry invariant to rotation and scale; side naming |
| `web/tests/golden.test.ts` | Engine output matches `model/fixtures/golden.json` |
| `ios/EmotionEngine/Tests` | The Swift engine reproduces the golden outputs frame by frame (tolerance 1e-5) for a synthetic ARKit session and for real MediaPipe measurements |
| `web/tests/e2e` (Playwright) | The production build in Chromium with a fake camera fed by the face video: camera starts, MediaPipe loads, faces tracked in all samples, several labels including happiness, calibration succeeds |

## 6. Known weaknesses

- **Uncalibrated anger and disgust** are weak with MediaPipe: brow lowering is hard
  to tell from low-set brows without a baseline, and the nose wrinkle has to be
  inferred from geometry. Calibrate, or use the native iOS app (TrueDepth).
- **Occlusion** (hands on the face) is not detected and can produce odd readings.
- **Head pose** beyond about ±30° degrades everything; asymmetry features are
  disabled beyond 30° of yaw.
- **Compound and complex states** are inherently ambiguous and are shown as "best
  matches" with confidence.
- **The ARKit parameters** (rest values, ranges) are conservative defaults, not
  measured on a dataset; calibration compensates. A recorded ARKit session would
  let them be tuned the same way as MediaPipe's.
