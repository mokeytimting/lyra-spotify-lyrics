import { test, expect, vi } from 'vitest';

import { createTrackPipeline, type PipelineDeps } from '../src/app';
import type { LyricLine } from '../src/lyrics/lrc';
import type { Track } from '../src/spotify/types';

type Lang = import('../src/text/lang').SongLang;

type LyricsResult = { kind: 'synced'; lines: LyricLine[] } | { kind: 'none' };

function makeTrack(id: string): Track {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Song ${id}`,
    artists: ['Artist'],
    album: 'Album',
    durationMs: 200000,
    imageUrl: null,
  };
}

function synced(lines: LyricLine[]): LyricsResult {
  return { kind: 'synced', lines };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 讓所有已排入的 microtask / 已被喚醒的 promise 有機會完成。 */
async function flush(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

interface Rec {
  fetchLyricsCalls: Track[];
  setNoLyrics: boolean[];
  setLines: { lines: LyricLine[]; lang: Lang }[];
  setTranslations: (string | null)[][];
  setFurigana: (string | null)[][];
  setRomaji: (string | null)[][];
  onLangChange: (Lang | null)[];
  onTranslationError: unknown[];
  translateCalls: { trackId: string; lines: string[]; lang: Lang }[];
  furiganaInputs: string[];
  romajiInputs: string[];
  traditionalInputs: string[];
  langInputs: string[][];
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): { deps: PipelineDeps; rec: Rec } {
  const rec: Rec = {
    fetchLyricsCalls: [],
    setNoLyrics: [],
    setLines: [],
    setTranslations: [],
    setFurigana: [],
    setRomaji: [],
    onLangChange: [],
    onTranslationError: [],
    translateCalls: [],
    furiganaInputs: [],
    romajiInputs: [],
    traditionalInputs: [],
    langInputs: [],
  };

  const base: PipelineDeps = {
    async fetchLyrics(t: Track): Promise<LyricsResult> {
      rec.fetchLyricsCalls.push(t);
      return { kind: 'none' };
    },
    detectSongLang(lines: string[]): Lang {
      rec.langInputs.push(lines.slice());
      return 'en';
    },
    toTraditional(s: string): string {
      rec.traditionalInputs.push(s);
      return s;
    },
    async toFuriganaHtml(line: string): Promise<string> {
      rec.furiganaInputs.push(line);
      return `<ruby>${line}</ruby>`;
    },
    async toRomaji(line: string): Promise<string> {
      rec.romajiInputs.push(line);
      return `${line}romaji`;
    },
    async translateSong(trackId, lines, lang): Promise<(string | null)[]> {
      rec.translateCalls.push({ trackId, lines: lines.slice(), lang });
      return lines.map(() => null);
    },
    view: {
      setLines(lines: LyricLine[], lang: Lang): void {
        rec.setLines.push({ lines: lines.slice(), lang });
      },
      setTranslations(t: (string | null)[]): void {
        rec.setTranslations.push(t.slice());
      },
      setFurigana(h: (string | null)[]): void {
        rec.setFurigana.push(h.slice());
      },
      setRomaji(r: (string | null)[]): void {
        rec.setRomaji.push(r.slice());
      },
    },
    setNoLyrics(on: boolean): void {
      rec.setNoLyrics.push(on);
    },
    onLangChange(lang: Lang | null): void {
      rec.onLangChange.push(lang);
    },
    onTranslationError(e: unknown): void {
      rec.onTranslationError.push(e);
    },
  };

  return { deps: { ...base, ...overrides }, rec };
}

test('onTrack(null)：顯示無歌詞、清空歌詞行、語言為 null，且不查歌詞', async () => {
  const { deps, rec } = makeDeps();
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(null);
  await flush();

  expect(rec.setNoLyrics).toEqual([true]);
  expect(rec.onLangChange).toEqual([null]);
  expect(pipeline.lines()).toEqual([]);
  expect(rec.fetchLyricsCalls).toHaveLength(0);
});

test('fetchLyrics 回 none：顯示無歌詞且語言為 null', async () => {
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve({ kind: 'none' }),
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();

  expect(rec.setNoLyrics).toEqual([true]);
  expect(rec.onLangChange).toEqual([null]);
});

test('synced：以整首歌詞判斷語言，並依序設定無歌詞旗標、歌詞行與語言', async () => {
  const lines: LyricLine[] = [
    { timeMs: 0, text: 'hello' },
    { timeMs: 1000, text: 'world' },
  ];
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();

  expect(rec.langInputs).toEqual([['hello', 'world']]);
  expect(rec.setNoLyrics).toEqual([false]);
  expect(rec.setLines).toHaveLength(1);
  expect(rec.setLines[0]!.lines).toEqual(lines);
  expect(rec.setLines[0]!.lang).toBe('en');
  expect(rec.onLangChange).toEqual(['en']);
  expect(rec.traditionalInputs).toEqual([]);
});

test('中文歌：每一行的 text 都先經過 toTraditional 才交給 view', async () => {
  const lines: LyricLine[] = [
    { timeMs: 0, text: '后来' },
    { timeMs: 1000, text: '我们' },
  ];
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
    detectSongLang: () => 'zh',
    toTraditional: (s: string) => {
      rec.traditionalInputs.push(s);
      return `繁(${s})`;
    },
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();

  expect(rec.traditionalInputs).toEqual(['后来', '我们']);
  expect(rec.setLines).toHaveLength(1);
  expect(rec.setLines[0]!.lines).toEqual([
    { timeMs: 0, text: '繁(后来)' },
    { timeMs: 1000, text: '繁(我们)' },
  ]);
  expect(rec.onLangChange).toEqual(['zh']);
});

test('日文歌：空行不標音（給 null），其餘行做完假名與羅馬拼音後才設定', async () => {
  const lines: LyricLine[] = [
    { timeMs: 0, text: '夢' },
    { timeMs: 1000, text: '' },
    { timeMs: 2000, text: '花' },
  ];
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
    detectSongLang: () => 'ja',
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();

  expect(rec.furiganaInputs).toEqual(['夢', '花']);
  expect(rec.romajiInputs).toEqual(['夢', '花']);
  expect(rec.setFurigana).toHaveLength(1);
  expect(rec.setFurigana[0]).toEqual(['<ruby>夢</ruby>', null, '<ruby>花</ruby>']);
  expect(rec.setRomaji).toHaveLength(1);
  expect(rec.setRomaji[0]).toEqual(['夢romaji', null, '花romaji']);
  expect(rec.onLangChange).toEqual(['ja']);
});

test('日文標音失敗時靜默：onTrack 不會 reject', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const lines: LyricLine[] = [
      { timeMs: 0, text: '夢' },
      { timeMs: 1000, text: '花' },
    ];
    const { deps } = makeDeps({
      fetchLyrics: () => Promise.resolve(synced(lines)),
      detectSongLang: () => 'ja',
      toFuriganaHtml: (line: string) => {
        if (line === '花') {
          return Promise.reject(new Error('furigana failed'));
        }
        return Promise.resolve(`<ruby>${line}</ruby>`);
      },
    });
    const pipeline = createTrackPipeline(deps);

    await expect(pipeline.onTrack(makeTrack('A'))).resolves.toBeUndefined();
    await flush();
  } finally {
    warn.mockRestore();
  }
});

test('翻譯完成後呼叫 setTranslations，並把歌詞行與語言傳給 translateSong', async () => {
  const lines: LyricLine[] = [
    { timeMs: 0, text: 'hello' },
    { timeMs: 1000, text: 'world' },
  ];
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
    detectSongLang: () => 'en',
    translateSong: (trackId, texts, lang) => {
      rec.translateCalls.push({ trackId, lines: texts.slice(), lang });
      return Promise.resolve(['你好', null]);
    },
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();

  expect(rec.setTranslations).toHaveLength(1);
  expect(rec.setTranslations[0]).toEqual(['你好', null]);
  expect(rec.translateCalls).toHaveLength(1);
  expect(rec.translateCalls[0]!.trackId).toBe('A');
  expect(rec.translateCalls[0]!.lines).toEqual(['hello', 'world']);
  expect(rec.translateCalls[0]!.lang).toBe('en');
});

test('翻譯失敗時呼叫 onTranslationError，onTrack 不會 reject', async () => {
  const lines: LyricLine[] = [{ timeMs: 0, text: 'hello' }];
  const failure = new Error('translate failed');
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
    translateSong: () => Promise.reject(failure),
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();

  expect(rec.onTranslationError).toEqual([failure]);
});

test('translateSong 的 onUpgraded 在仍是同一首歌時套用翻譯', async () => {
  const lines: LyricLine[] = [{ timeMs: 0, text: 'hello' }];
  let upgraded: ((l: (string | null)[]) => void) | undefined;
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
    translateSong: (_trackId, texts, _lang, opts) => {
      upgraded = opts?.onUpgraded;
      return Promise.resolve(texts.map(() => null));
    },
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();
  expect(rec.setTranslations).toHaveLength(1);

  expect(typeof upgraded).toBe('function');
  upgraded?.(['升級翻譯']);
  expect(rec.setTranslations).toHaveLength(2);
  expect(rec.setTranslations[1]).toEqual(['升級翻譯']);
});

test('切歌後舊歌的 onUpgraded 不會套用翻譯', async () => {
  const lines: LyricLine[] = [{ timeMs: 0, text: 'hello' }];
  let upgradedA: ((l: (string | null)[]) => void) | undefined;
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
  });
  const withCapture: PipelineDeps = {
    ...deps,
    translateSong: (trackId, texts, lang, opts) => {
      if (trackId === 'A') {
        upgradedA = opts?.onUpgraded;
      }
      return deps.translateSong(trackId, texts, lang, opts);
    },
  };
  const pipeline = createTrackPipeline(withCapture);

  await pipeline.onTrack(makeTrack('A'));
  await flush();
  await pipeline.onTrack(makeTrack('B'));
  await flush();

  const before = rec.setTranslations.length;
  expect(typeof upgradedA).toBe('function');
  upgradedA?.(['舊歌升級翻譯']);
  expect(rec.setTranslations).toHaveLength(before);
});

test('切歌後舊歌的歌詞晚回來時，不會呼叫任何 view 方法，只顯示新歌的歌詞', async () => {
  const aLines: LyricLine[] = [{ timeMs: 0, text: 'A 歌詞' }];
  const bLines: LyricLine[] = [{ timeMs: 0, text: 'B 歌詞' }];
  const aDeferred = deferred<LyricsResult>();
  const { deps, rec } = makeDeps({
    fetchLyrics: (t) => (t.id === 'A' ? aDeferred.promise : Promise.resolve(synced(bLines))),
  });
  const pipeline = createTrackPipeline(deps);

  const pendingA = pipeline.onTrack(makeTrack('A'));
  await pipeline.onTrack(makeTrack('B'));
  await flush();

  aDeferred.resolve(synced(aLines));
  await pendingA;
  await flush();

  expect(rec.setLines).toHaveLength(1);
  expect(rec.setLines[0]!.lines).toEqual(bLines);
  expect(rec.setNoLyrics).toEqual([false]);
  expect(rec.onLangChange).toEqual(['en']);
});

test('切歌後舊歌的翻譯失敗不會呼叫 onTranslationError', async () => {
  const lines: LyricLine[] = [{ timeMs: 0, text: 'hello' }];
  const aTranslate = deferred<(string | null)[]>();
  const { deps, rec } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
    translateSong: (trackId) =>
      trackId === 'A' ? aTranslate.promise : Promise.resolve([null]),
  });
  const pipeline = createTrackPipeline(deps);

  const pendingA = pipeline.onTrack(makeTrack('A'));
  await flush();

  await pipeline.onTrack(makeTrack('B'));
  await flush();

  aTranslate.reject(new Error('translate failed'));
  await pendingA;
  await flush();

  expect(rec.onTranslationError).toEqual([]);
});

test('同一首歌重複 onTrack 只會查一次歌詞', async () => {
  const track = makeTrack('same');
  const { deps, rec } = makeDeps();
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(track);
  await flush();
  await pipeline.onTrack(track);
  await flush();

  expect(rec.fetchLyricsCalls).toHaveLength(1);
});

test('lines() 回傳目前歌曲的歌詞行', async () => {
  const lines: LyricLine[] = [
    { timeMs: 0, text: 'a' },
    { timeMs: 5000, text: 'b' },
  ];
  const { deps } = makeDeps({
    fetchLyrics: () => Promise.resolve(synced(lines)),
  });
  const pipeline = createTrackPipeline(deps);

  await pipeline.onTrack(makeTrack('A'));
  await flush();

  expect(pipeline.lines()).toEqual(lines);
});

test('isCurrent 只對最新 token 為 true，且切歌後 token 遞增', async () => {
  const { deps } = makeDeps();
  const pipeline = createTrackPipeline(deps);
  const candidates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const trueTokens = (): number[] => candidates.filter((n) => pipeline.isCurrent(n));

  await pipeline.onTrack(makeTrack('A'));
  await flush();
  const first = trueTokens();

  await pipeline.onTrack(makeTrack('B'));
  await flush();
  const second = trueTokens();

  expect(first).toHaveLength(1);
  expect(second).toHaveLength(1);
  expect(second[0]).toBe(first[0]! + 1);
  expect(pipeline.isCurrent(first[0]!)).toBe(false);
  expect(pipeline.isCurrent(second[0]!)).toBe(true);
});
