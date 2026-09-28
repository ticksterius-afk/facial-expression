# Which parts of the face portray emotion — a research summary

This document summarises the science the app is built on: which facial movements
carry which emotional signals, how researchers measure them, what evidence exists
for primary (basic), compound and "complex" emotions, and where the science is
contested. Every expression the app names is defined in
[`model/emotion-model.json`](../model/emotion-model.json) as a configuration of the
movements described here, with its citations.

---

## 1. The short answer

The face signals emotion mainly through **three areas** (Ekman & Friesen, 1975):

1. **Brows and forehead** — raised, lowered, drawn together.
2. **Eyes, lids and the root of the nose** — widened, narrowed, lower lids raised, crow's-feet.
3. **Lower face** — cheeks, nose wrinkling, mouth, lips and chin.

No single area carries every emotion. Experiments that reveal only parts of a
face to observers show a consistent split (Smith et al., 2005; Wegrzyn et al., 2017):

| Emotion | Most diagnostic region | Key movements (FACS Action Units) |
|---|---|---|
| **Happiness** | Mouth (+ eyes for "felt" smiles) | Lip corners up (AU12); cheeks raised with crow's-feet (AU6) |
| **Sadness** | Brows and eyes | Inner brows raised and pulled together (AU1+4); lip corners down (AU15); chin raised (AU17) |
| **Surprise** | Eyes **and** mouth | Brows raised (AU1+2); upper lids raised (AU5); jaw dropped (AU26) |
| **Fear** | Eyes | Brows raised *and* drawn together (AU1+2+4); upper lids raised (AU5); lips stretched sideways (AU20) |
| **Anger** | Central brow region (+ mouth) | Brows lowered and knitted (AU4); hard stare (AU5/AU7); lips pressed (AU23/24) or squared open |
| **Disgust** | Nose and mouth | Nose wrinkled (AU9); upper lip raised (AU10); chin raised (AU17) |
| **Contempt** | One mouth corner | One-sided lip-corner tightening/raise (unilateral AU14/AU12) |

Wegrzyn et al. (2017) describe this as a continuum from **eye-driven** emotions
(sadness, fear) to **mouth-driven** ones (disgust, happiness), with anger relying
on the brows and surprise on both eyes and mouth. Smith et al. (2005) found the
information observers use for the six basic expressions is largely non-overlapping,
as if the expressions evolved to be easy to tell apart.

---

## 2. How faces are measured: FACS

The **Facial Action Coding System** (Ekman & Friesen, 1978; revised by Ekman,
Friesen & Hager, 2002) is the standard anatomical vocabulary for facial movement.
It breaks every visible movement into **Action Units (AUs)**, each produced by one
muscle or a small group, and scores intensity from A (trace) to E (maximum). It
builds on Duchenne de Boulogne's electrical stimulation of individual facial
muscles (1862) and on Darwin's *The Expression of the Emotions in Man and Animals*
(1872).

FACS describes *what the face does*, not what it means. Interpretation is layered on
top, most famously by **EMFACS** (Emotion FACS), which lists which AU combinations
are predicted for each basic emotion, including several acceptable *variants* per
emotion.

### Action Units used by the app

| AU | Name | Muscle(s) | What you see |
|---|---|---|---|
| 1 | Inner brow raiser | Frontalis, pars medialis | Inner brow ends up; oblique brows; central forehead wrinkles |
| 2 | Outer brow raiser | Frontalis, pars lateralis | Outer brow arched up |
| 4 | Brow lowerer | Corrugator supercilii, depressor supercilii, procerus | Brows down and together; vertical furrows between them |
| 5 | Upper lid raiser | Levator palpebrae superioris | White of the eye shows above the iris |
| 6 | Cheek raiser | Orbicularis oculi, pars orbitalis | Cheeks lifted, crow's-feet, bulge under the lower lid |
| 7 | Lid tightener | Orbicularis oculi, pars palpebralis | Lower lid tensed and raised; eye narrows |
| 9 | Nose wrinkler | Levator labii superioris alaeque nasi | Nose wrinkles, nostril wings lift, inner brows dragged down |
| 10 | Upper lip raiser | Levator labii superioris | Upper lip up; nasolabial furrow deepens |
| 12 | Lip corner puller | Zygomaticus major | Smile |
| 14 | Dimpler | Buccinator | Lip corners tightened inward; dimples |
| 15 | Lip corner depressor | Depressor anguli oris | Lip corners down |
| 16 | Lower lip depressor | Depressor labii inferioris | Lower lip pulled down |
| 17 | Chin raiser | Mentalis | Chin pushed up; pout; chin wrinkles |
| 18 | Lip pucker | Incisivii labii | Lips pushed forward |
| 20 | Lip stretcher | Risorius / platysma | Lips stretched sideways and flattened |
| 22 | Lip funneler | Orbicularis oris | Lips funnelled |
| 23 | Lip tightener | Orbicularis oris | Red of the lips narrows |
| 24 | Lip pressor | Orbicularis oris | Lips pressed together |
| 25 / 26 / 27 | Lips part / jaw drop / mouth stretch | Various | Increasingly open mouth |
| 28 | Lip suck | Orbicularis oris | Lips drawn in |
| 41 / 43 | Lid droop / eyes closed | Levator relaxation | Heavy or closed lids |
| 51–56 | Head turn / up / down / tilt | Neck | Head position |
| 61–64 | Eyes left / right / up / down | Extra-ocular | Gaze direction relative to the head |

---

## 3. The primary emotions, region by region

Descriptions follow *Unmasking the Face* (Ekman & Friesen, 1975). AU patterns
follow the EMFACS predictions (Ekman, Friesen & Hager, 2002) and the prototypes
measured by Du, Tao & Martinez (2014) on 230 people photographed while producing
each category.

### Happiness
- **Lower face:** lip corners drawn back and up; the nasolabial fold runs from the
  nose to beyond the lip corners; lips may part and show teeth.
- **Eyes:** cheeks raised; the lower lid bulges and may rise without tension;
  crow's-feet at the outer corners (AU6).
- **EMFACS:** 6+12, or a strong 12 alone. **Du et al.:** 12, 25 (variant 6).
- **Felt vs social smiles.** Duchenne (1862) noticed that the orbicularis oculi
  (AU6) is hard to contract voluntarily, and Ekman, Davidson & Friesen (1990) linked
  AU6+12 ("Duchenne smiles") to felt enjoyment. Later work found Duchenne smiles
  can be posed (Krumhuber & Manstead, 2009). Girard et al. (2021) showed that
  AU6 largely tracks smile *intensity*. The app shows "felt" vs "polite" smile as a
  description of the eye involvement, not a lie detector.

### Sadness
- **Brows:** the inner corners raised and drawn together, giving a triangle of skin
  under the brow (AU1+4) — the "grief muscles". This is the most reliable sign.
- **Eyes:** the inner corner of the upper lid raised; lids may droop; gaze falls.
- **Mouth:** lip corners pulled down (AU15); chin raised (AU17); the lip may tremble.
- **EMFACS:** 1+4+11+15, 1+4+15, 6+15 (each optionally with head and eyes down).
  **Du et al.:** 4, 15 (variants 1, 6, 11, 17).
- **Crying face** is a distinct-looking sadness variant: brows knitted, eyes
  squeezed (AU6/7), nose wrinkled, chin raised, lips stretched. It overlaps with the
  pain face. AU6 intensifies negative as well as positive expressions
  (Messinger et al., 2012).

### Surprise
- **Brows:** raised and curved; long horizontal forehead wrinkles (AU1+2).
- **Eyes:** upper lids raised, lower lids relaxed; white above the iris (AU5).
- **Mouth:** jaw drops; lips and teeth part without tension (AU26/27).
- **EMFACS:** 1+2+5+26 or 27. **Du et al.:** 1, 2, 25, 26 (variant 5).
- Surprise is the briefest emotion and blends quickly into another (delight, fear, dismay).

### Fear
- **Brows:** raised *and* drawn together. Wrinkles appear only in the centre of the
  forehead, and this AU1+2+4 combination is the key difference from surprise.
- **Eyes:** upper lid raised (AU5), lower lid tensed.
- **Mouth:** lips stretched horizontally (AU20); mouth often open.
- **EMFACS:** 1+2+4+5+20 (+25/26/27). **Du et al.:** 1, 4, 20, 25 (variants 2, 5, 26).
- Observers rely heavily on the widened eyes (Smith et al., 2005).

### Anger
- **Brows:** lowered and drawn together; vertical furrows (AU4). The central brow
  region is the most diagnostic part of the face for anger (Smith et al., 2005).
- **Eyes:** a hard stare — upper lid raised (AU5) and/or lower lid tensed (AU7).
- **Mouth:** either pressed tight (AU23/24) or open in a squarish shout (AU10+16+22+25/26).
- **EMFACS:** 4+5+7+23 or 24 variants, and the open-mouth 4+5+7+10+22+23+25/26.
  **Du et al.:** 4, 7, 24 (variants 10, 17, 23).
- Raised inner brows (AU1) argue *against* anger. The classifier we trained on
  real photos learned the same thing on its own (see [VALIDATION.md](VALIDATION.md)).

### Disgust
- **Nose and upper lip:** nose wrinkled (AU9) and/or upper lip raised (AU10) — the
  "keep it out" reflex of rejecting foul food and smells.
- **Lower lip and cheeks:** lower lip raised or pushed down; cheeks up; lines
  under the lower lids; brows lowered.
- **EMFACS:** 9, 9+16+15/26, 9+17, 10, 10+16+25/26, 10+17. **Du et al.:** 9, 10, 17
  (variants 4, 24). Rozin, Lowery & Ebert (1994) found AU9 is linked more to
  offensive smells/tastes and AU10 to a broader range, including moral disgust.

### Contempt
- **Mouth:** one lip corner tightened and slightly raised — a one-sided AU14 (with
  or without AU12). It is the only basic expression that is *asymmetric*.
- First documented as a pan-cultural expression by Ekman & Friesen (1986), with
  further evidence from Matsumoto & Ekman (2004), though recognition is less
  consistent than for the other six.

---

## 4. Compound emotions

Du, Tao & Martinez (2014) showed that people reliably produce and recognise
**compound** expressions that combine the actions of two basic emotions. The
compound's AUs are largely the union of its components' AUs. For example,
"happily surprised" = surprise brows and open mouth **plus** a smile. They
measured 15 compounds; their prototypical AUs (variants in parentheses) are:

| Compound | Meaning | Prototypical AUs (variants) |
|---|---|---|
| Happily surprised | Delight, good news | 1, 2, 12, 25 (5, 26) |
| Happily disgusted | Gross-but-funny | 10, 12, 25 (4, 6, 9) |
| Sadly fearful | Dread | 1, 4, 20, 25 (2, 5, 6, 15) |
| Sadly angry | Hurt anger, bitterness | 4, 15 (6, 7, 11, 17) |
| Sadly surprised | Dismay | 1, 4, 25, 26 (2, 6) |
| Sadly disgusted | Remorse, wounded distaste | 4, 10 (1, 6, 9, 11, 15, 17, 25) |
| Fearfully angry | Defensive anger | 4, 20, 25 (5, 7, 10, 11) |
| Fearfully surprised | Alarm, shock | 1, 2, 5, 20, 25 (4, 10, 11, 26) |
| Fearfully disgusted | Horror | 1, 4, 10, 20, 25 (2, 5, 6, 9, 15, 26) |
| Angrily surprised | Outrage | 4, 25, 26 (5, 7, 10) |
| Angrily disgusted | Loathing | 4, 10, 17 (7, 9, 24) |
| Disgustedly surprised | "Ew, what?!" | 1, 2, 5, 10 (4, 9, 17, 24, 26) |
| Appalled | Anger + disgust, weighted to disgust | 4, 10 (6, 9, 17, 24) |
| Hatred | Anger + disgust, weighted to anger | 4, 10 (7, 9, 17, 24) |
| Awed | Fear + surprise, weighted to surprise | 1, 2, 5, 25 (4, 20, 26) |

Several compounds share their core AUs (appalled vs hatred; sadness vs sadly angry)
and differ only in the variants. The app therefore reports the best match with a
confidence and lets you inspect the actions behind it, rather than claiming certainty.

**Plutchik's wheel.** Plutchik (1980) also names mixtures ("dyads"): love = joy +
trust, remorse = sadness + disgust, awe = fear + surprise, contempt = disgust + anger.
Only some of these have a facial signature. Trust and anticipation have no
established facial configuration, so the app does not claim to read love, optimism
or submission from the face.

---

## 5. Beyond the basic six: social, cognitive and physical states

Many everyday states are *multimodal displays* that combine the face with head
movement, gaze and timing (Keltner & Cordaro, 2017). Cordaro et al. (2018) coded
2,600 displays of 22 emotions across five cultures and found cross-cultural "core
patterns" for many of them. The app includes the ones with identifiable facial,
head and gaze components:

| State | Evidence | Configuration used |
|---|---|---|
| **Amusement** | Keltner (1995); Cordaro et al. (2018) | Smile + cheek raise + open mouth; head back; eyes squeezed |
| **Embarrassment** | Keltner (1995); Keltner & Buswell (1997) | Controlled smile (smile + lip press), gaze averted down/aside, head down or turned away — unfolds over ~5 s |
| **Shame** | Keltner (1995); Tracy & Matsumoto (2008) | Head down (AU54) + gaze down (AU64), no smile |
| **Pride** | Tracy & Robins (2004); Tracy & Matsumoto (2008) | Small smile + head tilted back ~20° (+ expanded posture, not visible to a phone camera) |
| **Felt vs polite smile** | Duchenne (1862); Ekman et al. (1990) | AU12 with or without AU6 (see caveats above) |
| **Confusion** | Rozin & Cohen (2003); D'Mello & Graesser (2010); Grafsgaard et al. (2011) | Brow lowering + lid tightening (AU4+7), often with head tilt or one-sided brow |
| **Concentration** | Rozin & Cohen (2003) | AU4 (+AU7), lips pressed, mouth closed, head still |
| **Worry** | Rozin & Cohen (2003) | Oblique brows (AU1+4) without a sad mouth |
| **Interest** | Reeve (1993) | Slightly widened lids, slightly raised brows, lips parted, head still, few glances away |
| **Skepticism** | Ekman (1979) on brow signals | One eyebrow raised (unilateral AU2) |
| **Boredom** | D'Mello & Graesser (2010); Cordaro et al. (2018) | Drooping lids, head lowered or tilted, gaze wandering, yawns |
| **Pain** | Prkachin (1992); Prkachin & Solomon (2008) | The PSPI actions: AU4 + AU6/7 + AU9/10 + AU43; the app shows the PSPI score (0–16) |
| **Drowsiness** | Wierwille et al. (1994); Dinges et al. (1998) | PERCLOS: the share of the last minute with eyes ≥80% closed (relaxed closure, not squeezing) |
| **Yawn** | Provine (1986) | Mouth stretched wide open for over a second |

Rozin & Cohen (2003) observed people in everyday settings and found that the most
frequent expressions were not the basic six but confusion, concentration and worry,
all built on brow lowering (AU4). This is why the app treats a lone AU4 as
concentration rather than anger.

---

## 6. Time matters: dynamics and brief expressions

- Expressions have an onset, an apex and an offset. Spontaneous expressions tend to
  have smoother onsets and more symmetric timing than posed ones.
- **Micro-expressions** are brief, involuntary flashes of an emotion. Ekman
  described them as lasting 1/25–1/5 s; Yan et al. (2013) place the upper limit
  around 500 ms. A 30–60 fps camera plus a face tracker cannot see the fastest ones,
  so the app logs "brief expressions" of 65–500 ms that rise from, and return to,
  a quiet face. Research does **not** support using them to detect lies.
- **Blinks and eyelid closure** carry information about fatigue (PERCLOS) and
  cognitive load.

---

## 7. Limits and caveats

- **Expressions are not emotions.** Barrett et al. (2019) reviewed the evidence and
  concluded that people do not reliably make the prototypical face when they feel
  an emotion (limited *reliability*). They also found the same face occurs with
  different emotions (limited *specificity*), and that context shapes meaning. The
  app therefore describes **what the face is doing** and names the expression
  category it most resembles. It does not claim to know what you feel.
- **Culture.** Jack et al. (2012) found that East Asian observers' mental
  models of expressions rely more on the eyes and overlap more across categories
  than Western Caucasian observers' models. Cordaro et al. (2018) report a
  universal core with cultural "accents". Display rules (Ekman & Friesen, 1969)
  govern when expressions are shown or masked.
- **Individual faces differ at rest.** Some people's relaxed brows sit low or their
  mouth corners turn down. Without a personal neutral baseline, these read as
  anger or sadness. This is why the app calibrates to *your* neutral face and keeps
  adapting.
- **Posed vs spontaneous.** Most prototypes come from posed or elicited
  expressions; spontaneous ones are subtler and more varied.
- **Ethics.** Facial expression analysis should not be used for hiring, policing,
  lie detection or diagnosis. This app runs entirely on-device, for self-exploration
  and learning.

---

## 8. From research to software

| Finding | Design decision |
|---|---|
| Emotions are configurations of AUs (FACS, EMFACS, Du et al.) | Tracking signals → **AU intensities** → expression **prototypes** (soft AND over AU "slots") |
| EMFACS lists several variants per emotion | Prototypes can have **variants** (e.g. sadness: grief brows / crying face) and slots that accept any of several AUs |
| Some actions argue against an emotion (e.g. AU1 against anger) | **Inhibiting** actions lower a score |
| Compounds need both components' actions | Compound prototypes use a **stricter** soft AND |
| Resting faces differ (anatomy) | **Calibration** to your neutral face + adaptive baselines + a dead-zone sized by measured between-person variation |
| Regions carry different emotions (Smith et al.; Wegrzyn et al.) | **Region heat-map** overlay and a "why" panel listing the actions behind each label |
| Contempt is one-sided | Explicit **asymmetry** features (AUnU), faded out in profile views |
| Shame/pride/embarrassment involve head and gaze | Head pose (AU51–56) and **camera-relative gaze** features |
| Dynamics matter | Brief-expression detector, blink rate, PERCLOS, yawns, label hysteresis |
| Expressions ≠ feelings (Barrett et al.) | Wording ("expression", confidence, "best match") and the in-app caveats |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the maths and
[VALIDATION.md](VALIDATION.md) for how the model was tested on real faces.

---

## References

- Barrett, L. F., Adolphs, R., Marsella, S., Martinez, A. M., & Pollak, S. D. (2019). Emotional expressions reconsidered: Challenges to inferring emotion from human facial movements. *Psychological Science in the Public Interest, 20*(1), 1–68.
- Cordaro, D. T., Sun, R., Keltner, D., Kamble, S., Huddar, N., & McNeil, G. (2018). Universals and cultural variations in 22 emotional expressions across five cultures. *Emotion, 18*(1), 75–93.
- Darwin, C. (1872). *The Expression of the Emotions in Man and Animals.* John Murray.
- D'Mello, S. K., & Graesser, A. C. (2010). Multimodal semi-automated affect detection from conversational cues, gross body language, and facial features. *User Modeling and User-Adapted Interaction, 20*, 147–187.
- Dinges, D. F., Mallis, M. M., Maislin, G., & Powell, J. W. (1998). *Evaluation of techniques for ocular measurement as an index of fatigue and the basis for alertness management* (DOT HS 808 762). NHTSA.
- Du, S., Tao, Y., & Martinez, A. M. (2014). Compound facial expressions of emotion. *PNAS, 111*(15), E1454–E1462.
- Duchenne de Boulogne, G.-B. (1862/1990). *The Mechanism of Human Facial Expression.* Cambridge University Press.
- Ekman, P. (1979). About brows: Emotional and conversational signals. In M. von Cranach et al. (Eds.), *Human Ethology* (pp. 169–202). Cambridge University Press.
- Ekman, P., Davidson, R. J., & Friesen, W. V. (1990). The Duchenne smile: Emotional expression and brain physiology II. *Journal of Personality and Social Psychology, 58*, 342–353.
- Ekman, P., & Friesen, W. V. (1969). The repertoire of nonverbal behavior: Categories, origins, usage, and coding. *Semiotica, 1*, 49–98.
- Ekman, P., & Friesen, W. V. (1975). *Unmasking the Face: A Guide to Recognizing Emotions from Facial Clues.* Prentice-Hall.
- Ekman, P., & Friesen, W. V. (1978). *Facial Action Coding System.* Consulting Psychologists Press.
- Ekman, P., & Friesen, W. V. (1986). A new pan-cultural facial expression of emotion. *Motivation and Emotion, 10*, 159–168.
- Ekman, P., Friesen, W. V., & Hager, J. C. (2002). *Facial Action Coding System: The Manual and Investigator's Guide.* Research Nexus.
- Girard, J. M., Cohn, J. F., Yin, L., & Morency, L.-P. (2021). Reconsidering the Duchenne smile: Formalizing and testing hypotheses about eye constriction and positive emotion. *Affective Science, 2*, 32–47.
- Grafsgaard, J. F., Boyer, K. E., & Lester, J. C. (2011). Predicting facial indicators of confusion with hidden Markov models. *Affective Computing and Intelligent Interaction.*
- Jack, R. E., Garrod, O. G. B., Yu, H., Caldara, R., & Schyns, P. G. (2012). Facial expressions of emotion are not culturally universal. *PNAS, 109*, 7241–7244.
- Keltner, D. (1995). Signs of appeasement: Evidence for the distinct displays of embarrassment, amusement, and shame. *Journal of Personality and Social Psychology, 68*, 441–454.
- Keltner, D., & Buswell, B. N. (1997). Embarrassment: Its distinct form and appeasement functions. *Psychological Bulletin, 122*, 250–270.
- Keltner, D., & Cordaro, D. T. (2017). Understanding multimodal emotional expressions. In J.-M. Fernández-Dols & J. A. Russell (Eds.), *The Science of Facial Expression.* Oxford University Press.
- Krumhuber, E. G., & Manstead, A. S. R. (2009). Can Duchenne smiles be feigned? New evidence on felt and false smiles. *Emotion, 9*, 807–820.
- Matsumoto, D., & Ekman, P. (2004). The relationship among expressions, labels, and descriptions of contempt. *Journal of Personality and Social Psychology, 87*, 529–540.
- Messinger, D. S., Mattson, W. I., Mahoor, M. H., & Cohn, J. F. (2012). The eyes have it: Making positive expressions more positive and negative expressions more negative. *Emotion, 12*(3), 430–436.
- Plutchik, R. (1980). *Emotion: A Psychoevolutionary Synthesis.* Harper & Row.
- Prkachin, K. M. (1992). The consistency of facial expressions of pain. *Pain, 51*, 297–306.
- Prkachin, K. M., & Solomon, P. E. (2008). The structure, reliability and validity of pain expression. *Pain, 139*, 267–274.
- Provine, R. R. (1986). Yawning as a stereotyped action pattern and releasing stimulus. *Ethology, 72*, 109–122.
- Reeve, J. (1993). The face of interest. *Motivation and Emotion, 17*, 353–375.
- Rozin, P., & Cohen, A. B. (2003). High frequency of facial expressions corresponding to confusion, concentration, and worry in an analysis of naturally occurring facial expressions of Americans. *Emotion, 3*, 68–75.
- Rozin, P., Lowery, L., & Ebert, R. (1994). Varieties of disgust faces and the structure of disgust. *Journal of Personality and Social Psychology, 66*, 870–881.
- Smith, M. L., Cottrell, G. W., Gosselin, F., & Schyns, P. G. (2005). Transmitting and decoding facial expressions. *Psychological Science, 16*, 184–189.
- Tracy, J. L., & Matsumoto, D. (2008). The spontaneous expression of pride and shame: Evidence for biologically innate nonverbal displays. *PNAS, 105*, 11655–11660.
- Tracy, J. L., & Robins, R. W. (2004). Show your pride: Evidence for a discrete emotion expression. *Psychological Science, 15*, 194–197.
- Wegrzyn, M., Vogt, M., Kireclioglu, B., Schneider, J., & Kissler, J. (2017). Mapping the emotional face: How individual face parts contribute to successful emotion recognition. *PLoS ONE, 12*(5), e0177239.
- Wierwille, W. W., Ellsworth, L. A., Wreggit, S. S., Fairbanks, R. J., & Kirn, C. L. (1994). *Research on vehicle-based driver status/performance monitoring* (DOT HS 808 247). NHTSA.
- Yan, W.-J., Wu, Q., Liang, J., Chen, Y.-H., & Fu, X. (2013). How fast are the leaked facial expressions: The duration of micro-expressions. *Journal of Nonverbal Behavior, 37*, 217–230.
