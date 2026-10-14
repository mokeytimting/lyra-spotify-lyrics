/** 小於這個誤差才平滑修正，超過就視為跳轉直接採用 */
const SMOOTH_WINDOW_MS = 600;
/** 每次校正修正掉多少比例的誤差 */
const SMOOTH_GAIN = 0.4;

export class PlaybackClock {
  private positionMs = 0;
  private isPlaying = false;
  private durationMs = 0;
  private setAt: number | null = null;

  set(s: {
    positionMs: number;
    isPlaying: boolean;
    durationMs: number;
    at?: number;
    /** true 時不做平滑，直接採用（例如使用者拖曳進度） */
    hard?: boolean;
  }): void {
    const at = s.at ?? performance.now();
    if (
      s.hard !== true &&
      this.setAt !== null &&
      this.isPlaying &&
      s.isPlaying &&
      this.durationMs === s.durationMs
    ) {
      const predicted = this.now(at);
      const diff = s.positionMs - predicted;
      if (Math.abs(diff) < SMOOTH_WINDOW_MS) {
        // 每次只修正一部分誤差：網路抖動被平均掉，真正的偏移幾次校正後就會收斂
        this.positionMs = predicted + diff * SMOOTH_GAIN;
        this.setAt = at;
        return;
      }
    }
    this.positionMs = s.positionMs;
    this.isPlaying = s.isPlaying;
    this.durationMs = s.durationMs;
    this.setAt = at;
  }

  now(at?: number): number {
    if (this.setAt === null) {
      return 0;
    }
    const t = at ?? performance.now();
    let value = this.positionMs;
    if (this.isPlaying) {
      value += t - this.setAt;
    }
    if (value < 0) {
      value = 0;
    }
    if (this.durationMs > 0 && value > this.durationMs) {
      value = this.durationMs;
    }
    return value;
  }
}
