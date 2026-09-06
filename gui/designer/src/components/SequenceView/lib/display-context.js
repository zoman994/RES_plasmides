import { runPredictors } from "../../../predicted-detection.js";
import { buildFeatureMap, mergeWithPredicted } from "./feature-map.js";

/**
 * Build the exact sequence + feature set painted by Sequence Viewer.
 * A host may pass an already-computed display feature array to keep two
 * simultaneous viewers on one predictor result instead of running detectors
 * twice. The sequence still comes from the canonical fragment adapter.
 */
export function buildSequenceDisplayContext(
  fragments,
  predictionsSettings = {},
  displayFeatures = null,
) {
  const { fullSeq, features: confidentFeatures } = buildFeatureMap(fragments);
  if (Array.isArray(displayFeatures)) return { fullSeq, features: displayFeatures };
  const predictedRegions = runPredictors(
    fullSeq,
    predictionsSettings,
    confidentFeatures,
  );
  return {
    fullSeq,
    features: mergeWithPredicted(confidentFeatures, predictedRegions),
  };
}
