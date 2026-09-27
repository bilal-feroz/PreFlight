import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CACHE_ROOT, isOffline, readCache, writeCache } from "./cache";
import type { Video } from "./types";

/** Normalized videos by id (raw payload stays in the Oriane search cache). */
export type StoredVideo = Omit<Video, "raw">;

export async function putVideos(videos: Video[]): Promise<void> {
  await Promise.all(
    videos.map((v) => {
      const { raw: _raw, ...rest } = v;
      return writeCache("videos", v.id, { value: rest });
    }),
  );
}

export async function getVideo(id: string): Promise<StoredVideo | undefined> {
  if (!/^cnt_[a-z0-9]+$/i.test(id)) return undefined;
  return (await readCache<{ value: StoredVideo }>("videos", id))?.value;
}

// ------------------------------------------------------------------ thumbnails (proxied + downscaled + cached)

const THUMB_DIR = path.join(CACHE_ROOT, "thumbs");
export const THUMB_SIZE = { w: 108, h: 192 };

const thumbFile = (id: string) => path.join(THUMB_DIR, `${id}.webp`);
const missFile = (id: string) => path.join(THUMB_DIR, `${id}.miss`);

export async function readThumb(id: string): Promise<Buffer | undefined> {
  try {
    return await fs.readFile(thumbFile(id));
  } catch {
    return undefined;
  }
}

/** Returns the downscaled thumbnail, fetching it once from the social CDN copy if needed. */
export async function getThumb(id: string, sourceUrl?: string): Promise<Buffer | undefined> {
  const hit = await readThumb(id);
  if (hit) return hit;
  if (isOffline()) return undefined;
  try {
    await fs.access(missFile(id));
    return undefined; // known dead link
  } catch {
    // not marked missing
  }
  const url = sourceUrl ?? (await getVideo(id))?.thumbnailUrl;
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(String(res.status));
    const out = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(THUMB_SIZE.w, THUMB_SIZE.h, { fit: "cover", position: "attention" })
      .webp({ quality: 64 })
      .toBuffer();
    await fs.mkdir(THUMB_DIR, { recursive: true });
    await fs.writeFile(thumbFile(id), out);
    return out;
  } catch {
    await fs.mkdir(THUMB_DIR, { recursive: true });
    await fs.writeFile(missFile(id), "");
    return undefined;
  }
}

/** Warm the thumbnail cache for a pool so the stage demo works offline. */
export async function prefetchThumbs(videos: { id: string; thumbnailUrl?: string }[], concurrency = 8): Promise<number> {
  let ok = 0;
  let i = 0;
  const worker = async () => {
    while (i < videos.length) {
      const v = videos[i++];
      if (v.thumbnailUrl && (await getThumb(v.id, v.thumbnailUrl))) ok++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return ok;
}
