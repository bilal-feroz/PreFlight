import { getThumb } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thumbnail proxy: social CDN links block hotlinking or expire, so we serve a cached, downscaled copy. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^cnt_[a-z0-9]{8,64}$/i.test(id)) return new Response(null, { status: 404 });
  const buf = await getThumb(id);
  if (!buf) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
