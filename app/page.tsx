"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Airspace from "@/components/airspace/Airspace";
import { Landing } from "@/components/landing/Landing";
import { Processing } from "@/components/processing/Processing";
import { Collisions } from "@/components/results/Collisions";
import { ConceptPreviewButton, ConceptPreviewModal } from "@/components/results/ConceptPreview";
import { DnaChips } from "@/components/results/DnaChips";
import { EvidenceDrawer } from "@/components/results/EvidenceDrawer";
import { HowItWorks } from "@/components/results/HowItWorks";
import { MarketToggle } from "@/components/results/MarketToggle";
import { OpenTerritory } from "@/components/results/OpenTerritory";
import { PositionCard } from "@/components/results/PositionCard";
import { Reroute } from "@/components/results/Reroute";
import { ResultsLayout } from "@/components/results/ResultsLayout";
import { Header } from "@/components/ui/Header";
import { pacedEmitter, streamEvents } from "@/lib/client-stream";
import { DEMO_BRIEF } from "@/lib/demo";
import { previewFor } from "@/lib/previews";
import type { MarketKey, PreflightResult, ProgressEvent, RerouteResult, VideoCard } from "@/lib/result-types";
import type { CreativeDNA } from "@/lib/types";

type Phase = "landing" | "processing" | "results";
type RerouteState = {
  status: "idle" | "running" | "done" | "error";
  events: ProgressEvent[];
  result: RerouteResult | null;
  territoryId: string | null;
  error: string | null;
};

const IDLE_REROUTE: RerouteState = { status: "idle", events: [], result: null, territoryId: null, error: null };

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [brief, setBrief] = useState("");
  const [dna, setDna] = useState<CreativeDNA | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketKey>("global");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [reroute, setReroute] = useState<RerouteState>(IDLE_REROUTE);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const abortRef = useRef<AbortController | null>(null);
  const rerouteRef = useRef<HTMLDivElement | null>(null);

  const run = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 12) {
      setError("Describe the idea in a sentence or two.");
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBrief(trimmed);
    setDna(null);
    setEvents([]);
    setResult(null);
    setError(null);
    setReroute(IDLE_REROUTE);
    setMarket("global");
    setSelectedId(null);
    setPhase("processing");

    let failed: string | null = null;
    let final: PreflightResult | null = null;
    await new Promise<void>((resolve) => {
      const paced = pacedEmitter((e) => {
        if (e.type === "dna") setDna(e.dna);
        if (e.type === "result") {
          final = e.result;
          resolve();
          return;
        }
        if (e.type === "error") {
          failed = e.message;
          resolve();
          return;
        }
        setEvents((prev) => [...prev, e]);
      });
      streamEvents("/api/preflight", { brief: trimmed }, (e) => paced.push(e), ac.signal)
        .then(() => {
          // stream ended; resolve happens when the paced queue reaches result/error
          setTimeout(() => {
            if (!final && !failed) {
              failed = "The connection closed before the analysis finished.";
              resolve();
            }
          }, 8000);
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          failed = e instanceof Error ? e.message : "Request failed";
          paced.cancel();
          resolve();
        });
    });
    if (ac.signal.aborted) return;
    if (failed || !final) {
      setError(failed ?? "Something went wrong.");
      setPhase("landing");
      return;
    }
    setResult(final);
    setPhase("results");
    window.scrollTo({ top: 0 });
  }, []);

  const startReroute = useCallback(
    async (territoryId: string) => {
      if (!result) return;
      setReroute({ status: "running", events: [], result: null, territoryId, error: null });
      setPreviewOpen(false);
      requestAnimationFrame(() => rerouteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      let done = false;
      const paced = pacedEmitter((e) => {
        if (e.type === "reroute") {
          done = true;
          setReroute((s) => ({ ...s, status: "done", result: e.result }));
          setMarket("global");
          return;
        }
        if (e.type === "error") {
          done = true;
          setReroute((s) => ({ ...s, status: "error", error: e.message }));
          return;
        }
        setReroute((s) => ({ ...s, events: [...s.events, e] }));
      }, 360);
      try {
        await streamEvents("/api/reroute", { runId: result.runId, territoryId }, (e) => paced.push(e));
        setTimeout(() => {
          if (!done) setReroute((s) => (s.status === "running" ? { ...s, status: "error", error: "The connection closed early." } : s));
        }, 8000);
      } catch (e) {
        paced.cancel();
        setReroute((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : "Reroute failed" }));
      }
    },
    [result],
  );

  const allVideos = useMemo<Record<string, VideoCard>>(
    () => ({ ...(reroute.result?.videos ?? {}), ...(result?.videos ?? {}) }),
    [result, reroute.result],
  );

  const galaxy = reroute.result?.airspace ?? result?.airspace ?? null;

  const conceptPreview = reroute.status === "done" ? previewFor(reroute.result?.runId, reroute.territoryId) : undefined;

  const evidenceIds = useMemo(() => {
    if (!reroute.result || !result) return [];
    const territory = result.territories.find((t) => t.id === reroute.territoryId);
    const ids = [...reroute.result.collisionsAfter.map((c) => c.id), ...(territory?.evidence ?? [])];
    const inGalaxy = new Set(reroute.result.airspace.nodes.map((n) => n.id));
    return [...new Set(ids)].filter((id) => inGalaxy.has(id)).slice(0, 6);
  }, [reroute.result, reroute.territoryId, result]);

  const selectedCollision = useMemo(() => {
    if (!selectedId || !result) return null;
    return (
      reroute.result?.collisionsAfter.find((c) => c.id === selectedId) ??
      result.collisions.find((c) => c.id === selectedId) ??
      null
    );
  }, [selectedId, result, reroute.result]);

  const reset = () => {
    abortRef.current?.abort();
    setPhase("landing");
    setResult(null);
    setReroute(IDLE_REROUTE);
    setError(null);
  };

  return (
    <main className="relative min-h-dvh bg-[#050505] text-[#DDE6F2]">
      <AnimatePresence mode="wait">
        {phase === "landing" && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <Landing onRun={run} onLoadDemo={() => run(DEMO_BRIEF)} demoBrief={DEMO_BRIEF} error={error} initialBrief={brief} onHowItWorks={() => setHowOpen(true)} />
          </motion.div>
        )}

        {phase === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <Processing brief={brief} dna={dna} events={events} onHowItWorks={() => setHowOpen(true)} />
          </motion.div>
        )}

        {phase === "results" && result && galaxy && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
            <ResultsLayout
              header={
                <Header
                  onHowItWorks={() => setHowOpen(true)}
                  right={
                    <button
                      onClick={reset}
                      className="rounded-full border border-[#FFB547]/25 px-3 py-1 text-xs tracking-wide text-[#DDE6F2]/80 transition hover:border-[#FFB547]/60 hover:text-[#FFD27A] focus-visible:outline focus-visible:outline-[#FFB547]"
                    >
                      New idea
                    </button>
                  }
                />
              }
              canvas={
                <Airspace
                  airspace={galaxy}
                  videos={allVideos}
                  market={market}
                  highlightId={hoverId}
                  evidenceIds={evidenceIds}
                  onSelect={setSelectedId}
                />
              }
              canvasOverlay={
                <MarketToggle
                  value={market}
                  onChange={setMarket}
                  counts={{
                    global: (reroute.result?.after ?? result.position).global.n,
                    arabic: (reroute.result?.after ?? result.position).arabic.n,
                    uae: (reroute.result?.after ?? result.position).uae.n,
                  }}
                />
              }
            >
              <DnaChips dna={result.dna} />
              <PositionCard position={result.position} market={market} sampleN={result.sample.n} />
              <Collisions collisions={result.collisions} videos={result.videos} onHover={setHoverId} onOpen={setSelectedId} />
              <OpenTerritory
                territories={result.territories}
                videos={allVideos}
                onReroute={startReroute}
                busy={reroute.status === "running"}
                activeId={reroute.territoryId}
              />
              <div ref={rerouteRef} className="scroll-mt-6">
                <Reroute
                  status={reroute.status}
                  events={reroute.events}
                  result={reroute.result}
                  market={market}
                  error={reroute.error}
                  onPreflightAgain={reroute.result ? () => run(reroute.result!.brief) : undefined}
                />
                {conceptPreview && (
                  <ConceptPreviewButton
                    exact={conceptPreview.exact}
                    onClick={() => {
                      setPreviewNonce((n) => n + 1);
                      setPreviewOpen(true);
                    }}
                  />
                )}
              </div>
            </ResultsLayout>
          </motion.div>
        )}
      </AnimatePresence>

      <EvidenceDrawer
        video={selectedId ? (allVideos[selectedId] ?? null) : null}
        collision={selectedCollision}
        onClose={() => setSelectedId(null)}
      />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
      <ConceptPreviewModal
        preview={conceptPreview}
        open={previewOpen && Boolean(conceptPreview)}
        onClose={closePreview}
        nonce={previewNonce}
      />
    </main>
  );
}
