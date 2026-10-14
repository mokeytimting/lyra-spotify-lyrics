/**
 * 歌詞畫面（計畫 Task 10）。
 *
 * 負責把 LRC 歌詞行渲染成 DOM、套用翻譯／假名標音／羅馬拼音、
 * 標示目前行並自動捲動，以及保存使用者的顯示偏好。
 * 只產生節點與 class，實際樣式由外部 CSS 決定。
 */

import type { LyricLine } from '../lyrics/lrc';

export interface LyricsViewOptions {
  showTranslation: boolean;
  showRomaji: boolean;
  offsetMs: number;
}

export type LyricsViewSongLang = import('../text/lang').SongLang;

const PREFS_KEY = 'spl.prefs';

/** 使用者手動捲動後，暫停自動捲動的時間（毫秒）。 */
const MANUAL_SCROLL_SUPPRESS_MS = 3000;

/** 目前行停留在可視區的比例。 */
const ACTIVE_LINE_VIEW_RATIO = 0.35;

/** setFurigana 允許保留的標籤。 */
const ALLOWED_HTML_TAGS = new Set(['RUBY', 'RT', 'RP']);

/** DOM nodeType：元素節點。 */
const ELEMENT_NODE = 1;

/** DOM nodeType：文字節點。 */
const TEXT_NODE = 3;

const DEFAULT_OPTIONS: LyricsViewOptions = {
  showTranslation: true,
  showRomaji: false,
  offsetMs: 0,
};

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function loadOptions(): LyricsViewOptions {
  const fallback: LyricsViewOptions = { ...DEFAULT_OPTIONS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;

    const record = parsed as Record<string, unknown>;
    return {
      showTranslation:
        typeof record.showTranslation === 'boolean'
          ? record.showTranslation
          : fallback.showTranslation,
      showRomaji:
        typeof record.showRomaji === 'boolean' ? record.showRomaji : fallback.showRomaji,
      offsetMs:
        typeof record.offsetMs === 'number' && Number.isFinite(record.offsetMs)
          ? record.offsetMs
          : fallback.offsetMs,
    };
  } catch {
    return fallback;
  }
}

/**
 * 遞迴清理節點：只保留 ruby / rt / rp，其餘元素拆掉（子節點保留原地），
 * 註解與其他非文字節點一律移除，保留的標籤會清掉所有屬性。
 */
function stripUnsafeNodes(node: Node): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      stripUnsafeNodes(el);
      if (ALLOWED_HTML_TAGS.has(el.tagName.toUpperCase())) {
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
      } else {
        while (el.firstChild !== null) {
          node.insertBefore(el.firstChild, el);
        }
        node.removeChild(el);
      }
    } else if (child.nodeType !== TEXT_NODE) {
      node.removeChild(child);
    }
  }
}

/** 把假名標音 HTML 清理成只含 ruby / rt / rp 與純文字的安全字串。 */
function sanitizeFurigana(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = doc.body;
  stripUnsafeNodes(container);
  return container.innerHTML;
}

/** 波浪動畫每一行錯開的時間 */
const WAVE_STEP_MS = 55;

export class LyricsView {
  private readonly root: HTMLElement;
  private readonly onSeek: (ms: number) => void;

  /** 目前的歌詞行（setLines 後才會更新）。 */
  private lines: LyricLine[] = [];

  /** 每一行對應的 .line 元素。 */
  private lineEls: HTMLDivElement[] = [];

  /** 每一行對應的 .orig 元素。 */
  private origEls: HTMLDivElement[] = [];

  /** 目前標示為 active 的行索引，-1 代表沒有。 */
  private activeIndex = -1;

  private options: LyricsViewOptions;

  private lastUserScrollAt: number | null = null;

  /** 最近一次 setLines 傳入的歌曲語言。 */
  songLang: LyricsViewSongLang = 'other';

  constructor(root: HTMLElement, onSeek: (ms: number) => void) {
    this.root = root;
    this.onSeek = onSeek;
    this.options = loadOptions();

    this.root.addEventListener('wheel', this.handleWheel, { passive: false });
    this.root.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.root.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.layout(true));
    }

    this.applyOptionClasses();
  }

  /**
   * 歌詞不用原生捲動：每一行各自用 transform 位移，並依與目前行的距離錯開開始時間，
   * 形成 Apple Music 那種由上往下的「波浪」彈簧動畫。
   * shift 是自動對齊目前行的位移，manual 是使用者用滾輪／手指額外拖動的量。
   */
  private shift = 0;
  private manual = 0;
  private manualTimer: ReturnType<typeof setTimeout> | null = null;
  private touchY: number | null = null;

  private readonly handleUserScroll = (): void => {
    this.lastUserScrollAt = nowMs();
  };

  private nudge(deltaY: number): void {
    this.handleUserScroll();
    this.manual -= deltaY;
    this.root.classList.add('manual');
    this.applyShift();
    if (this.manualTimer !== null) clearTimeout(this.manualTimer);
    // 停止捲動 3 秒後自動回到目前唱到的那一行
    this.manualTimer = setTimeout(() => {
      this.manualTimer = null;
      this.manual = 0;
      this.root.classList.remove('manual');
      this.layout(false);
    }, MANUAL_SCROLL_SUPPRESS_MS);
  }

  private readonly handleWheel = (event: Event): void => {
    const e = event as WheelEvent;
    if (typeof e.preventDefault === 'function' && typeof e.deltaY === 'number') e.preventDefault();
    this.nudge(typeof e.deltaY === 'number' ? e.deltaY : 0);
  };

  private readonly handleTouchStart = (event: Event): void => {
    const t = (event as TouchEvent).touches?.[0];
    this.touchY = t ? t.clientY : null;
  };

  private readonly handleTouchMove = (event: Event): void => {
    const t = (event as TouchEvent).touches?.[0];
    if (!t || this.touchY === null) {
      this.handleUserScroll();
      return;
    }
    this.nudge(this.touchY - t.clientY);
    this.touchY = t.clientY;
  };

  private applyShift(): void {
    this.root.style.setProperty('--shift', `${Math.round(this.shift + this.manual)}px`);
  }

  /** 依目前行重新計算位移；instant 時不播動畫（換歌、改變視窗大小）。 */
  private layout(instant: boolean): void {
    const valid =
      Number.isInteger(this.activeIndex) &&
      this.activeIndex >= 0 &&
      this.activeIndex < this.lineEls.length;
    const focus = valid ? this.activeIndex : 0;
    const target = this.lineEls[focus];
    if (!target) return;

    const viewHeight = typeof this.root.clientHeight === 'number' ? this.root.clientHeight : 0;
    const offsetTop = typeof target.offsetTop === 'number' ? target.offsetTop : 0;
    this.shift = viewHeight * ACTIVE_LINE_VIEW_RATIO - offsetTop;

    for (let i = 0; i < this.lineEls.length; i += 1) {
      // 目前行上一行先動，越往下越晚，最多錯開 9 個間隔
      const step = Math.min(Math.max(i - focus + 1, 0), 9);
      this.lineEls[i]?.style.setProperty('--delay', `${step * WAVE_STEP_MS}ms`);
    }

    if (instant) {
      this.root.classList.add('instant');
      this.applyShift();
      // 下一個畫面再恢復動畫，避免這次的位移被看到
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16);
      raf(() => raf(() => this.root.classList.remove('instant')));
    } else {
      this.applyShift();
    }
  }

  /** 清空並重建歌詞 DOM。 */
  setLines(lines: LyricLine[], songLang: LyricsViewSongLang): void {
    this.lines = Array.isArray(lines) ? lines.slice() : [];
    this.songLang = songLang;
    this.activeIndex = -1;
    this.lineEls = [];
    this.origEls = [];

    this.root.textContent = '';

    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lines[index];
      const lineEl = document.createElement('div');
      lineEl.className = 'line';
      lineEl.setAttribute('data-index', String(index));
      // 進場動畫的錯開順序（只錯開前 16 行，後面的直接出現）
      lineEl.style.setProperty('--i', String(Math.min(index, 16)));

      const origEl = document.createElement('div');
      origEl.className = 'orig';

      const text = line && typeof line.text === 'string' ? line.text : '';
      if (text.trim() === '') {
        origEl.textContent = '♪';
        lineEl.classList.add('gap');
      } else {
        origEl.textContent = text;
      }

      lineEl.appendChild(origEl);
      lineEl.addEventListener('click', () => {
        this.handleLineClick(index);
      });

      this.root.appendChild(lineEl);
      this.lineEls.push(lineEl);
      this.origEls.push(origEl);
    }
    // 新歌從頭開始顯示，不沿用上一首的位置
    this.root.scrollTop = 0;
    this.manual = 0;
    this.root.classList.remove('manual');
    this.layout(true);
  }

  /** 設定翻譯：非 null 的行建立／更新 .trans，null 的行移除 .trans。 */
  setTranslations(translations: (string | null)[]): void {
    for (let index = 0; index < this.lineEls.length; index += 1) {
      const value = Array.isArray(translations) ? translations[index] : null;
      this.setTextChild(index, 'trans', typeof value === 'string' ? value : null);
    }
  }

  /** 設定假名標音：非 null 的行以清理過的 HTML 覆寫 .orig 內容。 */
  setFurigana(html: (string | null)[]): void {
    for (let index = 0; index < this.origEls.length; index += 1) {
      const value = Array.isArray(html) ? html[index] : null;
      if (typeof value !== 'string') continue;

      const origEl = this.origEls[index];
      if (!origEl) continue;

      try {
        origEl.innerHTML = sanitizeFurigana(value);
      } catch {
        origEl.textContent = value;
      }
    }
  }

  /** 設定羅馬拼音：非 null 的行建立／更新 .romaji，null 的行移除 .romaji。 */
  setRomaji(romaji: (string | null)[]): void {
    for (let index = 0; index < this.lineEls.length; index += 1) {
      const value = Array.isArray(romaji) ? romaji[index] : null;
      this.setTextChild(index, 'romaji', typeof value === 'string' ? value : null);
    }
  }

  /** 標示目前行：目前行 .active，之前的行 .past，其餘兩者皆無。 */
  setActive(index: number): void {
    if (index === this.activeIndex) return;
    this.activeIndex = index;

    const valid =
      Number.isInteger(index) && index >= 0 && index < this.lineEls.length;

    for (let i = 0; i < this.lineEls.length; i += 1) {
      const el = this.lineEls[i];
      if (!el) continue;
      // 與目前行的距離：CSS 依此做由近到遠的模糊與淡出
      el.style.setProperty('--dist', String(Math.min(Math.abs(i - (valid ? index : -1)), 6)));
      if (valid && i === index) {
        el.classList.add('active');
        el.classList.remove('past');
      } else if (valid && i < index) {
        el.classList.add('past');
        el.classList.remove('active');
      } else {
        el.classList.remove('active');
        el.classList.remove('past');
      }
    }

    // 使用者剛手動捲動過就先不跟；回到第一句之前（前奏、拖回開頭）時對齊第一句
    if (this.userScrolledRecently()) return;
    this.layout(false);
  }

  /** 目前自動對齊的位移（px），測試與除錯用。 */
  getShift(): number {
    return this.shift + this.manual;
  }

  /** 合併顯示偏好、套用到 root 的 class，並寫回 localStorage。 */
  setOptions(
    o: Partial<{ showTranslation: boolean; showRomaji: boolean; offsetMs: number }>,
  ): void {
    if (o && typeof o === 'object') {
      if (typeof o.showTranslation === 'boolean') {
        this.options.showTranslation = o.showTranslation;
      }
      if (typeof o.showRomaji === 'boolean') {
        this.options.showRomaji = o.showRomaji;
      }
      if (typeof o.offsetMs === 'number' && Number.isFinite(o.offsetMs)) {
        this.options.offsetMs = o.offsetMs;
      }
    }

    this.applyOptionClasses();

    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.options));
    } catch {
      // 無法寫入時只影響下次啟動的偏好，不中斷畫面。
    }
  }

  getOptions(): LyricsViewOptions {
    return { ...this.options };
  }

  private handleLineClick(index: number): void {
    const line = this.lines[index];
    if (!line) return;
    this.onSeek(line.timeMs);
  }

  private findChild(lineEl: HTMLElement, className: string): HTMLElement | null {
    const children = Array.from(lineEl.children);
    for (const child of children) {
      if (child.classList.contains(className)) {
        return child as HTMLElement;
      }
    }
    return null;
  }

  /**
   * 建立／更新／移除某一行的文字子節點。
   * .romaji 會插在 .trans 之前，維持 .orig → .romaji → .trans 的順序。
   */
  private setTextChild(index: number, className: string, text: string | null): void {
    const lineEl = this.lineEls[index];
    if (!lineEl) return;

    const existing = this.findChild(lineEl, className);

    if (text === null) {
      if (existing) lineEl.removeChild(existing);
      return;
    }

    if (existing) {
      existing.textContent = text;
      return;
    }

    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;

    const transEl = className === 'romaji' ? this.findChild(lineEl, 'trans') : null;
    if (transEl) {
      lineEl.insertBefore(el, transEl);
    } else {
      lineEl.appendChild(el);
    }
  }

  private userScrolledRecently(): boolean {
    if (this.lastUserScrollAt === null) return false;
    return nowMs() - this.lastUserScrollAt < MANUAL_SCROLL_SUPPRESS_MS;
  }

  private applyOptionClasses(): void {
    this.root.classList.toggle('hide-trans', !this.options.showTranslation);
    this.root.classList.toggle('show-romaji', this.options.showRomaji);
  }
}
