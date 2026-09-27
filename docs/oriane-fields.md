# Oriane fields (Phase 0 discovery)

Source: the live OpenAPI reference at https://connect.oriane.xyz/rest/docs, plus 3 real probe
searches run by `scripts/probe-oriane.ts` on 2026-09-27 (raw responses saved to the gitignored
`data/cache/probe/`).

## API surface

| Endpoint | Use in Preflight |
| --- | --- |
| `POST /rest/assets` `{type:"text", text}` → `ast_…` id | Turns a natural-language probe ("someone asks a stranger what perfume they're wearing") into an asset for AI Vision search |
| `POST /rest/contents/search?sort=&limit=&offset=&projection=&aiSearchAnchor=` | Every retrieval. Body is a boolean query tree (`operator` and/or, `filters`, nested `queries`, max depth 2) |
| `POST /rest/profiles/search` | Not used |

Auth: `Authorization: Bearer <ORIANE_API_KEY>`. `limit` max 100 per page. `projection=full` is
required for transcript, timestamped chunks, frames, location and languages. Platforms indexed:
**Instagram, TikTok**. There is also an MCP endpoint at `https://connect.oriane.xyz/mcp`.

Filters we use: `visualSimilarity` (asset ids, optional `minScore`), `transcript` / `caption` /
`hashtags` (`includesFuzzy`, `includesExactly`, excludes), `transcriptLanguage`, `captionLanguage`,
`locationCompleteAddress`, `publishedAt {after,before}`, `platform`, `format`.

Sorts: `visualSimilarity`, `transcriptRelevance`, `viewsCount`, `likesCount`, `sharesCount`,
`commentsCount`, `interactionsCount`, `engagementRatePerViews`, `engagementRatePerFollowers`,
`profileFollowersCount`, `publishedAt`.

## Per-video fields (projection=full)

| Preflight need | Oriane field | Present? (probe coverage) |
| --- | --- | --- |
| id | `id` (`cnt_…`) | yes, 100% |
| url | built from `platform` + `platformId` + `profileHandle` | yes, 100% |
| platform | `platform` (`instagram` \| `tiktok`) | yes, 100% |
| creator | `profileHandle`, `profileDisplayName` | yes, 100% |
| followers | `profileFollowersCount` | yes, 100% |
| thumbnail | `thumbnailMediaUrl` (public S3 webp, ~180 KB) | yes, 98–100% |
| publish date | `publishedAt` | yes, 100% |
| views / likes / comments / shares | `viewsCount`, `likesCount`, `commentsCount`, `sharesCount` (+ `interactionsCount`, engagement rates) | yes, 100% |
| saves | none | **no** |
| transcript | `transcript` + `transcriptChunks[{startSeconds,endSeconds,text}]` | yes, 60–98% (text-only reviews lower) |
| caption | `caption`, `hashtags[]` | yes |
| visual labels | none (frames are image URLs only) | **no** → `hasVisualLabels=false` |
| language | `transcriptLanguage`, `captionLanguage` (ISO codes: `en`, `ar`, `es`…) | yes, 82–100% |
| location | `locationCompleteAddress` (tagged), `profileLocationCompleteAddress` | sparse, 10–12% |
| match timestamps | `frames[{timestampSeconds, visualSimilarityScore, url}]` on visual searches; transcript chunk times | yes. Frame scores are normalized per video (best frame = 1.0), so they locate the matching moment, not an absolute similarity |
| duration | `duration` (seconds) | yes |
| total counts | `metadata.pagination.totalCount` per search; `data.aggregations` (total views, interactions, engagement) | yes |
| credit cost per call | not returned in body or headers | **no**. We count uncached calls and results ourselves (budget guard) |

## Probe results

| Probe | Mode | Index matches | Sample (50) |
| --- | --- | --- | --- |
| someone asks a stranger what perfume they're wearing | AI Vision (text asset) | 57,552 (ranked, not filtered) | top hits are genuine perfume street interviews (Bella Vita, Fien, Adolfo Domínguez); en 70%, es/de/fr/pt/ms rest |
| oud perfume review | spoken OR caption, fuzzy | 332 | en 74%, TikTok-heavy; Dubai mentioned in spoken words |
| عطر عود | spoken OR caption OR hashtags | 547 | 100% `ar`; locations Riyadh, Doha, UAE, Ras al Khaimah, Kuwait |

## What this changes

- **Dates exist but the index window is ~13 weeks** (oldest result 2026-06-23, newest 2026-09-19, ~8 days
  of indexing lag). Lifecycle uses the 12 weeks ending at the newest video in the pool, not "today".
- **Language exists**: Arabic = `transcriptLanguage` or `captionLanguage` = `ar` (Unicode fallback kept for nulls).
- **Location is sparse**: UAE-context = location field when present, else text hints (Dubai, دبي, AED…).
  Always labelled "UAE-context content", never "UAE market".
- **No visual labels**: the visual dimension comes from the video's own description (caption + transcript +
  hashtags) plus Oriane's AI Vision retrieval, never from invented tags. Evidence shows the best-matching
  frame and its timestamp instead.
- **No saves**: shares/comments/likes are used; saves are shown as "not available".
- Visual search ranks the whole index, so every probe needs a `limit` cap (pool 150–300).
