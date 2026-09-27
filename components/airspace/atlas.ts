import * as THREE from "three";
import type { VideoCard } from "@/lib/result-types";

const SIZE = 2048;
const CELL_W = 72;
const CELL_H = 128;
const COLS = 28;
const ROWS = 16;
/** last cell is a shared placeholder for ids that did not get a cell */
const SPARE = COLS * ROWS - 1;
const CONCURRENCY = 8;
const LOAD_TIMEOUT_MS = 10000;
/** minimum seconds between full texture uploads while thumbnails stream in */
const UPLOAD_INTERVAL = 0.3;

type CellState = "loading" | "ready" | "missing" | "novideo";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const timer = window.setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) resolve(img);
      else reject(new Error("empty image"));
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("load failed"));
    };
    img.src = url;
  });
}

/**
 * All node thumbnails packed into one 2048x2048 canvas texture (72x128 cells, 28x16 grid).
 * Cells start as a dark gradient screen and are replaced as images load.
 */
export class ThumbAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cellOf = new Map<string, number>();
  private readonly idOfCell: (string | null)[] = new Array(COLS * ROWS).fill(null);
  private readonly state = new Map<string, CellState>();
  private queue: { id: string; url: string }[] = [];
  private active = 0;
  private dirty = true;
  private lastUpload = -Infinity;
  private disposed = false;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, SIZE, SIZE);
    this.paintPlaceholder(SPARE);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    this.texture = tex;
  }

  /** Allocate cells for new ids and queue their thumbnails. Safe to call repeatedly. */
  sync(ids: string[], videos: Record<string, VideoCard>): void {
    if (this.disposed) return;
    const wanted = new Set(ids);
    for (const id of ids) {
      const known = this.state.get(id);
      if (known === "novideo" && videos[id]) {
        // video details arrived after the node: try again
        this.state.delete(id);
      } else if (this.cellOf.has(id)) {
        continue;
      }
      let cell = this.cellOf.get(id);
      if (cell === undefined) {
        cell = this.allocate(wanted);
        if (cell < 0) continue;
        this.cellOf.set(id, cell);
        this.idOfCell[cell] = id;
        this.paintPlaceholder(cell);
        this.dirty = true;
      }
      const v = videos[id];
      if (!v) {
        this.state.set(id, "novideo");
      } else if (v.hasThumb && v.thumb) {
        this.state.set(id, "loading");
        this.queue.push({ id, url: v.thumb });
      } else {
        this.state.set(id, "missing");
      }
    }
    this.pump();
  }

  /** Write the UV rect (u0, v0, du, dv) of an id's cell into `out` at `offset`. */
  writeRect(id: string, out: Float32Array, offset: number): void {
    const cell = this.cellOf.get(id) ?? SPARE;
    const col = cell % COLS;
    const row = Math.floor(cell / COLS);
    const x = col * CELL_W;
    const y = row * CELL_H;
    // canvas textures are flipped: canvas top maps to v = 1
    out[offset] = (x + 1) / SIZE;
    out[offset + 1] = 1 - (y + CELL_H - 1) / SIZE;
    out[offset + 2] = (CELL_W - 2) / SIZE;
    out[offset + 3] = (CELL_H - 2) / SIZE;
  }

  /** Push pending canvas changes to the GPU, throttled. Call once per frame. */
  flush(now: number): void {
    if (!this.dirty || now - this.lastUpload < UPLOAD_INTERVAL) return;
    this.texture.needsUpdate = true;
    this.dirty = false;
    this.lastUpload = now;
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    this.texture.dispose();
  }

  private allocate(wanted: Set<string>): number {
    for (let i = 0; i < SPARE; i++) if (this.idOfCell[i] === null) return i;
    // full: recycle a cell whose id is no longer in the pool
    for (let i = 0; i < SPARE; i++) {
      const owner = this.idOfCell[i];
      if (owner !== null && !wanted.has(owner)) {
        this.cellOf.delete(owner);
        this.state.delete(owner);
        this.idOfCell[i] = null;
        return i;
      }
    }
    return -1;
  }

  private pump(): void {
    while (!this.disposed && this.active < CONCURRENCY && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job || this.cellOf.get(job.id) === undefined || this.state.get(job.id) !== "loading") continue;
      this.active++;
      loadImage(job.url)
        .then(
          (img) => {
            if (this.disposed) return;
            const cell = this.cellOf.get(job.id);
            if (cell === undefined) return;
            this.drawImage(cell, img);
            this.state.set(job.id, "ready");
            this.dirty = true;
          },
          () => {
            if (!this.disposed) this.state.set(job.id, "missing");
          },
        )
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  private cellOrigin(cell: number): [number, number] {
    return [(cell % COLS) * CELL_W, Math.floor(cell / COLS) * CELL_H];
  }

  private drawImage(cell: number, img: HTMLImageElement): void {
    const [x, y] = this.cellOrigin(cell);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const cellAR = CELL_W / CELL_H;
    let sx = 0;
    let sy = 0;
    let sw = iw;
    let sh = ih;
    if (iw / ih > cellAR) {
      sw = ih * cellAR;
      sx = (iw - sw) / 2;
    } else {
      sh = iw / cellAR;
      sy = (ih - sh) / 2;
    }
    const ctx = this.ctx;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.drawImage(img, sx, sy, sw, sh, x, y, CELL_W, CELL_H);
  }

  /** Dark vertical gradient screen with a faint gold border and play mark. */
  private paintPlaceholder(cell: number): void {
    const [x, y] = this.cellOrigin(cell);
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, y, 0, y + CELL_H);
    g.addColorStop(0, "#141414");
    g.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.strokeStyle = "rgba(255,181,71,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, CELL_W - 6, CELL_H - 6);
    const cx = x + CELL_W / 2;
    const cy = y + CELL_H / 2;
    ctx.fillStyle = "rgba(255,210,122,0.2)";
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 8);
    ctx.lineTo(cx - 6, cy + 8);
    ctx.lineTo(cx + 8, cy);
    ctx.closePath();
    ctx.fill();
  }
}
