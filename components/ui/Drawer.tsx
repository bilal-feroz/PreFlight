"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cx } from "./cx";
import { EASE } from "./motion";

export type DrawerProps = {
  open: boolean;
  onClose(): void;
  /** accessible name, also shown as the small-caps title */
  label: string;
  children: ReactNode;
  size?: "md" | "lg";
};

const noopSubscribe = () => () => {};

/** Right-side glass drawer (full-width sheet on phones), portaled to <body>. Esc and backdrop click close it. */
export function Drawer({ open, onClose, label, children, size = "md" }: DrawerProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="drawer" className="fixed inset-0 z-50" initial="hidden" animate="show" exit="hidden">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
            transition={{ duration: 0.35 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={cx(
              "glass absolute inset-y-0 right-0 flex w-full flex-col rounded-none border-y-0! border-r-0! sm:rounded-l-2xl",
              size === "lg" ? "sm:w-[min(600px,94vw)]" : "sm:w-[min(480px,92vw)]",
            )}
            style={{ backgroundColor: "rgb(9 8 6 / 0.94)" }}
            variants={{ hidden: { x: "100%" }, show: { x: 0 } }}
            transition={{ type: "tween", duration: 0.5, ease: EASE }}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gold/10 px-5 sm:px-6">
              <span className="label-caps text-gold">{label}</span>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full text-cluster/60 transition-colors hover:bg-white/[0.05] hover:text-gold"
              >
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-12 pt-5 sm:px-6">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
