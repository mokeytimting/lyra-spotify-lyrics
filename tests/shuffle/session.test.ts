import { beforeEach, expect, test, vi } from 'vitest';
import { TrueShuffle, type ShuffleDeps, type ShuffleInfo } from '../../src/shuffle/session';
import { createDeck, markPlayed, type DeckState } from '../../src/shuffle/deck';

const URIS = Array.from({ length: 12 }, (_, i) => `spotify:track:t${i}`);
const SRC = { kind: 'playlist' as const, id: 'p1', name: 'Mix' };

function makeDeps(over: Partial<ShuffleDeps> = {}) {
  const queued: string[] = [];
  const played: string[][] = [];
  const infos: (ShuffleInfo | null)[] = [];
  const status: (string | null)[] = [];
  const deps: ShuffleDeps = {
    fetchUris: vi.fn(async () => URIS.slice()),
    playUris: vi.fn(async (u: string[]) => {
      played.push(u.slice());
      return true;
    }),
    addToQueue: vi.fn(async (u: string) => {
      queued.push(u);
    }),
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    onChange: (i) => infos.push(i),
    onStatus: (m) => status.push(m),
    prepare: vi.fn(async () => undefined),
    ...over,
  };
  return { deps, queued, played, infos, status };
}

/** 依序把 Spotify 會播的歌送進 onTrack：先播 playUris 的那一批，再播補進佇列的歌 */
async function playThrough(s: TrueShuffle, env: ReturnType<typeof makeDeps>, count: number): Promise<string[]> {
  const heard: string[] = [];
  let batchIdx = 0;
  let queueIdx = 0;
  for (let i = 0; i < count; i += 1) {
    const batch = env.played[0] ?? [];
    let uri: string | undefined;
    // Spotify 會先播佇列中的歌，再播清單剩下的
    if (queueIdx < env.queued.length) uri = env.queued[queueIdx++];
    else uri = batch[batchIdx++];
    if (!uri) break;
    heard.push(uri);
    s.onTrack(uri);
    await vi.waitFor(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
  }
  return heard;
}

beforeEach(() => {
  vi.useRealTimers();
});

test('start：關掉 Spotify 隨機播放、播放本輪不重複的歌並回報進度', async () => {
  const env = makeDeps();
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  expect(env.deps.prepare).toHaveBeenCalled();
  expect(env.played).toHaveLength(1);
  const batch = env.played[0]!;
  expect(new Set(batch).size).toBe(batch.length);
  expect(batch.every((u) => URIS.includes(u))).toBe(true);
  expect(env.infos.at(-1)).toEqual({ name: 'Mix', played: 0, total: 12, round: 1 });
  expect(s.active()).toBe(true);
});

test('一整輪播完之前每首都不重複，之後進入第二輪也不重複', async () => {
  const env = makeDeps();
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  const heard = await playThrough(s, env, 24);
  expect(new Set(heard.slice(0, 12)).size).toBe(12);
  expect(heard.length).toBe(24);
  expect(new Set(heard.slice(12, 24)).size).toBe(12);
  expect(env.infos.at(-1)?.round).toBe(2);
});

test('只在播到排程最後一首時才補歌進佇列（避免插到清單前面）', async () => {
  const env = makeDeps();
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  const batch = env.played[0]!;
  for (let i = 0; i < batch.length - 1; i += 1) s.onTrack(batch[i]!);
  await Promise.resolve();
  expect(env.deps.addToQueue).not.toHaveBeenCalled();
  s.onTrack(batch[batch.length - 1]!);
  await vi.waitFor(() => expect(env.deps.addToQueue).toHaveBeenCalled());
});

test('播到清單以外的歌就結束真・隨機', async () => {
  const env = makeDeps();
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  s.onTrack('spotify:track:other');
  expect(s.active()).toBe(false);
  expect(env.infos.at(-1)).toBeNull();
});

test('沿用先前存下的洗牌進度', async () => {
  let saved: DeckState = createDeck('p1', URIS);
  saved = markPlayed(saved, saved.order[0]!);
  saved = markPlayed(saved, saved.order[1]!);
  const env = makeDeps({ load: vi.fn(async () => saved) });
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  expect(env.infos.at(-1)?.played).toBe(2);
  // 第一批不會包含已經播過的歌
  expect(env.played[0]).not.toContain(saved.order[0]);
  expect(env.played[0]).toHaveLength(10);
});

test('清單少於 2 首時提示並不播放', async () => {
  const env = makeDeps({ fetchUris: vi.fn(async () => ['spotify:track:only']) });
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  expect(s.active()).toBe(false);
  expect(env.deps.playUris).not.toHaveBeenCalled();
  expect(env.status.some((m) => m !== null && m.includes('太少'))).toBe(true);
});

test('Spotify 拒絕播放時不進入真・隨機並顯示失敗', async () => {
  const env = makeDeps({ playUris: vi.fn(async () => false) });
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  expect(s.active()).toBe(false);
  expect(env.status.at(-1)).toMatch(/失敗/);
});

test('stop 之後回報 null', async () => {
  const env = makeDeps();
  const s = new TrueShuffle(env.deps);
  await s.start(SRC);
  s.stop();
  expect(s.active()).toBe(false);
  expect(env.infos.at(-1)).toBeNull();
});
