"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { Canvas } from "@react-three/fiber";
import { FORMAT_NAMES, compactNumber, shortDate } from "@/lib/labels";
import type { VideoCard } from "@/lib/result-types";
import type { AirspaceProps } from "./Airspace";
import { FONT_MONO, FONT_SANS, HEX } from "./palette";
import { createRuntime, type Runtime } from "./runtime";
import { Scene } from "./Scene";

const NO_IDS: string[] = [];
const DRAG_THRESHOLD_PX = 5;

const LABEL_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  whiteSpace: "nowrap",
  pointerEvents: "none",
  fontFamily: FONT_SANS,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(221, 230, 242, 0.5)",
  textShadow: "0 0 10px rgba(5, 5, 5, 0.95), 0 0 2px rgba(5, 5, 5, 0.9)",
  transform: "translate3d(-9999px, -9999px, 0)",
  willChange: "transform",
};

const LABEL_COUNT_STYLE: CSSProperties = {
  fontFamily: FONT_MONO,
  letterSpacing: "0.02em",
  color: "rgba(143, 179, 217, 0.72)",
};

const PLATFORM_NAMES: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

function Tooltip({ ref, video, visible }: { ref: Ref<HTMLDivElement>; video: VideoCard | undefined; visible: boolean }) {
  const creator = video?.creator ? (video.creator.startsWith("@") ? video.creator : `@${video.creator}`) : "";
  const thumbUrl = video?.hasThumb && video.thumb ? `url("${video.thumb.replace(/"/g, "%22")}") center / cover no-repeat, ` : "";
  const platform = video ? (PLATFORM_NAMES[video.platform?.toLowerCase()] ?? video.platform) : "";
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        opacity: visible && video ? 1 : 0,
        transition: "opacity 160ms ease",
        willChange: "transform, opacity",
        transform: "translate3d(-9999px, -9999px, 0)",
      }}
    >
      {video && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "8px 12px 8px 8px",
            borderRadius: 10,
            background: "rgba(10, 10, 10, 0.6)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255, 181, 71, 0.25)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5), 0 0 24px rgba(255, 181, 71, 0.06)",
            fontFamily: FONT_SANS,
          }}
        >
          <div
            style={{
              width: 36,
              height: 64,
              flex: "none",
              borderRadius: 5,
              background: `${thumbUrl}linear-gradient(180deg, #141414, #0a0a0a)`,
              border: "1px solid rgba(255, 181, 71, 0.2)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div
              style={{
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12.5,
                fontWeight: 500,
                color: "#F2EEE7",
              }}
            >
              {creator || "Unknown creator"}
            </div>
            <div style={{ fontSize: 10.5, letterSpacing: "0.04em", color: "rgba(143, 179, 217, 0.85)", whiteSpace: "nowrap" }}>
              {FORMAT_NAMES[video.format] ?? "Video"}
              {platform ? ` · ${platform}` : ""}
            </div>
            <div style={{ display: "flex", gap: 10, fontFamily: FONT_MONO, fontSize: 11, whiteSpace: "nowrap" }}>
              <span style={{ color: HEX.lightGold }}>{compactNumber(video.views)} views</span>
              <span style={{ color: "rgba(221, 230, 242, 0.55)" }}>{shortDate(video.publishedAt)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AirspaceCanvas(props: AirspaceProps): JSX.Element {
  const { airspace, videos, market, highlightId = null, evidenceIds, onHover, onSelect } = props;

  const rtRef = useRef<Runtime | null>(null);
  if (rtRef.current === null) rtRef.current = createRuntime();

  const callbacks = useRef({ onHover, onSelect });
  useLayoutEffect(() => {
    callbacks.current = { onHover, onSelect };
  });

  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<{ id: string; visible: boolean } | null>(null);

  const handleHoverChange = useCallback((id: string | null) => {
    setTip((prev) => (id ? { id, visible: true } : prev ? { ...prev, visible: false } : null));
    callbacks.current.onHover?.(id);
  }, []);

  const updatePointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = rtRef.current;
    if (!r) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = r.pointer;
    p.x = e.clientX - rect.left;
    p.y = e.clientY - rect.top;
    p.inside = true;
    return r;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = updatePointer(e);
    if (!r) return;
    const p = r.pointer;
    if (p.down && !p.dragging && Math.hypot(p.x - p.downX, p.y - p.downY) > DRAG_THRESHOLD_PX) p.dragging = true;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = updatePointer(e);
    if (!r) return;
    const p = r.pointer;
    p.down = true;
    p.dragging = false;
    p.downX = p.x;
    p.downY = p.y;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = rtRef.current;
    if (!r) return;
    const p = r.pointer;
    const wasDrag = p.dragging;
    p.down = false;
    p.dragging = false;
    if (!wasDrag && e.button === 0 && r.hoveredId) callbacks.current.onSelect?.(r.hoveredId);
  };

  const onPointerLeave = () => {
    const r = rtRef.current;
    if (!r) return;
    r.pointer.inside = false;
    r.pointer.down = false;
    r.pointer.dragging = false;
  };

  const overlay = { tooltip: tooltipRef, labels: labelsRef, labelLayer: labelLayerRef };

  return (
    <div
      style={{ position: "absolute", inset: 0, cursor: tip?.visible ? "pointer" : "grab" }}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 400, position: [0, 6, 12] }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        fallback={
          <div style={{ padding: 24, fontFamily: FONT_SANS, fontSize: 12, color: "rgba(221, 230, 242, 0.5)" }}>
            3D view unavailable on this device.
          </div>
        }
      >
        <Scene
          runtimeRef={rtRef}
          airspace={airspace}
          videos={videos}
          market={market}
          highlightId={highlightId}
          evidenceIds={evidenceIds ?? NO_IDS}
          overlay={overlay}
          onHoverChange={handleHoverChange}
        />
      </Canvas>
      <div
        ref={labelLayerRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 900ms ease",
        }}
      >
        {airspace.clusters.map((c, i) => (
          <div
            key={`${c.label}-${i}`}
            ref={(el) => {
              labelsRef.current[i] = el;
            }}
            style={LABEL_STYLE}
          >
            <span>{FORMAT_NAMES[c.label] ?? c.label}</span>
            <span style={LABEL_COUNT_STYLE}>{c.supply}</span>
          </div>
        ))}
      </div>
      <Tooltip ref={tooltipRef} video={tip ? videos[tip.id] : undefined} visible={Boolean(tip?.visible)} />
    </div>
  );
}
