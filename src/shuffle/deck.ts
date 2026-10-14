/**
 * src/shuffle/deck.ts
 *
 * 「真・隨機播放」的洗牌（deck）邏輯，全部都是純函式。
 *
 * 概念：把整份清單當成一副牌，每首歌都播過一次（一輪）之後才重新洗牌；
 * 重新洗牌時會避免「上一輪結尾播過的歌」馬上出現在新一輪開頭。
 *
 * 所有函式都不會修改傳入的物件，一律回傳新的物件／新的陣列。
 */

export interface DeckState {
  /** 對應的來源（例如播放清單 URI），清單換了就要重建 deck */
  sourceId: string;
  /** 本輪的播放順序（Spotify URI） */
  order: string[];
  /** order 中 [0, pos) 是本輪已播過的 */
  pos: number;
  /** 從 1 開始 */
  round: number;
  updatedAt: number;
  /** 下一輪的順序（由 upcoming 預先排好），進入下一輪時直接採用 */
  nextOrder?: string[];
}

/** 交換陣列中兩個位置的值（不改變長度）。 */
function swapAt<T>(arr: T[], i: number, j: number): void {
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}

/**
 * 從 rng 取得 [0, maxExclusive) 的整數。
 * rng 回傳非有限數或超出範圍的值時退化處理，保證結果一定是合法索引。
 */
function randInt(rng: () => number, maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const raw = rng();
  if (!Number.isFinite(raw)) return 0;
  const value = Math.floor(raw * maxExclusive);
  if (value < 0) return 0;
  if (value >= maxExclusive) return maxExclusive - 1;
  return value;
}

/** 依原順序去重複（保留第一次出現的位置）。 */
function uniqueList(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * 產生下一輪的順序：
 * 先把整份清單重新洗牌，再確保「上一輪最後播的 min(10, floor(total/3)) 首」
 * 不會出現在新一輪的前 min(10, floor(total/3)) 個位置（把它們調換到後面）。
 */
function buildNextOrder(prevOrder: readonly string[], rng: () => number): string[] {
  const total = prevOrder.length;
  const avoidCount = Math.min(10, Math.floor(total / 3));
  const order = shuffleArray(prevOrder, rng);
  if (avoidCount <= 0) return order;

  const forbidden = new Set<string>(prevOrder.slice(total - avoidCount));

  for (let i = 0; i < avoidCount; i += 1) {
    if (!forbidden.has(order[i])) continue;
    for (let j = avoidCount; j < total; j += 1) {
      if (forbidden.has(order[j])) continue;
      swapAt(order, i, j);
      break;
    }
  }
  return order;
}

/**
 * Fisher–Yates 洗牌。回傳新陣列，不改動傳入的陣列。
 */
export function shuffleArray<T>(a: readonly T[], rng: () => number = Math.random): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, i + 1);
    if (j === i) continue;
    swapAt(out, i, j);
  }
  return out;
}

/**
 * 建立一副新牌：先去重、再洗牌，pos = 0、round = 1。
 */
export function createDeck(
  sourceId: string,
  uris: string[],
  rng: () => number = Math.random,
  now: number = Date.now(),
): DeckState {
  const order = shuffleArray(uniqueList(uris), rng);
  return { sourceId, order, pos: 0, round: 1, updatedAt: now };
}

/**
 * 讓 deck 跟上最新的清單：
 * - order 中已不在 latest 的歌移除；若被移除的位置在 [0, pos) 內，pos 相應減少
 *   （以「原本的 pos」為基準計算，移除幾首就扣幾首）。
 * - latest 裡的新歌，隨機插入到本輪未播區段 [pos, order.length] 的任意位置。
 * - 其餘順序維持不變。
 * - 已排好的 nextOrder 只保留還在 latest 裡的歌（空的就不保留）。
 * - 不改動傳入的 s 與 latest。
 */
export function syncDeck(
  s: DeckState,
  latest: string[],
  rng: () => number = Math.random,
  now: number = Date.now(),
): DeckState {
  const latestList = uniqueList(latest);
  const latestSet = new Set<string>(latestList);

  const order: string[] = [];
  let removedPlayed = 0;
  for (const [i, uri] of s.order.entries()) {
    if (latestSet.has(uri)) {
      order.push(uri);
    } else if (i < s.pos) {
      removedPlayed += 1;
    }
  }
  let pos = s.pos - removedPlayed;
  if (pos < 0) pos = 0;
  if (pos > order.length) pos = order.length;

  const known = new Set<string>(order);
  for (const uri of latestList) {
    if (known.has(uri)) continue;
    const span = order.length - pos + 1;
    const at = pos + randInt(rng, span);
    order.splice(at, 0, uri);
    known.add(uri);
  }

  let nextOrder: string[] | undefined;
  if (s.nextOrder !== undefined) {
    const kept = s.nextOrder.filter((uri) => latestSet.has(uri));
    if (kept.length > 0) nextOrder = kept;
  }

  const state: DeckState = {
    sourceId: s.sourceId,
    order,
    pos,
    round: s.round,
    updatedAt: now,
  };
  if (nextOrder !== undefined) state.nextOrder = nextOrder;
  return state;
}

/**
 * 回傳接下來 n 首（不推進 pos）。
 * 若本輪剩下的不夠 n 首，先把本輪剩下的全部給出，再接上「下一輪」；
 * 下一輪的順序會記在 state.nextOrder，等 markPlayed 推進時直接採用。
 * 一次最多只會預排一輪（單一 nextOrder 欄位）。
 */
export function upcoming(
  s: DeckState,
  n: number,
  rng: () => number = Math.random,
  now: number = Date.now(),
): { uris: string[]; state: DeckState } {
  const uris: string[] = [];
  if (n <= 0 || s.order.length === 0) {
    return { uris, state: s };
  }

  const start = Math.max(0, Math.min(s.pos, s.order.length));
  const remaining = s.order.slice(start);
  const takeThisRound = Math.min(n, remaining.length);
  uris.push(...remaining.slice(0, takeThisRound));

  if (uris.length >= n) {
    return { uris, state: s };
  }

  let next = s.nextOrder !== undefined && s.nextOrder.length > 0 ? s.nextOrder : undefined;
  let created = false;
  if (next === undefined) {
    next = buildNextOrder(s.order, rng);
    created = true;
  }

  const stillNeed = n - uris.length;
  uris.push(...next.slice(0, stillNeed));

  if (!created) {
    return { uris, state: s };
  }

  const state: DeckState = {
    sourceId: s.sourceId,
    order: s.order,
    pos: s.pos,
    round: s.round,
    updatedAt: now,
    nextOrder: next,
  };
  return { uris, state };
}

/**
 * 標記某首歌已播放：
 * - uri 在本輪未播區段（index >= pos）：與 order[pos] 交換，pos + 1。
 * - uri 在本輪已播區段：不變。
 * - 本輪已播完，或 uri 不在本輪但在 nextOrder 中：進入下一輪
 *   （order = nextOrder 或現場重新洗牌、nextOrder 移除、round + 1、pos = 0），
 *   再對新的一輪做同樣的處理。
 * - uri 完全不在清單中：回傳原 state。
 */
export function markPlayed(s: DeckState, uri: string, now: number = Date.now()): DeckState {
  if (s.order.length === 0) return s;

  let order = s.order;
  let pos = s.pos;
  let round = s.round;
  let nextOrder = s.nextOrder !== undefined && s.nextOrder.length > 0 ? s.nextOrder : undefined;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const idx = order.indexOf(uri);
    const roundFinished = pos >= order.length;

    // (1) 本輪未播區段：交換到 pos 之後前進一格
    if (!roundFinished && idx >= pos) {
      const swapped = order.slice();
      swapAt(swapped, pos, idx);
      const state: DeckState = {
        sourceId: s.sourceId,
        order: swapped,
        pos: pos + 1,
        round,
        updatedAt: now,
      };
      if (nextOrder !== undefined) state.nextOrder = nextOrder;
      return state;
    }

    // (2) 本輪已播區段：不變
    if (!roundFinished && idx >= 0) {
      return s;
    }

    // (3) 本輪結束或 uri 不在本輪
    const inNextOrder = nextOrder !== undefined && nextOrder.indexOf(uri) >= 0;
    if (!roundFinished && !inNextOrder) {
      return s;
    }

    // 進入下一輪
    if (nextOrder !== undefined) {
      order = nextOrder;
      nextOrder = undefined;
    } else {
      order = buildNextOrder(order, Math.random);
    }
    round += 1;
    pos = 0;
  }

  return s;
}

/** 目前這一輪的進度。 */
export function progress(s: DeckState): { played: number; total: number; round: number } {
  return { played: s.pos, total: s.order.length, round: s.round };
}
