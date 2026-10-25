// One Hono app, three deploy targets (Vercel, Workers, Pages). Data: Audius public API.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { toSong, toArtist, toPlaylist } from './models'

const AUDIUS = 'https://api.audius.co/v1'
const APP = 'tunebox-demo'
const cache = new Map<string, { t: number; d: any }>()

async function audius(path: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({ app_name: APP, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  const url = `${AUDIUS}${path}?${qs}`
  const hit = cache.get(url)
  if (hit && Date.now() - hit.t < 60_000) return hit.d
  let res: Response
  try { res = await fetch(url, { signal: AbortSignal.timeout(10_000) }) } catch { throw new HTTPException(502, { message: 'Music service unreachable' }) }
  if (res.status === 404) throw new HTTPException(404, { message: 'Not found' })
  if (!res.ok) throw new HTTPException(502, { message: `Music service error (${res.status})` })
  const { data } = (await res.json()) as { data: any }
  if (cache.size > 500) cache.clear()
  cache.set(url, { t: Date.now(), d: data })
  return data
}

class ApiError extends Error {
  status: 400 | 404
  example?: string
  constructor(status: 400 | 404, message: string, example?: string) {
    super(message)
    this.status = status
    this.example = example
  }
}

const limitOf = (v: string | undefined, def = 20) => Math.min(50, Math.max(1, Math.floor(Number(v)) || def))
const pid = (v: string) => encodeURIComponent(v)
const needQ = (q: string | undefined, example: string) => {
  const s = q?.trim()
  if (!s) throw new ApiError(400, 'Missing required query parameter "q"', example)
  return s
}

export const app = new Hono({ strict: false }).basePath('/api')
app.use('*', cors())

const ROUTES = [
  ['/home', '/api/home', 'Trending songs, playlists, charts and artists'],
  ['/trending', '/api/trending?genre=Electronic&limit=10', 'Trending songs (genre and limit optional)'],
  ['/charts', '/api/charts', 'Underground trending songs'],
  ['/search', '/api/search?q=love', 'Songs, artists and playlists (q required)'],
  ['/search/songs', '/api/search/songs?q=love', 'Songs only (q required)'],
  ['/search/artists', '/api/search/artists?q=love', 'Artists only (q required)'],
  ['/search/playlists', '/api/search/playlists?q=love', 'Playlists only (q required)'],
  ['/songs/{id}', '/api/songs/<songId>', 'One song'],
  ['/songs/{id}/related', '/api/songs/<songId>/related', 'More songs in the same genre'],
  ['/stream/{id}', '/api/stream/<songId>', 'Audio stream (redirect)'],
  ['/artists/{id}', '/api/artists/<artistId>', 'One artist'],
  ['/artists/{id}/songs', '/api/artists/<artistId>/songs', 'Songs by an artist'],
  ['/playlists/{id}', '/api/playlists/<playlistId>', 'Playlist with songs'],
  ['/radio/featured', '/api/radio/featured', 'Featured (genre) stations'],
  ['/radio/artist/{id}', '/api/radio/artist/<artistId>', 'Create an artist station'],
  ['/radio/entity', '/api/radio/entity?type=song&id=<songId>', 'Create a station from a song, artist, playlist or genre'],
  ['/radio/songs', '/api/radio/songs?station=genre:Electronic&limit=15', 'Songs for a station id (station required)']
]
app.get('/', (c) => {
  const origin = new URL(c.req.url).origin
  return c.json({
    name: 'TuneBox API',
    note: 'Replace <songId>, <artistId>, <playlistId> with ids from /api/home or /api/search. List routes accept ?limit=1..50.',
    routes: ROUTES.map(([path, example, description]) => ({ path: `/api${path}`, example: origin + example, description }))
  })
})

// ---- home / discovery ----
app.get('/home', async (c) => {
  const [t, p, u] = await Promise.all([
    audius('/tracks/trending', { limit: 20 }),
    audius('/playlists/trending', { limit: 10 }),
    audius('/tracks/trending/underground', { limit: 10 })
  ])
  const artists = new Map<string, ReturnType<typeof toArtist>>()
  for (const x of t) if (x.user?.id) artists.set(x.user.id, toArtist(x.user))
  return c.json({ trending: t.map(toSong), playlists: p.map(toPlaylist), charts: u.map(toSong), artists: [...artists.values()].slice(0, 10) })
})
app.get('/trending', async (c) => {
  const genre = c.req.query('genre')
  const d = await audius('/tracks/trending', { limit: limitOf(c.req.query('limit')), ...(genre ? { genre } : {}) })
  return c.json({ songs: d.map(toSong) })
})
app.get('/charts', async (c) => c.json({ songs: (await audius('/tracks/trending/underground', { limit: limitOf(c.req.query('limit')) })).map(toSong) }))

// ---- search ----
app.get('/search', async (c) => {
  const q = needQ(c.req.query('q'), '/api/search?q=love')
  const [s, a, p] = await Promise.all([
    audius('/tracks/search', { query: q, limit: 10 }),
    audius('/users/search', { query: q, limit: 10 }),
    audius('/playlists/search', { query: q, limit: 10 })
  ])
  return c.json({ songs: s.map(toSong), artists: a.map(toArtist), playlists: p.map(toPlaylist) })
})
app.get('/search/songs', async (c) => c.json({ songs: (await audius('/tracks/search', { query: needQ(c.req.query('q'), '/api/search/songs?q=love'), limit: limitOf(c.req.query('limit')) })).map(toSong) }))
app.get('/search/artists', async (c) => c.json({ artists: (await audius('/users/search', { query: needQ(c.req.query('q'), '/api/search/artists?q=love'), limit: limitOf(c.req.query('limit')) })).map(toArtist) }))
app.get('/search/playlists', async (c) => c.json({ playlists: (await audius('/playlists/search', { query: needQ(c.req.query('q'), '/api/search/playlists?q=love'), limit: limitOf(c.req.query('limit')) })).map(toPlaylist) }))

// ---- songs ----
app.get('/songs/:id', async (c) => c.json(toSong(await audius(`/tracks/${pid(c.req.param('id'))}`))))
// "More like this": trending tracks in the same genre, minus the song itself.
app.get('/songs/:id/related', async (c) => {
  const t = await audius(`/tracks/${pid(c.req.param('id'))}`)
  const limit = limitOf(c.req.query('limit'), 10)
  const d = await audius('/tracks/trending', { limit: limit + 1, ...(t.genre ? { genre: t.genre } : {}) })
  return c.json({ songs: d.filter((x: any) => String(x.id) !== String(t.id)).slice(0, limit).map(toSong) })
})
app.get('/stream/:id', (c) => c.redirect(`${AUDIUS}/tracks/${pid(c.req.param('id'))}/stream?app_name=${APP}`))

// ---- artists ----
app.get('/artists/:id', async (c) => c.json(toArtist(await audius(`/users/${pid(c.req.param('id'))}`))))
app.get('/artists/:id/songs', async (c) => c.json({ songs: (await audius(`/users/${pid(c.req.param('id'))}/tracks`, { limit: limitOf(c.req.query('limit')) })).map(toSong) }))

// ---- playlists ----
app.get('/playlists/:id', async (c) => {
  const [pl] = await audius(`/playlists/${pid(c.req.param('id'))}`)
  if (!pl) throw new HTTPException(404, { message: 'Not found' })
  const tracks = await audius(`/playlists/${pid(c.req.param('id'))}/tracks`)
  return c.json({ ...toPlaylist(pl), songs: tracks.map(toSong) })
})

// ---- radio: stateless stations (id = "type:seed"), songs resolved on demand ----
const GENRES = ['Electronic', 'Hip-Hop/Rap', 'Pop', 'Rock', 'Alternative', 'Ambient', 'Jazz', 'R&B/Soul', 'Lo-Fi', 'Classical']
const ENTITY_EXAMPLE = '/api/radio/entity?type=song&id=<songId>'
const SONGS_EXAMPLE = '/api/radio/songs?station=genre:Electronic'
const station = (type: string, seed: string, title: string) => {
  const sid = `${type}:${seed}`
  return { id: sid, type, title, songsUrl: `/api/radio/songs?station=${encodeURIComponent(sid)}` }
}

async function makeStation(type: string, seed: string, example = ENTITY_EXAMPLE) {
  if (!seed) throw new ApiError(400, 'Missing required query parameter "id"', example)
  const enc = encodeURIComponent(seed)
  switch (type) {
    case 'genre': return station('genre', seed, `${seed} Radio`)
    case 'artist': return station('artist', seed, `${(await audius(`/users/${enc}`)).name} Radio`)
    case 'song': return station('song', seed, `${(await audius(`/tracks/${enc}`)).title} Radio`)
    case 'playlist': {
      const [pl] = await audius(`/playlists/${enc}`)
      if (!pl) throw new ApiError(404, 'Playlist not found')
      return station('playlist', seed, `${pl.playlist_name} Radio`)
    }
    default: throw new ApiError(400, `Invalid or missing "type" (got "${type}"); use genre, artist, song or playlist`, example)
  }
}

const shuffle = <T,>(a: T[]) => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

async function stationSongs(stationId: string, limit: number) {
  const i = stationId.indexOf(':')
  const type = stationId.slice(0, i)
  const seed = stationId.slice(i + 1)
  if (i < 1 || !seed) throw new ApiError(400, 'Invalid station id; expected "type:seed"', SONGS_EXAMPLE)
  const enc = encodeURIComponent(seed)
  let tracks: any[]
  if (type === 'genre') {
    tracks = shuffle(await audius('/tracks/trending', { limit: Math.min(50, limit * 2), genre: seed }))
  } else if (type === 'artist') {
    const own = await audius(`/users/${enc}/tracks`, { limit })
    const genre = own.find((t: any) => t.genre)?.genre
    const more = genre ? await audius('/tracks/trending', { limit, genre }) : []
    tracks = [...own, ...more]
  } else if (type === 'song') {
    const t = await audius(`/tracks/${enc}`)
    tracks = [t, ...(await audius('/tracks/trending', { limit: limit + 1, ...(t.genre ? { genre: t.genre } : {}) }))]
  } else if (type === 'playlist') {
    tracks = await audius(`/playlists/${enc}/tracks`)
  } else {
    throw new ApiError(400, `Invalid station type "${type}"; use genre, artist, song or playlist`, SONGS_EXAMPLE)
  }
  const seen = new Set<string>()
  return tracks.filter((t) => !seen.has(String(t.id)) && seen.add(String(t.id))).slice(0, limit).map(toSong)
}

app.get('/radio/featured', (c) => c.json({ stations: GENRES.map((g) => station('genre', g, `${g} Radio`)) }))
app.get('/radio/artist/:id', async (c) => c.json(await makeStation('artist', c.req.param('id').trim(), '/api/radio/artist/<artistId>')))
app.get('/radio/entity', async (c) => c.json(await makeStation(c.req.query('type')?.trim() ?? '', c.req.query('id')?.trim() ?? '')))
app.get('/radio/songs', async (c) => {
  const st = c.req.query('station')?.trim()
  if (!st) throw new ApiError(400, 'Missing required query parameter "station"', SONGS_EXAMPLE)
  return c.json({ station: st, songs: await stationSongs(st, limitOf(c.req.query('limit'), 15)) })
})

app.notFound((c) => c.json({ message: 'Route not found', hint: 'See /api for the list of routes and example URLs' }, 404))
app.onError((e, c) => {
  if (e instanceof ApiError) {
    const example = e.example ? new URL(c.req.url).origin + e.example : undefined
    return c.json({ message: e.message, ...(example ? { example } : {}) }, e.status)
  }
  if (e instanceof HTTPException) return c.json({ message: e.message }, e.status)
  console.error(e)
  return c.json({ message: 'Internal error' }, 500)
})
