"use client";

import type { ReactNode } from "react";
import { cx } from "./cx";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex select-none items-center font-mono text-[13px] font-medium tracking-[0.26em] text-cluster", className)}>
      <span className="sr-only">Preflight</span>
      <span aria-hidden>
        PRE
        <span className="text-gold [text-shadow:0_0_14px_rgb(255_181_71/0.65)]">{"//"}</span>
        FLIGHT
      </span>
    </span>
  );
}

export type HeaderProps = {
  onHowItWorks?(): void;
  right?: ReactNode;
  className?: string;
};

/** Transparent to pointer events except its own controls, so it can float over a canvas. */
export function Header({ onHowItWorks, right, className }: HeaderProps) {
  return (
    <header
      className={cx(
        "pointer-events-none relative z-30 flex h-16 w-full items-center justify-between gap-4 px-5 sm:px-8",
        className,
      )}
    >
      <div className="pointer-events-auto">
        <Wordmark />
      </div>
      <div className="pointer-events-auto flex items-center gap-4 sm:gap-6">
        {right}
        {onHowItWorks && (
          <button
            type="button"
            onClick={onHowItWorks}
            className="label-caps rounded-sm py-1 text-cluster/60 transition-colors duration-300 hover:text-gold"
          >
            How it works
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
