import type { Video } from "./types";

/**
 * Which Oriane fields exist (see docs/oriane-fields.md). A feature whose field
 * is missing is hidden in the UI, never faked.
 *
 * API_FEATURES is what the API schema can return. detectFeatures() checks what
 * a given pool of videos actually contains, because a field can exist in the
 * schema and still be empty for most results (e.g. tagged location).
 */
export type FeatureFlags = {
  hasDates: boolean;
  hasLanguage: boolean;
  hasLocation: boolean;
  hasThumbnails: boolean;
  hasTranscript: boolean;
  hasVisualLabels: boolean;
  hasFollowers: boolean;
};

export const API_FEATURES: FeatureFlags = {
  hasDates: true, // publishedAt
  hasLanguage: true, // transcriptLanguage, captionLanguage
  hasLocation: true, // locationCompleteAddress (tagged), profileLocationCompleteAddress
  hasThumbnails: true, // thumbnailMediaUrl
  hasTranscript: true, // transcript + timestamped transcriptChunks
  hasVisualLabels: false, // no tags/labels; frames are image URLs with a similarity score only
  hasFollowers: true, // profileFollowersCount
};

/** Minimum share of the pool that must carry a field before we build on it. */
const MIN_COVERAGE: Record<keyof FeatureFlags, number> = {
  hasDates: 0.5,
  hasLanguage: 0.3,
  hasLocation: 0.05,
  hasThumbnails: 0.3,
  hasTranscript: 0.3,
  hasVisualLabels: 0.3,
  hasFollowers: 0.5,
};

export type FeatureCoverage = Record<keyof FeatureFlags, number>;

export function featureCoverage(videos: Video[]): FeatureCoverage {
  const total = Math.max(1, videos.length);
  const share = (pred: (v: Video) => boolean) => videos.filter(pred).length / total;
  return {
    hasDates: share((v) => Boolean(v.publishedAt)),
    hasLanguage: share((v) => Boolean(v.language)),
    hasLocation: share((v) => Boolean(v.locationHints?.length)),
    hasThumbnails: share((v) => Boolean(v.thumbnailUrl)),
    hasTranscript: share((v) => Boolean(v.transcript)),
    hasVisualLabels: share((v) => Boolean(v.visualLabels?.length)),
    hasFollowers: share((v) => typeof v.followers === "number" && v.followers > 0),
  };
}

export function detectFeatures(videos: Video[]): FeatureFlags & { coverage: FeatureCoverage } {
  const coverage = featureCoverage(videos);
  const flags = Object.fromEntries(
    (Object.keys(API_FEATURES) as (keyof FeatureFlags)[]).map((k) => [
      k,
      API_FEATURES[k] && coverage[k] >= MIN_COVERAGE[k],
    ]),
  ) as FeatureFlags;
  return { ...flags, coverage };
}
