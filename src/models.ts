// Response models: the stable shape your frontend depends on, independent of the upstream API.
const img = (o: any) => o?.['480x480'] || o?.['150x150'] || null

export const toSong = (t: any) => ({
  id: String(t.id),
  title: t.title as string,
  artist: (t.user?.name ?? null) as string | null,
  artistId: t.user?.id ? String(t.user.id) : null,
  genre: (t.genre ?? null) as string | null,
  duration: (t.duration ?? null) as number | null,
  plays: (t.play_count ?? null) as number | null,
  image: img(t.artwork) as string | null,
  stream: `/api/stream/${t.id}`
})

export const toArtist = (u: any) => ({
  id: String(u.id),
  name: u.name as string,
  handle: (u.handle ?? null) as string | null,
  followers: (u.follower_count ?? 0) as number,
  tracks: (u.track_count ?? 0) as number,
  image: img(u.profile_picture) as string | null
})

export const toPlaylist = (p: any) => ({
  id: String(p.id),
  title: p.playlist_name as string,
  owner: (p.user?.name ?? null) as string | null,
  count: (p.track_count ?? 0) as number,
  image: img(p.artwork) as string | null
})

export type Song = ReturnType<typeof toSong>
export type Artist = ReturnType<typeof toArtist>
export type Playlist = ReturnType<typeof toPlaylist>
