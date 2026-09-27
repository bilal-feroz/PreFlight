/**
 * Concept preview videos made with Replit Animation for specific rerouted ideas.
 * A preview is only offered for the exact run + territory it was made for.
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

export function previewFor(runId: string | undefined, territoryId: string | null | undefined): ConceptPreview | undefined {
  if (!runId || !territoryId) return undefined;
  return CONCEPT_PREVIEWS.find((p) => p.runId === runId && p.territoryId === territoryId);
}
