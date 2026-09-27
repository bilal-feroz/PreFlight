/**
 * Concept preview videos made with Replit Animation.
 * A preview is offered after a reroute of the idea it was made for; `exact`
 * says whether the reroute is the one the video depicts (captions differ).
 */
export type ConceptPreview = {
  runId: string;
  territoryId: string;
  src: string;
  title: string;
};

export const CONCEPT_PREVIEWS: ConceptPreview[] = [
  {
    // "Luxury oud launch in Dubai…" rerouted Arabic-first (Dubai souk street interview)
    runId: "7775ce87dd279793",
    territoryId: "localize-arabic",
    src: "/previews/oud-souk-concept.mp4",
    title: "Arabic-first oud street interview in a Dubai souk",
  },
];

export type PreviewMatch = ConceptPreview & { exact: boolean };

export function previewFor(runId: string | undefined, territoryId: string | null | undefined): PreviewMatch | undefined {
  if (!runId) return undefined;
  const exact = CONCEPT_PREVIEWS.find((p) => p.runId === runId && p.territoryId === territoryId);
  if (exact) return { ...exact, exact: true };
  const sameIdea = CONCEPT_PREVIEWS.find((p) => p.runId === runId);
  return sameIdea ? { ...sameIdea, exact: false } : undefined;
}
