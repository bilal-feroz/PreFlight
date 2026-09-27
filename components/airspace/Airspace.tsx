"use client";

import dynamic from "next/dynamic";
import type { JSX } from "react";
import type { Airspace as AirspaceData, MarketKey, VideoCard } from "@/lib/result-types";

export type AirspaceProps = {
  airspace: AirspaceData;
  videos: Record<string, VideoCard>;
  /** "global" shows all; "arabic"/"uae" fade nodes whose video is not in that market */
  market: MarketKey;
  /** hovered Collision card: light that node up and draw a filament from the star to it */
  highlightId?: string | null;
  /** after a reroute: filaments grow from the new star to these nodes */
  evidenceIds?: string[];
  onHover?: (id: string | null) => void;
  /** click on a node */
  onSelect?: (id: string) => void;
  className?: string;
};

// WebGL only runs in the browser
const AirspaceCanvas = dynamic(() => import("./AirspaceCanvas"), { ssr: false, loading: () => null });

/** The Creative Airspace: a 3D galaxy of real videos with the concept star among them. Fills its parent. */
export default function Airspace(props: AirspaceProps): JSX.Element {
  return (
    <div
      className={props.className}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#050505" }}
    >
      <AirspaceCanvas {...props} />
    </div>
  );
}
