/**
 * Cloud Functions entry point — the trusted server layer.
 * Each export is deployed as an individual function.
 */
import "./admin"; // ensure Admin SDK initializes first

export { fredTurn } from "./fred";
export { generateVocabulary } from "./vocabulary";
export { syncPublicProfile, awardGamePoints, deleteMyAccount } from "./social";
