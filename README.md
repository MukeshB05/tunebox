# TuneBox
Hono API + static frontend. Music data from the Audius public API. Same code deploys to Vercel, Cloudflare Workers and Cloudflare Pages.

    npm install

**Workers (workers.dev)** — serves API and frontend together:
    npx wrangler login && npm run deploy:worker

**Pages (pages.dev)** — static `public/` + Pages Function in `functions/`:
    npm run deploy:pages

**Vercel** — import the repo (or `npx vercel`); `vercel.json` sets output to `public/` and routes `/api/*` to `api/index.ts`.

Local: `npm run dev` (wrangler dev, http://localhost:8787).

## API
Open `/api` (or `/api/`) for a live index of routes with example URLs. All routes under `/api`; list routes accept `?limit=1..50`.

| Route | Returns |
| --- | --- |
| `/home` | `{ trending, playlists, charts, artists }` |
| `/trending?genre=` , `/charts` | `{ songs }` |
| `/search?q=` | `{ songs, artists, playlists }` |
| `/search/songs?q=` , `/search/artists?q=` , `/search/playlists?q=` | one list each |
| `/songs/:id` , `/songs/:id/related` | song / `{ songs }` |
| `/artists/:id` , `/artists/:id/songs` | artist / `{ songs }` |
| `/playlists/:id` | playlist with `songs` |
| `/stream/:id` | redirect to audio |
| `/radio/featured` | `{ stations }` (genre stations) |
| `/radio/artist/:id` | artist station |
| `/radio/entity?type=song\|artist\|playlist\|genre&id=` | station for that seed |
| `/radio/songs?station=type:seed&limit=` | `{ station, songs }` (use the `songsUrl` from a station; it is already URL-encoded) |

Errors: `400` missing params (response includes an `example` URL), `404` not found, `502` upstream unavailable.
Models live in `src/models.ts` (Song, Artist, Playlist).

## Notes
- `npm run typecheck` runs `tsc` (after `npm install`).
- Upstream calls time out after 10s and return `502` instead of hanging.
- Station ids look like `type:seed`; use the `songsUrl` returned by the station routes, which is already URL-encoded.
