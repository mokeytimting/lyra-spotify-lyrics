/**
 * 浮在所有視窗最上層的歌詞小視窗（Document Picture-in-Picture）。
 */

import { defineStrings } from '../i18n';

const t = defineStrings({
  'zh-Hant': {
    nextLine: '下一句：{line}',
  },
  'zh-Hans': {
    nextLine: '下一句：{line}',
  },
  en: {
    nextLine: 'Next: {line}',
  },
  ja: {
    nextLine: '次の歌詞：{line}',
  },
  ko: {
    nextLine: '다음 가사: {line}',
  },
  es: {
    nextLine: 'Siguiente: {line}',
  },
});

/** update() 要顯示的資料。 */
export interface PipLyricsData {
  line: string | null;
  translation: string | null;
  next: string | null;
  title: string;
  artist: string;
}

interface DocumentPictureInPictureLike {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

const STYLE_TEXT = `
:root {
  --c1: #1db954;
  --c2: #191414;
  --c3: #535353;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
html,
body {
  height: 100%;
}
[hidden] {
  display: none !important;
}
body {
  margin: 0;
  overflow: hidden;
  color: #ffffff;
  font-family: -apple-system, 'PingFang TC', 'Noto Sans TC', 'Hiragino Sans', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  background-color: #101010;
  background-image:
    radial-gradient(circle at 18% 22%, var(--c1) 0%, rgba(0, 0, 0, 0) 62%),
    radial-gradient(circle at 82% 78%, var(--c2) 0%, rgba(0, 0, 0, 0) 62%),
    linear-gradient(130deg, var(--c3) 0%, var(--c1) 100%);
  background-repeat: no-repeat, no-repeat, no-repeat;
  background-size: 220% 220%, 220% 220%, 220% 220%;
  background-position: 0% 0%, 100% 100%, 50% 50%;
  animation: pip-drift 20s ease-in-out infinite alternate;
}
@keyframes pip-drift {
  from {
    background-position: 0% 0%, 100% 100%, 50% 50%;
  }
  to {
    background-position: 100% 100%, 0% 0%, 0% 100%;
  }
}
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  background: rgba(0, 0, 0, .35);
  pointer-events: none;
}
.pip {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px 24px 36px;
  text-align: center;
}
.pip-line {
  max-width: 100%;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.pip-trans {
  margin-top: 6px;
  max-width: 100%;
  font-size: 15px;
  opacity: .8;
  word-break: break-word;
}
.pip-next {
  margin-top: 8px;
  max-width: 100%;
  font-size: 13px;
  opacity: .45;
  word-break: break-word;
}
.pip-meta {
  position: absolute;
  right: 14px;
  bottom: 10px;
  max-width: 70%;
  font-size: 11px;
  opacity: .55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pip-line.in {
  animation: pip-line-in .35s ease-out;
}
.pip-trans.in {
  animation: pip-trans-in .35s ease-out;
}
@keyframes pip-line-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes pip-trans-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: .8;
    transform: translateY(0);
  }
}
`;

const DEFAULT_COLORS: [string, string, string] = ['#1db954', '#191414', '#535353'];

function getApi(): DocumentPictureInPictureLike | null {
  const holder = window as unknown as {
    documentPictureInPicture?: DocumentPictureInPictureLike | undefined;
  };
  return holder.documentPictureInPicture ?? null;
}

function restartAnimation(el: HTMLElement): void {
  el.classList.remove('in');
  void el.offsetWidth;
  el.classList.add('in');
}

export function pipSupported(): boolean {
  return 'documentPictureInPicture' in window;
}

export class PipLyrics {
  private readonly onClose: (() => void) | undefined;
  private win: Window | null = null;
  private pending: Promise<boolean> | null = null;
  private lineEl: HTMLElement | null = null;
  private transEl: HTMLElement | null = null;
  private nextEl: HTMLElement | null = null;
  private metaEl: HTMLElement | null = null;
  private data: PipLyricsData = { line: null, translation: null, next: null, title: '', artist: '' };
  private colors: [string, string, string] = [
    DEFAULT_COLORS[0],
    DEFAULT_COLORS[1],
    DEFAULT_COLORS[2],
  ];
  private lastLine: string | null = null;
  private hasLine = false;

  constructor(opts?: { onClose?: () => void }) {
    this.onClose = opts?.onClose;
  }

  isOpen(): boolean {
    return this.win !== null;
  }

  open(): Promise<boolean> {
    if (this.win !== null) return Promise.resolve(true);
    if (this.pending !== null) return this.pending;
    const p = this.requestOpen();
    this.pending = p;
    return p;
  }

  close(): void {
    const w = this.win;
    if (w === null) return;
    this.teardown();
    if (typeof w.close === 'function') w.close();
  }

  update(d: PipLyricsData): void {
    const lineChanged = !this.hasLine || this.lastLine !== d.line;
    this.data = {
      line: d.line,
      translation: d.translation,
      next: d.next,
      title: d.title,
      artist: d.artist,
    };
    if (this.win === null) return;
    this.render(lineChanged);
  }

  setColors(c: [string, string, string]): void {
    this.colors = [c[0], c[1], c[2]];
    if (this.win === null) return;
    this.applyColors();
  }

  private async requestOpen(): Promise<boolean> {
    try {
      if (!pipSupported()) return false;
      const api = getApi();
      if (api === null) return false;
      const pipWin = await api.requestWindow({ width: 460, height: 190 });
      this.build(pipWin);
      this.win = pipWin;
      if (typeof pipWin.addEventListener === 'function') {
        pipWin.addEventListener('pagehide', this.handlePageHide);
      }
      this.applyColors();
      this.render(true);
      return true;
    } catch {
      this.win = null;
      return false;
    } finally {
      this.pending = null;
    }
  }

  private build(pipWin: Window): void {
    const doc = pipWin.document;

    const style = doc.createElement('style');
    style.textContent = STYLE_TEXT;
    (doc.head ?? doc.documentElement).appendChild(style);

    const root = doc.createElement('div');
    root.className = 'pip';

    const lineEl = doc.createElement('div');
    lineEl.className = 'pip-line';
    const transEl = doc.createElement('div');
    transEl.className = 'pip-trans';
    const nextEl = doc.createElement('div');
    nextEl.className = 'pip-next';
    const metaEl = doc.createElement('div');
    metaEl.className = 'pip-meta';

    root.appendChild(lineEl);
    root.appendChild(transEl);
    root.appendChild(nextEl);
    root.appendChild(metaEl);

    (doc.body ?? doc.documentElement).appendChild(root);

    this.lineEl = lineEl;
    this.transEl = transEl;
    this.nextEl = nextEl;
    this.metaEl = metaEl;
  }

  private render(animate: boolean): void {
    const lineEl = this.lineEl;
    const transEl = this.transEl;
    const nextEl = this.nextEl;
    const metaEl = this.metaEl;
    if (lineEl === null || transEl === null || nextEl === null || metaEl === null) return;

    const d = this.data;

    lineEl.textContent = d.line ?? '♪';

    if (d.translation === null) {
      transEl.textContent = '';
      transEl.hidden = true;
    } else {
      transEl.textContent = d.translation;
      transEl.hidden = false;
    }

    if (d.next === null) {
      nextEl.textContent = '';
      nextEl.hidden = true;
    } else {
      nextEl.textContent = t('nextLine', { line: d.next });
      nextEl.hidden = false;
    }

    const metaParts = [d.title, d.artist].filter((part) => part.length > 0);
    metaEl.textContent = metaParts.join(' · ');

    this.lastLine = d.line;
    this.hasLine = true;

    if (animate) {
      restartAnimation(lineEl);
      restartAnimation(transEl);
    }
  }

  private applyColors(): void {
    const win = this.win;
    if (win === null) return;
    const rootStyle = win.document.documentElement.style;
    rootStyle.setProperty('--c1', this.colors[0]);
    rootStyle.setProperty('--c2', this.colors[1]);
    rootStyle.setProperty('--c3', this.colors[2]);
  }

  private readonly handlePageHide = (): void => {
    this.teardown();
  };

  private teardown(): void {
    if (this.win === null) return;
    this.win = null;
    this.lineEl = null;
    this.transEl = null;
    this.nextEl = null;
    this.metaEl = null;
    this.hasLine = false;
    const cb = this.onClose;
    if (cb) cb();
  }
}
