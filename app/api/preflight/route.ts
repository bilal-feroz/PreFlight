import { z } from "zod";
import { runPreflight } from "@/lib/pipeline";
import { ndjsonStream } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const Body = z.object({ brief: z.string().trim().min(12, "Describe the idea in a sentence or two.").max(1200) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid brief" }, { status: 400 });
  }
  return ndjsonStream(async (emit) => ({ type: "result", result: await runPreflight(parsed.data.brief, emit) }));
}
