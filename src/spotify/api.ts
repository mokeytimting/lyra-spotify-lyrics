import { getAccessToken } from './auth';
import type {
  AlbumSummary,
  Device,
  PlaybackState,
  PlaylistSummary,
  Track,
} from './types';

const BASE = 'https://api.spotify.com/v1';

export class SpotifyApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Spotify API error (${status})`);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.body = body;
  }
}

export class QuotaExceededError extends Error {
  constructor() {
    super('Spotify API quota exceeded');
    this.name = 'QuotaExceededError';
  }
}

export class NoActiveDeviceError extends Error {
  constructor() {
    super('No active Spotify device');
    this.name = 'NoActiveDeviceError';
  }
}

export class NotOwnedError extends Error {
  constructor() {
    super('Playlist is not owned by the current user');
    this.name = 'NotOwnedError';
  }
}

type QueryValue = string | number | boolean | undefined;

interface FetchOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  notOwnedOn403?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function apiFetch(
  method: string,
  path: string,
  opts: FetchOptions = {},
  canRetry = true,
): Promise<any> {
  const token = await getAccessToken();

  let url = BASE + path;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.query)) {
      if (value === undefined) continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, init);

  if (res.status === 204) {
    return null;
  }

  if (res.ok) {
    return readJson(res);
  }

  const body = await readJson(res);

  if (res.status === 429) {
    if (body?.error?.reason === 'QUOTA_EXCEEDED') {
      throw new QuotaExceededError();
    }
    if (canRetry) {
      const header = res.headers.get('Retry-After');
      const parsed = header === null ? Number.NaN : Number(header);
      const waitMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 0;
      await sleep(waitMs);
      return apiFetch(method, path, opts, false);
    }
    throw new SpotifyApiError(429, body);
  }

  if (res.status === 404 && body?.error?.reason === 'NO_ACTIVE_DEVICE') {
    throw new NoActiveDeviceError();
  }

  if (res.status === 403 && opts.notOwnedOn403) {
    throw new NotOwnedError();
  }

  throw new SpotifyApiError(res.status, body);
}

function bestImageUrl(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  let bestUrl: string | null = null;
  let bestWidth = Number.NEGATIVE_INFINITY;
  for (const entry of images) {
    if (!entry || typeof entry !== 'object') continue;
    const url = (entry as { url?: unknown }).url;
    if (typeof url !== 'string') continue;
    const rawWidth = (entry as { width?: unknown }).width;
    const width = typeof rawWidth === 'number' ? rawWidth : 0;
    if (width > bestWidth) {
      bestWidth = width;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function mapTrack(item: unknown): Track | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as Record<string, any>;
  if (typeof raw.type === 'string' && raw.type !== 'track') return null;

  const artists: string[] = [];
  if (Array.isArray(raw.artists)) {
    for (const a of raw.artists) {
      if (a && typeof a.name === 'string') artists.push(a.name);
    }
  }

  const album = raw.album && typeof raw.album === 'object' ? raw.album : null;
  const albumName = album && typeof album.name === 'string' ? album.name : '';
  const imageUrl = album ? bestImageUrl(album.images) : null;

  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    uri: typeof raw.uri === 'string' ? raw.uri : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    artists,
    album: albumName,
    durationMs: typeof raw.duration_ms === 'number' ? raw.duration_ms : 0,
    imageUrl,
  };
}

function mapDevice(raw: any): Device {
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    name: typeof raw?.name === 'string' ? raw.name : '',
    type: typeof raw?.type === 'string' ? raw.type : '',
    isActive: raw?.is_active === true,
    isRestricted: raw?.is_restricted === true,
  };
}

function mapPlaylist(raw: any, meId: string | null): PlaylistSummary {
  const ownerId =
    raw && typeof raw.owner === 'object' && typeof raw.owner.id === 'string'
      ? raw.owner.id
      : null;
  return {
    id: typeof raw?.id === 'string' ? raw.id : '',
    uri: typeof raw?.uri === 'string' ? raw.uri : '',
    name: typeof raw?.name === 'string' ? raw.name : '',
    imageUrl: bestImageUrl(raw?.images),
    owned:
      (meId !== null && ownerId === meId) || raw?.collaborative === true,
  };
}

function mapAlbum(raw: any): AlbumSummary {
  let artist = '';
  if (Array.isArray(raw?.artists) && raw.artists.length > 0) {
    const first = raw.artists[0];
    if (first && typeof first.name === 'string') artist = first.name;
  }
  return {
    uri: typeof raw?.uri === 'string' ? raw.uri : '',
    name: typeof raw?.name === 'string' ? raw.name : '',
    imageUrl: bestImageUrl(raw?.images),
    artist,
  };
}

let cachedUserId: string | null = null;
let userIdResolved = false;

async function getCurrentUserId(): Promise<string | null> {
  if (userIdResolved) return cachedUserId;
  try {
    const data = await apiFetch('GET', '/me');
    if (data && typeof data.id === 'string') {
      cachedUserId = data.id;
    }
  } catch {
    // ignore — treat as unavailable
  }
  userIdResolved = true;
  return cachedUserId;
}

export async function getPlaybackState(): Promise<PlaybackState | null> {
  const sentAt = performance.now();
  const data = await apiFetch('GET', '/me/player');
  const receivedAt = performance.now();
  if (!data || typeof data !== 'object') return null;

  const track = mapTrack(data.item);
  const device = data.device && typeof data.device === 'object' ? data.device : null;

  return {
    track,
    positionMs: typeof data.progress_ms === 'number' ? data.progress_ms : 0,
    isPlaying: data.is_playing === true,
    deviceId: device && typeof device.id === 'string' ? device.id : null,
    deviceName: typeof device?.name === 'string' ? device.name : null,
    // progress_ms 大約是在請求往返的中間量到的
    timestamp: (sentAt + receivedAt) / 2,
  };
}

export async function getDevices(): Promise<Device[]> {
  const data = await apiFetch('GET', '/me/player/devices');
  const list = data && Array.isArray(data.devices) ? data.devices : [];
  return list.map(mapDevice);
}

export async function transferPlayback(
  deviceId: string,
  play: boolean,
): Promise<void> {
  await apiFetch('PUT', '/me/player', {
    body: { device_ids: [deviceId], play },
  });
}

export async function play(opts: {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
  offsetUri?: string;
  positionMs?: number;
} = {}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (opts.contextUri !== undefined) body.context_uri = opts.contextUri;
  if (opts.uris !== undefined) body.uris = opts.uris;
  if (opts.offsetUri !== undefined) body.offset = { uri: opts.offsetUri };
  if (opts.positionMs !== undefined) body.position_ms = opts.positionMs;

  await apiFetch('PUT', '/me/player/play', {
    query: { device_id: opts.deviceId },
    body,
  });
}

export async function pause(): Promise<void> {
  await apiFetch('PUT', '/me/player/pause');
}

export async function next(): Promise<void> {
  await apiFetch('POST', '/me/player/next');
}

export async function previous(): Promise<void> {
  await apiFetch('POST', '/me/player/previous');
}

export async function seek(ms: number): Promise<void> {
  await apiFetch('PUT', '/me/player/seek', {
    query: { position_ms: ms },
  });
}

export async function setVolume(pct: number): Promise<void> {
  await apiFetch('PUT', '/me/player/volume', {
    query: { volume_percent: pct },
  });
}

export async function search(
  q: string,
  offset?: number,
): Promise<{
  tracks: Track[];
  playlists: PlaylistSummary[];
  albums: AlbumSummary[];
}> {
  const query: Record<string, QueryValue> = {
    q,
    type: 'track,playlist,album',
    limit: 10,
  };
  if (offset !== undefined) query.offset = offset;

  const data = await apiFetch('GET', '/search', { query });

  const meId = await getCurrentUserId();

  const tracks: Track[] = [];
  if (data && Array.isArray(data?.tracks?.items)) {
    for (const item of data.tracks.items) {
      const t = mapTrack(item);
      if (t) tracks.push(t);
    }
  }

  const playlists: PlaylistSummary[] = [];
  if (data && Array.isArray(data?.playlists?.items)) {
    for (const item of data.playlists.items) {
      if (!item) continue;
      playlists.push(mapPlaylist(item, meId));
    }
  }

  const albums: AlbumSummary[] = [];
  if (data && Array.isArray(data?.albums?.items)) {
    for (const item of data.albums.items) {
      if (!item) continue;
      albums.push(mapAlbum(item));
    }
  }

  return { tracks, playlists, albums };
}

export async function getMyPlaylists(
  offset?: number,
): Promise<{ playlists: PlaylistSummary[]; next: boolean }> {
  const query: Record<string, QueryValue> = { limit: 50 };
  if (offset !== undefined) query.offset = offset;

  const data = await apiFetch('GET', '/me/playlists', { query });
  const meId = await getCurrentUserId();

  const playlists: PlaylistSummary[] = [];
  if (data && Array.isArray(data.items)) {
    for (const item of data.items) {
      if (!item) continue;
      playlists.push(mapPlaylist(item, meId));
    }
  }

  return { playlists, next: Boolean(data?.next) };
}

export async function getPlaylistItems(
  id: string,
  offset?: number,
): Promise<{ tracks: Track[]; next: boolean }> {
  const query: Record<string, QueryValue> = { limit: 100 };
  if (offset !== undefined) query.offset = offset;

  const data = await apiFetch(
    'GET',
    `/playlists/${encodeURIComponent(id)}/items`,
    { query, notOwnedOn403: true },
  );

  const tracks: Track[] = [];
  if (data && Array.isArray(data.items)) {
    for (const entry of data.items) {
      const raw = entry?.item ?? entry?.track ?? null;
      const t = mapTrack(raw);
      if (t) tracks.push(t);
    }
  }

  return { tracks, next: Boolean(data?.next) };
}

export async function getSavedTracks(
  offset?: number,
): Promise<{ tracks: Track[]; next: boolean }> {
  const query: Record<string, QueryValue> = { limit: 50 };
  if (offset !== undefined) query.offset = offset;

  const data = await apiFetch('GET', '/me/tracks', { query });

  const tracks: Track[] = [];
  if (data && Array.isArray(data.items)) {
    for (const entry of data.items) {
      const t = mapTrack(entry?.track);
      if (t) tracks.push(t);
    }
  }

  return { tracks, next: Boolean(data?.next) };
}

/** 接下來要播放的歌曲（Spotify 的播放佇列，不含目前這首）。 */
export async function getQueue(limit = 20): Promise<Track[]> {
  const data = await apiFetch('GET', '/me/player/queue');
  const tracks: Track[] = [];
  if (data && Array.isArray(data.queue)) {
    for (const item of data.queue) {
      const t = mapTrack(item);
      if (t) tracks.push(t);
      if (tracks.length >= limit) break;
    }
  }
  return tracks;
}

/** 把一首歌加到 Spotify 的播放佇列（真・隨機播放用來接續下一批）。 */
export async function addToQueue(uri: string, deviceId?: string): Promise<void> {
  await apiFetch('POST', '/me/player/queue', { query: { uri, device_id: deviceId } });
}

/**
 * 讀取整份清單的所有歌曲 URI（「已按讚的歌曲」或自己的歌單）。
 * 分頁讀到底；onProgress 回報目前讀到幾首。
 */
export async function getAllTrackUris(
  source: { kind: 'liked' } | { kind: 'playlist'; id: string },
  onProgress?: (loaded: number) => void,
): Promise<string[]> {
  const uris: string[] = [];
  for (let offset = 0, guard = 0; guard < 400; guard += 1) {
    const page =
      source.kind === 'liked' ? await getSavedTracks(offset) : await getPlaylistItems(source.id, offset);
    for (const t of page.tracks) if (t.uri.startsWith('spotify:track:')) uris.push(t.uri);
    onProgress?.(uris.length);
    if (!page.next || page.tracks.length === 0) break;
    offset += source.kind === 'liked' ? 50 : 100; // 與各自的 limit 相同（跳過的節目單集不影響分頁）
  }
  return uris;
}

/** 開關 Spotify 自己的隨機播放（真・隨機播放開始前要關掉） */
export async function setSpotifyShuffle(state: boolean, deviceId?: string): Promise<void> {
  await apiFetch('PUT', '/me/player/shuffle', { query: { state, device_id: deviceId } });
}
