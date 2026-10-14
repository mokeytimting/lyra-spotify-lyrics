import { tApp } from '../i18n/appStrings';
import { createDeck, markPlayed, progress, syncDeck, upcoming, type DeckState } from './deck';

/** 可以做真・隨機播放的來源：只有「已按讚的歌曲」和自己的歌單（Spotify 不讓第三方讀別人的歌單曲目）。 */
export type ShuffleSource =
  | { kind: 'liked'; id: 'liked'; name: string }
  | { kind: 'playlist'; id: string; name: string };

export interface ShuffleInfo {
  name: string;
  played: number;
  total: number;
  round: number;
}

export interface ShuffleDeps {
  fetchUris(src: ShuffleSource, onProgress: (n: number) => void): Promise<string[]>;
  /** 回傳 false 表示 Spotify 拒絕播放（沒有裝置、沒有權限等） */
  playUris(uris: string[]): Promise<boolean | void>;
  /** 開始前的準備，例如關掉 Spotify 自己的隨機播放（否則會打亂順序或插入推薦歌曲） */
  prepare?(): Promise<void>;
  addToQueue(uri: string): Promise<void>;
  load(id: string): Promise<DeckState | null>;
  save(id: string, s: DeckState): Promise<void>;
  onChange(info: ShuffleInfo | null): void;
  onStatus(msg: string | null): void;
}

/** 一次交給 Spotify 播放的首數；之後用播放佇列一首首接上 */
const BATCH = 50;
/**
 * 播到排程的最後一首時才補：Spotify 的播放佇列會插在目前清單剩下的歌前面，
 * 太早補會讓補進去的歌先播，清單剩下的歌播完後就斷掉。
 */
const REFILL_WHEN_LEFT = 1;
/** 每次補進佇列的首數 */
const REFILL_COUNT = 5;

/**
 * 真・隨機播放：像一副牌，整份清單每首歌都播過一次才重新洗牌。
 * 洗牌狀態存在本機（data/shuffle/），跨天、關掉重開都接著播。
 */
export class TrueShuffle {
  private src: ShuffleSource | null = null;
  private deck: DeckState | null = null;
  /** 已經交給 Spotify 的歌（播放清單＋佇列），依順序 */
  private scheduled: string[] = [];
  /** scheduled 中目前播放到的位置 */
  private cursor = -1;
  private refilling = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ShuffleDeps) {}

  active(): boolean {
    return this.src !== null;
  }

  async start(src: ShuffleSource): Promise<void> {
    this.stop();
    this.deps.onStatus(tApp('shuffleLoading', { name: src.name }));
    try {
      const uris = await this.deps.fetchUris(src, (n) => this.deps.onStatus(tApp('shuffleLoadingN', { name: src.name, n })));
      if (uris.length < 2) {
        this.deps.onStatus(tApp('shuffleTooFew'));
        return;
      }
      const saved = await this.deps.load(src.id).catch(() => null);
      let deck = saved && Array.isArray(saved.order) ? syncDeck(saved, uris) : createDeck(src.id, uris);
      // 第一批只放本輪還沒播的歌（不跨到下一輪，避免同一批裡出現重複的歌）
      const p = progress(deck);
      const remaining = p.total - p.played;
      const next = upcoming(deck, Math.min(BATCH, remaining > 0 ? remaining : p.total));
      deck = next.state;
      await this.deps.prepare?.().catch(() => undefined);
      const ok = await this.deps.playUris(next.uris);
      if (ok === false) throw new Error('Spotify 拒絕播放');
      this.src = src;
      this.deck = deck;
      this.scheduled = next.uris.slice();
      this.cursor = -1;
      this.persist(true);
      this.deps.onStatus(null);
      this.emit();
    } catch (e) {
      console.warn('真・隨機播放啟動失敗：', e);
      this.stop();
      this.deps.onStatus(tApp('shuffleFailed'));
    }
  }

  stop(): void {
    if (this.src !== null) this.persist(true);
    this.src = null;
    this.deck = null;
    this.scheduled = [];
    this.deps.onChange(null);
  }

  /** 每次換歌時呼叫。播放清單以外的歌代表使用者改聽別的，結束真・隨機。 */
  onTrack(uri: string | null): void {
    if (this.src === null || this.deck === null || uri === null) return;
    const inDeck = this.deck.order.includes(uri) || (this.deck.nextOrder?.includes(uri) ?? false);
    if (!inDeck || !this.scheduled.includes(uri)) {
      this.stop();
      return;
    }
    this.deck = markPlayed(this.deck, uri);
    this.persist(false);
    this.emit();

    // 往後找：同一首可能在排程中出現兩次（本輪與下一輪），要找目前這一次
    const ahead = this.scheduled.indexOf(uri, this.cursor + 1);
    this.cursor = ahead >= 0 ? ahead : this.scheduled.lastIndexOf(uri);
    // 只保留最近的排程紀錄，避免無限變長
    if (this.cursor > BATCH * 2) {
      this.scheduled = this.scheduled.slice(this.cursor - BATCH);
      this.cursor = BATCH;
    }
    const left = this.scheduled.length - 1 - this.cursor;
    if (left < REFILL_WHEN_LEFT) void this.refill();
  }

  private async refill(): Promise<void> {
    if (this.refilling || this.deck === null) return;
    this.refilling = true;
    try {
      const want = upcoming(this.deck, BATCH);
      this.deck = want.state;
      // 只跳過「已排程但還沒播」的歌；已經播過的在新一輪可以再出現
      const skip = new Set(this.scheduled.slice(this.cursor + 1));
      const current = this.scheduled[this.cursor];
      if (current !== undefined) skip.add(current);
      const fresh: string[] = [];
      for (const u of want.uris) {
        if (skip.has(u)) continue;
        skip.add(u);
        fresh.push(u);
        if (fresh.length >= REFILL_COUNT) break;
      }
      for (const uri of fresh) {
        await this.deps.addToQueue(uri);
        this.scheduled.push(uri);
      }
    } catch (e) {
      console.warn('補充播放佇列失敗：', e);
    } finally {
      this.refilling = false;
    }
  }

  private emit(): void {
    if (this.src === null || this.deck === null) return;
    const p = progress(this.deck);
    this.deps.onChange({ name: this.src.name, played: p.played, total: p.total, round: p.round });
  }

  private persist(now: boolean): void {
    const src = this.src;
    const deck = this.deck;
    if (src === null || deck === null) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    const write = (): void => {
      this.saveTimer = null;
      void this.deps.save(src.id, deck).catch((e) => console.warn('儲存洗牌狀態失敗：', e));
    };
    if (now) write();
    else this.saveTimer = setTimeout(write, 2000);
  }
}
