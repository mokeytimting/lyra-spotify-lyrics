// tests/shuffle/deck.test.ts
import { describe, expect, test } from 'vitest';
import type { DeckState } from '../../src/shuffle/deck';
import {
  shuffleArray,
  createDeck,
  syncDeck,
  upcoming,
  markPlayed,
  progress,
} from '../../src/shuffle/deck';

/** mulberry32：可重現的假亂數（回傳值介於 0（含）與 1（不含）之間） */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 永遠回傳 0：洗牌與插入位置都變得可預期 */
const zeroRng = (): number => 0;

function sorted(a: readonly string[]): string[] {
  return [...a].sort();
}

function makeDeck(order: string[], pos = 0, round = 1, nextOrder?: string[]): DeckState {
  const s: DeckState = { sourceId: 'src', order, pos, round, updatedAt: 0 };
  if (nextOrder !== undefined) s.nextOrder = nextOrder;
  return s;
}

/** 只比對規格明確定義的欄位（不比 updatedAt，因為規格未描述各函式如何維護它） */
function expectDeckUnchanged(actual: DeckState, expected: DeckState): void {
  expect(actual.sourceId).toBe(expected.sourceId);
  expect(actual.pos).toBe(expected.pos);
  expect(actual.round).toBe(expected.round);
  expect(actual.order).toEqual(expected.order);
  expect(actual.nextOrder).toEqual(expected.nextOrder);
}

// ------------------------- shuffleArray -------------------------

describe('shuffleArray', () => {
  test('回傳同一組元素的重排且不改動原陣列', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const snapshot = [...input];

    const out = shuffleArray(input, seededRng(42));

    expect(out).not.toBe(input);
    expect(sorted(out)).toEqual(sorted(snapshot));
    expect(input).toEqual(snapshot);
  });

  test('空陣列回傳空陣列', () => {
    expect(shuffleArray([], zeroRng)).toEqual([]);
  });

  test('單元素陣列回傳同內容', () => {
    expect(shuffleArray(['only'], zeroRng)).toEqual(['only']);
  });

  test('只依賴傳入的 rng（相同 rng 序列得到相同結果）', () => {
    const a = shuffleArray(['a', 'b', 'c', 'd', 'e', 'f'], seededRng(7));
    const b = shuffleArray(['a', 'b', 'c', 'd', 'e', 'f'], seededRng(7));

    expect(a).toEqual(b);
  });
});

// --------------------------- createDeck ---------------------------

describe('createDeck', () => {
  test('pos 為 0、round 為 1，order 是洗牌後的清單', () => {
    const s = createDeck('playlist:1', ['a', 'b', 'c'], seededRng(1), 1234);

    expect(s.sourceId).toBe('playlist:1');
    expect(s.pos).toBe(0);
    expect(s.round).toBe(1);
    expect(s.order).toHaveLength(3);
    expect(sorted(s.order)).toEqual(['a', 'b', 'c']);
  });

  test('先去除重複 URI 再洗牌', () => {
    const s = createDeck('t', ['a', 'b', 'a', 'c', 'b'], zeroRng, 0);

    expect(s.order).toHaveLength(3);
    expect(sorted(s.order)).toEqual(['a', 'b', 'c']);
  });

  test('空清單回傳空的 order', () => {
    const s = createDeck('t', [], zeroRng, 0);

    expect(s.order).toEqual([]);
    expect(s.pos).toBe(0);
    expect(s.round).toBe(1);
  });

  test('使用傳入的 now 作為 updatedAt', () => {
    const s = createDeck('t', ['a'], zeroRng, 555);

    expect(s.updatedAt).toBe(555);
  });

  test('不改動傳入的 uris 陣列', () => {
    const uris = ['a', 'b', 'c'];
    const snapshot = [...uris];

    createDeck('t', uris, seededRng(3), 0);

    expect(uris).toEqual(snapshot);
  });
});

// ---------------------------- syncDeck ----------------------------

describe('syncDeck', () => {
  test('移除已不在 latest 的歌，其他歌順序不變', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 0, 1);

    const out = syncDeck(s, ['a', 'b', 'd'], zeroRng, 0);

    expect(out.order).toEqual(['a', 'b', 'd']);
    expect(out.pos).toBe(0);
    expect(out.round).toBe(1);
  });

  test('移除已播區段中的歌時 pos 相應減少', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 2, 1);

    const out = syncDeck(s, ['b', 'c', 'd'], zeroRng, 0);

    expect(out.order).toEqual(['b', 'c', 'd']);
    expect(out.pos).toBe(1);
  });

  test('移除未播區段中的歌時 pos 不變', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 2, 1);

    const out = syncDeck(s, ['a', 'b', 'd'], zeroRng, 0);

    expect(out.order).toEqual(['a', 'b', 'd']);
    expect(out.pos).toBe(2);
  });

  test('已播區段中連續多首歌被移除時 pos 依移除數量減少', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 3, 1);

    const out = syncDeck(s, ['d'], zeroRng, 0);

    expect(out.order).toEqual(['d']);
    expect(out.pos).toBe(0);
  });

  test('已播區段整段被移除時 pos 為 0（不會變成負數或超長）', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 2, 1);

    const out = syncDeck(s, ['c', 'd'], zeroRng, 0);

    expect(out.order).toEqual(['c', 'd']);
    expect(out.pos).toBe(0);
  });

  test('新歌插入未播區段且 pos 不變、其他歌相對順序不變', () => {
    const s = makeDeck(['a', 'b', 'c'], 1, 1);

    const out = syncDeck(s, ['a', 'b', 'c', 'd', 'e'], zeroRng, 0);

    expect(out.pos).toBe(1);
    expect(out.order.slice(0, 1)).toEqual(['a']);
    expect(out.order).toHaveLength(5);
    expect(sorted(out.order)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out.order.indexOf('b')).toBeLessThan(out.order.indexOf('c'));
    expect(out.order.indexOf('d')).toBeGreaterThanOrEqual(out.pos);
    expect(out.order.indexOf('e')).toBeGreaterThanOrEqual(out.pos);
  });

  test('latest 完全沒變時 order 與 pos 不變', () => {
    const s = makeDeck(['a', 'b', 'c'], 2, 1);

    const out = syncDeck(s, ['a', 'b', 'c'], zeroRng, 0);

    expect(out.order).toEqual(['a', 'b', 'c']);
    expect(out.pos).toBe(2);
  });

  test('整份清單換掉時全部移除再全部插入', () => {
    const s = makeDeck(['a', 'b'], 2, 1);

    const out = syncDeck(s, ['c', 'd'], zeroRng, 0);

    expect(sorted(out.order)).toEqual(['c', 'd']);
    expect(out.pos).toBe(0);
  });

  test('不改動傳入的 state 與 latest 陣列', () => {
    const s = makeDeck(['a', 'b', 'c'], 2, 1);
    const expected = makeDeck(['a', 'b', 'c'], 2, 1);
    const latest = ['b', 'c', 'd'];
    const latestSnapshot = [...latest];

    syncDeck(s, latest, zeroRng, 0);

    expectDeckUnchanged(s, expected);
    expect(latest).toEqual(latestSnapshot);
  });
});

// ---------------------------- upcoming ----------------------------

describe('upcoming', () => {
  test('本輪剩餘足夠時回傳接下來 n 首且不推進 pos', () => {
    const s = makeDeck(['a', 'b', 'c', 'd', 'e'], 1, 1);

    const { uris, state } = upcoming(s, 3, zeroRng, 0);

    expect(uris).toEqual(['b', 'c', 'd']);
    expect(uris).toHaveLength(3);
    expect(state.pos).toBe(1);
    expect(state.round).toBe(1);
    expect(state.order).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('本輪剩餘不足時先給剩餘再接下一輪，且不切換輪次', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const s = makeDeck(order, 3, 1);

    const { uris, state } = upcoming(s, 5, seededRng(9), 0);

    expect(uris).toHaveLength(5);
    expect(uris.slice(0, 2)).toEqual(['d', 'e']);
    expect(state.order).toEqual(order);
    expect(state.pos).toBe(3);
    expect(state.round).toBe(1);

    const next = state.nextOrder as string[];
    expect(next).not.toBeUndefined();
    expect(next).toHaveLength(5);
    expect(sorted(next)).toEqual(sorted(order));
    expect(uris.slice(2)).toEqual(next.slice(0, 3));
  });

  test('產生下一輪時不改動傳入的 state', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const s = makeDeck(order, 3, 1);
    const expected = makeDeck(order, 3, 1);

    upcoming(s, 5, seededRng(11), 0);

    expectDeckUnchanged(s, expected);
  });

  test('新一輪不含重複，且上一輪最後 k 首不出現在新一輪前 k 個位置', () => {
    const order = [
      'u1', 'u2', 'u3', 'u4', 'u5', 'u6',
      'u7', 'u8', 'u9', 'u10', 'u11', 'u12',
    ];
    const s = makeDeck(order, 12, 1);

    const { uris, state } = upcoming(s, 5, seededRng(123), 0);
    const next = state.nextOrder as string[];

    expect(next).toHaveLength(12);
    expect(sorted(next)).toEqual(sorted(order));
    expect(uris).toEqual(next.slice(0, 5));

    const k = Math.min(10, Math.floor(12 / 3));
    const tailOfLastRound = order.slice(order.length - k);
    const headOfNextRound = next.slice(0, k);
    for (const uri of tailOfLastRound) {
      expect(
        headOfNextRound.includes(uri),
        `${uri} 是上一輪最後 ${k} 首，不應出現在新一輪前 ${k} 個位置`,
      ).toBe(false);
    }
  });

  test('已存在 nextOrder 時直接沿用，不重新洗牌', () => {
    const s = makeDeck(['a', 'b'], 2, 1, ['x', 'y', 'z']);

    const { uris, state } = upcoming(s, 2, seededRng(1), 0);

    expect(uris).toEqual(['x', 'y']);
    expect(state.nextOrder).toEqual(['x', 'y', 'z']);
    expect(state.pos).toBe(2);
    expect(state.round).toBe(1);
  });
});

// --------------------------- markPlayed ---------------------------

describe('markPlayed', () => {
  test('未播的歌與 order[pos] 交換後 pos 加一', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 1, 1);

    const out = markPlayed(s, 'd', 0);

    expect(out.order).toEqual(['a', 'd', 'c', 'b']);
    expect(out.pos).toBe(2);
    expect(out.round).toBe(1);
  });

  test('對 order[pos] 本身的歌只推進 pos', () => {
    const s = makeDeck(['a', 'b', 'c'], 1, 1);

    const out = markPlayed(s, 'b', 0);

    expect(out.order).toEqual(['a', 'b', 'c']);
    expect(out.pos).toBe(2);
  });

  test('已播區段的歌不改變 state', () => {
    const s = makeDeck(['a', 'b', 'c'], 2, 1);

    const out = markPlayed(s, 'a', 0);

    expectDeckUnchanged(out, s);
  });

  test('完全不在清單中的 uri 回傳原 state', () => {
    const s = makeDeck(['a', 'b'], 1, 1);

    const out = markPlayed(s, 'zzz', 0);

    expectDeckUnchanged(out, s);
  });

  test('uri 在 nextOrder 中時切換到下一輪並套用 markPlayed', () => {
    const s = makeDeck(['a', 'b'], 2, 1, ['c', 'd']);

    const out = markPlayed(s, 'c', 0);

    expect(out.round).toBe(2);
    expect(out.pos).toBe(1);
    expect(out.order[0]).toBe('c');
    expect(sorted(out.order)).toEqual(['c', 'd']);
    expect(out.nextOrder).toBeUndefined();
  });

  test('本輪已播完且沒有 nextOrder 時現場產生新一輪', () => {
    const s = makeDeck(['a', 'b', 'c'], 3, 1);

    const out = markPlayed(s, 'b', 0);

    expect(out.round).toBe(2);
    expect(out.order).toHaveLength(3);
    expect(sorted(out.order)).toEqual(['a', 'b', 'c']);
  });

  test('不改動傳入的 state', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 1, 1, ['x', 'y']);
    const expected = makeDeck(['a', 'b', 'c', 'd'], 1, 1, ['x', 'y']);

    markPlayed(s, 'd', 0);

    expectDeckUnchanged(s, expected);
  });
});

// ---------------------------- progress ----------------------------

describe('progress', () => {
  test('回傳已播數、總數與輪次', () => {
    const s = makeDeck(['a', 'b', 'c', 'd'], 3, 2);

    expect(progress(s)).toEqual({ played: 3, total: 4, round: 2 });
  });

  test('對空 deck 回傳 0/0/round', () => {
    const s = makeDeck([], 0, 1);

    expect(progress(s)).toEqual({ played: 0, total: 0, round: 1 });
  });
});
