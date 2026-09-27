# PRE//FLIGHT

**Preflight tells brands where a campaign idea sits in real social video, whether it's early or late, and where there's still room, before they spend money producing it.**

Built at the Oriane x Replit "Build for the Video Economy" hackathon, Dubai.

```
CAMPAIGN -> CREATIVE DNA -> ORIANE -> CREATIVE POSITION -> COLLISIONS
-> CREATIVE AIRSPACE -> OPEN TERRITORY -> REROUTE -> PREFLIGHT AGAIN
```

## Status

- [x] Phase 0: Oriane discovery (`scripts/probe-oriane.ts`, [`docs/oriane-fields.md`](docs/oriane-fields.md), `lib/oriane.ts`, `lib/features.ts`)
- [ ] Phase 1: brief → Creative DNA → Oriane → Creative Position + Collisions
- [ ] Phase 2: Lifecycle + Market
- [ ] Phase 3: Creative Airspace
- [ ] Phase 4: Open Territory + Reroute

## Setup

```bash
npm install
cp .env.example .env.local   # fill in ORIANE_API_KEY and the LLM variables
npm run probe                # Phase 0: 3 real Oriane searches, raw responses cached
npm run dev                  # http://localhost:3000 (bound to 0.0.0.0)
```

Environment variables (names only; values live in Replit Secrets or `.env.local`, never in git):

| Name | Purpose |
| --- | --- |
| `ORIANE_API_KEY` | Oriane Integration connect API key |
| `ORIANE_BASE_URL` | defaults to `https://connect.oriane.xyz` |
| `ORIANE_MAX_CALLS_PER_RUN` | budget guard for uncached Oriane calls per run |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` | structure extraction and wording only |
| `PREFLIGHT_OFFLINE` | `1` = serve from the disk cache only |

## Data rules

- Every number is computed in code over real Oriane results. The LLM extracts structure and writes wording; it never produces scores, counts, dates or trends.
- Every Oriane and LLM call is cached to `data/cache/` (gitignored), keyed by a hash of the request.
- Stats are "in the analyzed sample of N videos". Preflight does not predict performance.
