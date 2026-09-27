import { z } from "zod";
import { runReroute } from "@/lib/pipeline";
import { ndjsonStream } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const Body = z.object({ runId: z.string().min(4).max(64), territoryId: z.string().min(3).max(80) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid reroute request" }, { status: 400 });
  const { runId, territoryId } = parsed.data;
  return ndjsonStream(async (emit) => ({ type: "reroute", result: await runReroute(runId, territoryId, emit) }));
}
