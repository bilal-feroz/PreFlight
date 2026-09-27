"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Header } from "@/components/ui/Header";
import { Button, Spinner } from "@/components/ui/Button";
import { EASE, rise, stagger } from "@/components/ui/motion";
import { GoldDust } from "./GoldDust";

export type LandingProps = {
  onRun(brief: string): void;
  onLoadDemo(): void;
  demoBrief: string;
  busy?: boolean;
  error?: string | null;
  /** optional: shows the "How it works" button in the header */
  onHowItWorks?(): void;
  /** optional: prefill the textarea (e.g. when coming back from results) */
  initialBrief?: string;
};

const UNDERSTANDS = ["Speech", "Visuals", "Hooks", "Narrative", "Formats", "Timing", "Market"];

export function Landing({
  onRun,
  onLoadDemo,
  demoBrief,
  busy = false,
  error = null,
  onHowItWorks,
  initialBrief = "",
}: LandingProps) {
  const [brief, setBrief] = useState(initialBrief);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const trimmed = brief.trim();
  const canRun = trimmed.length > 0 && !busy;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (canRun) onRun(trimmed);
  }

  function loadDemo() {
    setBrief(demoBrief);
    onLoadDemo();
    areaRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-void">
      <GoldDust className="absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(70%_50%_at_50%_-8%,rgb(255_181_71/0.11),transparent_70%),radial-gradient(60%_40%_at_50%_112%,rgb(200_132_31/0.12),transparent_72%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[14%] left-1/2 -z-10 h-px w-[min(900px,80vw)] -translate-x-1/2 bg-linear-to-r from-transparent via-gold/35 to-transparent"
      />

      <Header onHowItWorks={onHowItWorks} />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-20 pt-4 sm:px-8 sm:pb-24">
        <motion.div variants={stagger(0.12, 0.1)} initial="hidden" animate="show">
          <motion.h1
            variants={rise}
            className="text-balance font-serif text-[2.6rem] leading-[1.02] tracking-[-0.01em] text-cluster sm:text-6xl md:text-[5.1rem]"
          >
            Before you shoot, check if{" "}
            <em className="text-gold-light [text-shadow:0_0_32px_rgb(255_181_71/0.35)]">culture</em> got there first.
          </motion.h1>

          <motion.p variants={rise} className="mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-cluster/65 sm:text-base">
            Compare your campaign idea against real social video. See where it&apos;s crowded, whether it&apos;s early or
            late, and where there&apos;s still room.
          </motion.p>

          <motion.form variants={rise} onSubmit={submit} className="mt-10">
            <label htmlFor={fieldId} className="sr-only">
              Campaign idea
            </label>
            <div className="glass rounded-2xl p-1.5 transition-[border-color,box-shadow] duration-300 focus-within:border-gold/45 focus-within:shadow-[0_0_60px_-24px_rgb(255_181_71/0.55),inset_0_1px_0_0_rgb(255_210_122/0.1)]">
              <textarea
                id={fieldId}
                ref={areaRef}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onKeyDown={onKeyDown}
                rows={5}
                spellCheck
                placeholder="Describe your campaign idea: the opening, the format, the story, the product moment."
                className="block min-h-[132px] w-full resize-y rounded-xl bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-cluster placeholder:text-cluster/30 focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3 px-2 pb-1.5 pt-1">
                <span className="hidden font-mono text-[11px] text-cluster/30 sm:block">Ctrl / &#8984; + Enter</span>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button variant="ghost" onClick={loadDemo} disabled={busy} className="flex-1 sm:flex-none">
                    Try an example
                  </Button>
                  <Button variant="primary" type="submit" disabled={!canRun} className="flex-1 sm:flex-none">
                    {busy ? (
                      <>
                        <Spinner /> Checking
                      </>
                    ) : (
                      "Check my idea"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.form>

          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="mt-4 text-[13.5px] text-crowded-soft"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.p variants={rise} className="label-caps mt-8 leading-relaxed text-cluster/35">
            <span className="text-gold/65">Understands:</span>{" "}
            {UNDERSTANDS.map((u, i) => (
              <span key={u}>
                {i > 0 && <span className="text-gold/40"> · </span>}
                <span className="whitespace-nowrap">{u}</span>
              </span>
            ))}
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}

export default Landing;
