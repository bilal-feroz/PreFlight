import type { ReactNode } from "react";
import { cx } from "./cx";

export type SectionTitleProps = {
  children: ReactNode;
  right?: ReactNode;
  id?: string;
  className?: string;
};

/** Gold small-caps title followed by a thin fading gold rule. */
export function SectionTitle({ children, right, id, className }: SectionTitleProps) {
  return (
    <div className={cx("mb-4 flex items-center gap-3", className)}>
      <h2 id={id} className="label-caps shrink-0 text-gold [text-shadow:0_0_16px_rgb(255_181_71/0.35)]">
        {children}
      </h2>
      <span aria-hidden className="h-px min-w-6 flex-1 bg-linear-to-r from-gold/40 via-gold/10 to-transparent" />
      {right}
    </div>
  );
}
