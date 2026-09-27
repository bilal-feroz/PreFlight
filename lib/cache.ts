import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Disk cache for every external call (Oriane, LLM, thumbnails).
 * Keyed by a hash of the request, so repeat runs cost zero credits and the
 * stage demo works with Wi-Fi off. The folder is gitignored.
 */
export const CACHE_ROOT = path.join(process.cwd(), "data", "cache");

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort()
        .map((k) => [k, stable(obj[k])]),
    );
  }
  return value;
}

export function hashKey(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(input))).digest("hex").slice(0, 40);
}

function fileFor(ns: string, key: string) {
  return path.join(CACHE_ROOT, ns, `${key}.json`);
}

export async function readCache<T>(ns: string, key: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(fileFor(ns, key), "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function writeCache(ns: string, key: string, value: unknown): Promise<void> {
  const file = fileFor(ns, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
}

/** Read-through cache. `fn` only runs on a miss. */
export async function cached<T>(
  ns: string,
  keyInput: unknown,
  fn: () => Promise<T>,
): Promise<{ value: T; hit: boolean; key: string }> {
  const key = hashKey(keyInput);
  const hit = await readCache<{ value: T }>(ns, key);
  if (hit !== undefined) return { value: hit.value, hit: true, key };
  const value = await fn();
  await writeCache(ns, key, { request: keyInput, value, cachedAt: new Date().toISOString() });
  return { value, hit: false, key };
}

export function isOffline(): boolean {
  return process.env.PREFLIGHT_OFFLINE === "1";
}

export class OfflineCacheMissError extends Error {
  constructor(what: string) {
    super(`Offline mode: no cached response for ${what}`);
    this.name = "OfflineCacheMissError";
  }
}
