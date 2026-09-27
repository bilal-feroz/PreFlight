# PRE//FLIGHT

**Preflight tells brands where a campaign idea sits in real social video, whether it's early or late, and where there's still room, before they spend money producing it.**

Built at the Oriane x Replit "Build for the Video Economy" hackathon, Dubai.

Brands and agencies approve creator campaigns on gut feeling. Nobody checks whether the idea has already been posted hundreds of times, whether the format is rising or declining, or whether it's crowded globally but still open locally. Preflight does, against real Instagram and TikTok videos indexed by [Oriane](https://www.oriane.xyz).

```
CAMPAIGN -> CREATIVE CONSTELLATION -> ORIANE -> CREATIVE POSITION -> COLLISIONS
-> CREATIVE AIRSPACE -> OPEN TERRITORY -> REROUTE -> PREFLIGHT AGAIN
```

1. **Creative Constellation**: the stars the idea is made of (hook, format, narrative arc, visual motifs, product interaction, tone, location, CTA).
2. **Creative Position**: one card with Crowding, Lifecycle, Market and Confidence.
3. **Collisions**: the real videos that prove it, with the transcript line and timestamp.
4. **Creative Airspace**: a 3D galaxy of the analyzed videos, so you see where the idea sits.
5. **Open Territory**: where the data shows room (a less crowded format, or a less crowded market).
6. **Reroute**: rewrite the idea toward that territory, score it again on the same videos, watch the star move.

## Demo

- Try the example idea on the landing page (**Try an example**), then **Reroute here** on the Arabic-first territory and **Get Replit visual example** for the animated concept preview.
- 2-minute demo video: [script, shot list and voice-over](docs/demo-video-script.md) · [subtitles (.srt)](docs/demo-video.srt)

## Architecture

```
Browser (Next.js App Router, React Three Fiber galaxy)
   │  POST /api/preflight {brief}      ← NDJSON progress stream
   │  POST /api/reroute {runId, territoryId}
   │  GET  /api/thumb/:id              ← cached, downscaled thumbnail proxy
   ▼
lib/pipeline.ts
   1. Creative Constellation + probes ─ lib/llm.ts (structure only, Zod-validated, cached)
   2. Probes → Oriane ─────────────── lib/oriane.ts (AI Vision text assets + phrase search,
   │                                   topic / Arabic / UAE-context guards, concurrency 3,
   │                                   per-run call budget, disk cache)
   3. Video constellations, 15 per call ─ cached per video id, reused forever
   4. Concept vs video comparison ──── 6 dimensions per video, cached per concept × video
   5. Scoring in code ─────────────── lib/scoring.ts (crowding, saturation, confidence,
                                       lifecycle, market), lib/territory.ts, lib/layout.ts
   ▼
data/cache/  (gitignored: every Oriane + LLM response, thumbnails, runs)
```

Reroute only runs new probes for the rewritten idea, merges them into the same pool, and scores **both** ideas against that merged pool, so the before / after is fair.

## Scoring (all constants in `lib/config.ts`)

- **Overall similarity** = 0.25 hook + 0.20 narrative + 0.20 visual + 0.15 format + 0.10 topic + 0.10 product. The comparison step grades each dimension A–E (same move · close · related · loose · different); code maps grades to 0.95 · 0.78 · 0.60 · 0.35 · 0.05 and computes the weighted sum
- **Crowding** (0–100) = round(100 × (0.5 × min(1, exact/8) + 0.3 × min(1, close/20) + 0.2 × min(1, medium/40))), with exact = overall ≥ 0.85, close = 0.70–0.85, medium = 0.55–0.70
- **Dimension saturation** = among relevant videos (overall ≥ 0.4), the share with that dimension ≥ 0.7
- **Insight sentence** = templated from the most and least saturated dimensions
- **Confidence** = relevant N ≥ 80 High, 30–79 Medium, < 30 Low (N always shown)
- **Lifecycle** (neighborhood = overall ≥ 0.55; 12 weeks ending at the newest video in the sample, because the index lags a few days):
  - supplyGrowth = (last 6 weeks − previous 6) ÷ max(1, previous 6)
  - relative response = (views ÷ followers) ÷ median of all sampled videos published the same week (removes the "newer videos had less time" bias)
  - attentionRatio = median relative response last 6 weeks ÷ previous 6
  - INSUFFICIENT DATA < 12 dated videos · EARLY supply < 15 and attention ≥ 1.0 · RISING growth ≥ +25% and attention ≥ 0.9 · PEAKING high supply, growth −15%…+25%, attention ≥ 0.9 · DECLINING high supply and (growth < −15% or attention < 0.8) · EXHAUSTED high supply, growth < −30% and attention < 0.7 · otherwise STEADY
- **Market**: Arabic = Oriane `transcriptLanguage` / `captionLanguage` = `ar` (Arabic-script share > 30% when no language field); UAE-context = tagged location, or Dubai / Abu Dhabi / UAE / Emirates / دبي / الإمارات / AED … in caption, transcript or hashtags. Crowding, lifecycle and confidence are recomputed inside each subset; small subsets show "Low data".
- **Open Territory**: REFORMAT = a format in the same topic with lower supply and ≥ 1.2× median relative response (EARLY / RISING preferred); LOCALIZE = the idea's crowding in Arabic or UAE-context content is ≥ 25 points below global.

## Setup

```bash
npm install
cp .env.example .env.local      # fill in the values
npm run probe                   # Oriane discovery: 3 real searches, raw responses cached
npm run preflight               # run the demo brief from the terminal (warms the cache)
npm run preflight -- --reroute  # ... and reroute into the hero Open Territory
npm run dev                     # http://localhost:3000 (bound to 0.0.0.0)
```

| Env var | Purpose |
| --- | --- |
| `ORIANE_API_KEY` | Oriane Integration connect API key; several comma-separated keys are allowed, the next one takes over when a key runs out of credits |
| `ORIANE_BASE_URL` | defaults to `https://connect.oriane.xyz` |
| `ORIANE_MAX_CALLS_PER_RUN` | budget guard for uncached Oriane calls per run (default 40) |
| `LLM_PROVIDER` | `groq` (default), `gemini`, `anthropic` or `openai` |
| `LLM_API_KEY` | key for that provider; several comma-separated keys are pooled (each account has its own rate limits) |
| `LLM_MODEL` | optional; otherwise models are picked from the provider's live model list |
| `PREFLIGHT_OFFLINE` | `1` = serve from the disk cache only (stage demo with Wi-Fi off) |
| `PREFLIGHT_POOL_MAX` | videos per analysis (default 200) |

## Replit

1. Import this GitHub repo into Replit (Create → Import from GitHub).
2. Add the env vars above in **Secrets**.
3. Optional, for an offline demo: on the machine that already ran the demo, `npm run cache:pack`, upload `data/demo-cache.tar.gz` into the Repl's `data/` folder, then run `npm run cache:unpack` in the Replit shell.
4. **Run** starts `next dev` on port 3000. **Deploy** (Autoscale) runs `npm run build` then `npm run start`; files in `data/cache` are part of the deployment snapshot.

## Honest limitations

- Sample-based: every number is "in the analyzed sample of N videos" retrieved from Oriane for this idea (Instagram + TikTok, about the last 13 weeks of the index). It is not a census of social media.
- Not a performance prediction. "Less crowded in the analyzed dataset" is the claim, nothing more.
- Oriane returns no visual labels, so the visual dimension is judged from captions, transcripts and Oriane AI Vision retrieval; evidence shows the best-matching frame time instead of invented tags.
- Oriane returns no saves; they are shown as not available.
- Location is sparse (about 10% of videos), so UAE-context also uses text mentions and is labelled "UAE-context content", never "UAE market".
- Dimension ratings come from a language model reading each video's transcript and caption; they are cached so a run is reproducible, and every aggregate is computed in code.
