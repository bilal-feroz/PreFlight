"use client";

import { useEffect, type SyntheticEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PreviewMatch } from "@/lib/previews";
import { Button } from "@/components/ui/Button";

export function ConceptPreviewButton({ onClick, exact = true }: { onClick(): void; exact?: boolean }) {
  return (
    <div className="mt-4 flex flex-col items-start gap-1.5">
      <Button variant="outline" onClick={onClick}>
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
          <path d="M4 2.5v11l9-5.5-9-5.5z" />
        </svg>
        Get Replit visual example
      </Button>
      <span className="text-[11px] text-cluster/40">
        {exact
          ? "Animated concept preview of the rerouted idea, made with Replit."
          : "Example animated concept preview for an oud reroute, made with Replit."}
      </span>
    </div>
  );
}

/** Autoplay with sound when allowed; otherwise start muted (controls stay available). */
function ensurePlaying(e: SyntheticEvent<HTMLVideoElement>) {
  const v = e.currentTarget;
  if (!v.paused) return;
  v.play().catch(() => {
    v.muted = true;
    void v.play().catch(() => undefined);
  });
}

export function ConceptPreviewModal({
  preview,
  open,
  onClose,
  nonce = 0,
}: {
  preview: PreviewMatch | undefined;
  open: boolean;
  onClose(): void;
  /** changes on every open so each open gets a fresh player that starts from 0:00 */
  nonce?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && preview && (
        <motion.div
          key={`concept-preview-${nonce}`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Replit visual example"
        >
          <motion.div
            className="glass relative flex max-h-[94vh] w-[min(94vw,calc(70vh*0.5625+1.5rem))] flex-col gap-3 rounded-2xl border border-gold/25 p-3 shadow-[0_0_60px_-20px_rgb(255_181_71/0.5)]"
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6 px-1 pt-1">
              <div>
                <div className="label-caps text-[10px] text-gold">Replit visual example</div>
                <div className="mt-1 font-serif text-lg leading-tight text-cluster">{preview.title}</div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-full px-2 text-xl leading-none text-cluster/60 transition hover:text-gold focus-visible:outline focus-visible:outline-gold"
              >
                ×
              </button>
            </div>
            <video
              src={preview.src}
              autoPlay
              controls
              playsInline
              preload="auto"
              onCanPlay={ensurePlaying}
              className="aspect-[9/16] max-h-[70vh] w-full rounded-xl bg-black object-cover"
            />
            <p className="px-1 pb-1 text-[11px] text-cluster/45">
              {preview.exact
                ? "Concept preview made with Replit Animation for this rerouted idea. Illustrative, not real footage."
                : "Example concept preview made with Replit Animation for an Arabic-first oud reroute. Illustrative, not real footage."}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
