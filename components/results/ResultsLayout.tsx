import type { ReactNode } from "react";

export type ResultsLayoutProps = {
  /** full-bleed canvas (Creative Airspace); it fills its slot absolutely */
  canvas: ReactNode;
  /** floats over the canvas, top-left (e.g. MarketToggle) */
  canvasOverlay?: ReactNode;
  /** right-column sections */
  children: ReactNode;
  /** fixed across the top, over both columns (use <Header />) */
  header?: ReactNode;
};

/**
 * Desktop: left 60% sticky full-height canvas, right 40% scrolling column.
 * Mobile: canvas on top (~55vh), column below.
 */
export function ResultsLayout({ canvas, canvasOverlay, children, header }: ResultsLayoutProps) {
  return (
    <div className="relative min-h-dvh bg-void">
      {header && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 bg-linear-to-b from-void/95 via-void/60 to-transparent pb-4">
          {header}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="relative h-[55vh] min-h-[320px] w-full overflow-hidden lg:sticky lg:top-0 lg:h-dvh lg:min-h-0">
          <div className="absolute inset-0">{canvas}</div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-void to-transparent lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-24 lg:bg-linear-to-l"
          />
          {canvasOverlay && (
            <div className="pointer-events-none absolute left-0 top-0 z-10 flex max-w-full flex-col items-start gap-3 px-4 pt-[4.5rem] sm:px-6 lg:px-8 lg:pt-20 [&>*]:pointer-events-auto">
              {canvasOverlay}
            </div>
          )}
        </div>

        <div className="relative px-5 pb-28 pt-8 sm:px-8 lg:pt-24">
          <div className="mx-auto flex w-full max-w-[640px] flex-col gap-12">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default ResultsLayout;
