import type { Track } from '../spotify/types';
import { cleanTitle, parseLrc, type LyricLine } from './lrc';

const BASE = 'https://lrclib.net/api';
const CLIENT_HEADER = 'Lyra (https://github.com/mokeytimting/lyra-spotify-lyrics)';
const MAX_DURATION_DIFF_SEC = 2;
const NAME_ONLY_MAX_DURATION_DIFF_SEC = 1.5;
const MIN_NON_BLANK_LINES = 3;
const MAX_REQUESTS = 14;

export type LyricsResult =
  | { kind: 'synced'; lines: LyricLine[] }
  | { kind: 'none' };

export interface LyricsCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  durationSec: number;
  synced: boolean;
}

interface RawRecord {
  id?: unknown;
  trackName?: unknown;
  artistName?: unknown;
  albumName?: unknown;
  duration?: unknown;
  instrumental?: unknown;
  syncedLyrics?: unknown;
}

interface RequestState {
  seen: Set<string>;
  count: number;
}

function buildQuery(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  return search.toString();
}

async function requestJson(
  url: string,
  fetchImpl: typeof fetch,
  state: RequestState,
): Promise<unknown | null> {
  if (state.seen.has(url)) return null;
  if (state.count >= MAX_REQUESTS) return null;

  state.seen.add(url);
  state.count += 1;

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'Lrclib-Client': CLIENT_HEADER },
    });

    const status = typeof res.status === 'number' ? res.status : 0;
    if (status < 200 || status >= 300) return null;

    try {
      const data: unknown = await res.json();
      return data;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalize(s: string): string {
  if (typeof s !== 'string') return '';
  return s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

export function titleVariants(name: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed === '') return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  if (typeof name !== 'string') return out;

  push(name);
  push(cleanTitle(name));

  const dashIndex = name.indexOf(' - ');
  if (dashIndex > 0) {
    push(name.slice(0, dashIndex));
  }

  const pairs: Array<[string, string]> = [
    ['(', ')'],
    ['（', '）'],
    ['【', '】'],
    ['「', '」'],
  ];

  let outside = name;
  const insideValues: string[] = [];

  for (const [open, close] of pairs) {
    const pattern = new RegExp(
      `${escapeRegExp(open)}([^${escapeRegExp(close)}]*)${escapeRegExp(close)}`,
      'g',
    );

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(outside)) !== null) {
      insideValues.push(match[1] ?? '');
    }

    outside = outside.replace(pattern, ' ');
  }

  push(outside.replace(/\s+/g, ' '));

  for (const inner of insideValues) {
    push(inner);
  }

  return out;
}

function extractSynced(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as RawRecord;
  if (record.instrumental === true) return null;
  const synced = record.syncedLyrics;
  if (typeof synced !== 'string' || synced.trim() === '') return null;
  return synced;
}

function parseUsableLines(raw: unknown): LyricLine[] | null {
  const synced = extractSynced(raw);
  if (synced === null) return null;

  const lines = parseLrc(synced);
  let nonBlank = 0;
  for (const line of lines) {
    if (line.text.trim() !== '') nonBlank += 1;
  }
  if (nonBlank < MIN_NON_BLANK_LINES) return null;

  return lines;
}

function recordDurationSec(raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object') return null;
  const duration = (raw as RawRecord).duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return null;
  return duration;
}

function trackNameOf(raw: unknown): string {
  if (raw === null || typeof raw !== 'object') return '';
  const trackName = (raw as RawRecord).trackName;
  return typeof trackName === 'string' ? trackName : '';
}

function matchGet(raw: unknown, targetSec: number): LyricLine[] | null {
  const duration = recordDurationSec(raw);
  if (duration === null) return null;
  if (Math.abs(duration - targetSec) > MAX_DURATION_DIFF_SEC) return null;
  return parseUsableLines(raw);
}

function pickWithNameMatch(
  records: unknown[],
  nameForMatch: string,
  targetSec: number,
  tolerance: number,
): LyricLine[] | null {
  const normalizedTarget = normalize(nameForMatch);
  if (normalizedTarget === '') return null;

  let bestDiff = Number.POSITIVE_INFINITY;
  let bestLines: LyricLine[] | null = null;

  for (const record of records) {
    const duration = recordDurationSec(record);
    if (duration === null) continue;

    const diff = Math.abs(duration - targetSec);
    if (diff > tolerance) continue;

    const normalizedName = normalize(trackNameOf(record));
    if (normalizedName === '') continue;

    const matched =
      normalizedName === normalizedTarget ||
      normalizedName.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedName);
    if (!matched) continue;

    const lines = parseUsableLines(record);
    if (lines === null) continue;

    if (diff < bestDiff) {
      bestDiff = diff;
      bestLines = lines;
    }
  }

  return bestLines;
}

export async function fetchLyrics(
  t: Track,
  fetchImpl: typeof fetch = fetch,
  opts: { lrclibId?: number } = {},
): Promise<LyricsResult> {
  const state: RequestState = { seen: new Set<string>(), count: 0 };

  const album = typeof t.album === 'string' ? t.album : '';
  const durationSec = t.durationMs / 1000;
  const roundedDuration = String(Math.round(durationSec));

  const artists: string[] = Array.isArray(t.artists)
    ? t.artists.filter(
        (value): value is string => typeof value === 'string' && value !== '',
      )
    : [];
  const firstArtist = artists[0] ?? '';
  const cleaned = cleanTitle(t.name);

  // (0) 手動指定的 LRCLIB id：可用就直接回傳，不檢查長度。
  if (typeof opts.lrclibId === 'number' && Number.isFinite(opts.lrclibId)) {
    const idUrl = `${BASE}/get/${opts.lrclibId}`;
    const data = await requestJson(idUrl, fetchImpl, state);
    if (data !== null) {
      const lines = parseUsableLines(data);
      if (lines !== null) return { kind: 'synced', lines };
    }
  }

  const variants = titleVariants(t.name);

  // (1) /get：先帶 album_name，再逐個 titleVariant × 前三位歌手。
  for (const title of variants) {
    if (title === '') continue;
    for (const artist of artists.slice(0, 3)) {
      if (artist === '') continue;
      const url = `${BASE}/get?${buildQuery({
        track_name: title,
        artist_name: artist,
        album_name: album,
        duration: roundedDuration,
      })}`;
      const data = await requestJson(url, fetchImpl, state);
      if (data !== null) {
        const lines = matchGet(data, durationSec);
        if (lines !== null) return { kind: 'synced', lines };
      }
    }
  }

  // (1) 找不到時，再不帶 album_name 試一次原始標題＋第一位歌手。
  if (t.name !== '' && firstArtist !== '') {
    const url = `${BASE}/get?${buildQuery({
      track_name: t.name,
      artist_name: firstArtist,
      duration: roundedDuration,
    })}`;
    const data = await requestJson(url, fetchImpl, state);
    if (data !== null) {
      const lines = matchGet(data, durationSec);
      if (lines !== null) return { kind: 'synced', lines };
    }
  }

  // (2) /search：track_name + artist_name。
  if (cleaned !== '' && firstArtist !== '') {
    const url = `${BASE}/search?${buildQuery({
      track_name: cleaned,
      artist_name: firstArtist,
    })}`;
    const data = await requestJson(url, fetchImpl, state);
    if (Array.isArray(data)) {
      const list: unknown[] = data;
      const lines = pickWithNameMatch(
        list,
        cleaned,
        durationSec,
        MAX_DURATION_DIFF_SEC,
      );
      if (lines !== null) return { kind: 'synced', lines };
    }
  }

  // (3) /search：q = cleanTitle + 第一位歌手。
  if (cleaned !== '' && firstArtist !== '') {
    const url = `${BASE}/search?${buildQuery({
      q: `${cleaned} ${firstArtist}`,
    })}`;
    const data = await requestJson(url, fetchImpl, state);
    if (Array.isArray(data)) {
      const list: unknown[] = data;
      const lines = pickWithNameMatch(
        list,
        cleaned,
        durationSec,
        MAX_DURATION_DIFF_SEC,
      );
      if (lines !== null) return { kind: 'synced', lines };
    }
  }

  // (4) /search：只用歌名（處理 Spotify 與 LRCLIB 歌手名稱不同的情況）。
  for (const variant of variants) {
    if (variant === '') continue;
    const url = `${BASE}/search?${buildQuery({ track_name: variant })}`;
    const data = await requestJson(url, fetchImpl, state);
    if (Array.isArray(data)) {
      const list: unknown[] = data;
      const lines = pickWithNameMatch(
        list,
        variant,
        durationSec,
        NAME_ONLY_MAX_DURATION_DIFF_SEC,
      );
      if (lines !== null) return { kind: 'synced', lines };
    }
  }

  return { kind: 'none' };
}

export async function searchCandidates(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LyricsCandidate[]> {
  const url = `${BASE}/search?${buildQuery({ q: query })}`;

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'Lrclib-Client': CLIENT_HEADER },
    });

    const status = typeof res.status === 'number' ? res.status : 0;
    if (status < 200 || status >= 300) return [];

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return [];
    }

    if (!Array.isArray(data)) return [];

    const list: unknown[] = data;
    const candidates: LyricsCandidate[] = [];

    for (const entry of list) {
      if (entry === null || typeof entry !== 'object') continue;
      const record = entry as RawRecord;

      const id = record.id;
      if (typeof id !== 'number' || !Number.isFinite(id)) continue;

      const trackName =
        typeof record.trackName === 'string' ? record.trackName : '';
      const artistName =
        typeof record.artistName === 'string' ? record.artistName : '';
      const albumName =
        typeof record.albumName === 'string' ? record.albumName : '';

      const durationSec =
        typeof record.duration === 'number' && Number.isFinite(record.duration)
          ? record.duration
          : 0;

      const synced =
        typeof record.syncedLyrics === 'string' &&
        record.syncedLyrics.trim() !== '';

      candidates.push({
        id,
        trackName,
        artistName,
        albumName,
        durationSec,
        synced,
      });
    }

    candidates.sort((a, b) => {
      if (a.synced === b.synced) return 0;
      return a.synced ? -1 : 1;
    });

    return candidates.slice(0, 20);
  } catch {
    return [];
  }
}
