import modelJson from "../../../model/emotion-model.json";
import type { EmotionModel } from "../engine/index.ts";

/** The shared expression model (also embedded in the iOS app). */
export const MODEL = modelJson as unknown as EmotionModel;
