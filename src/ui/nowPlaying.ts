import type { PlaybackState } from '../spotify/types';
import { ICONS, iconButton, setIcon } from './icons';
import { defineStrings } from '../i18n';

const t = defineStrings({
  'zh-Hant': {
    noTrack: '沒有正在播放的歌曲',
    seekLabel: '播放進度',
    mute: '靜音',
    unmute: '取消靜音',
    volumeLabel: '音量',
    modeToggle: '切換播放模式',
    pip: '浮動歌詞視窗',
    prev: '上一首',
    play: '播放',
    pause: '暫停',
    next: '下一首',
    toggleTranslation: '顯示或隱藏翻譯',
    toggleRomaji: '顯示或隱藏羅馬拼音',
    queue: '待播清單',
    searchLibrary: '搜尋與歌單',
    modeWeb: '網頁播放',
    modeApp: 'App 播放',
    modeDetailWeb: '256 kbps',
    modeDetailApp: '高音質',
    modeCurrent: '目前：{mode}（點一下切換）',
    modeBadge: '{label} · {detail}',
    engineDeepl: 'DeepL 翻譯',
    engineChrome: 'Chrome 翻譯',
    engineAzure: 'Microsoft 翻譯',
    engineOpenai: 'AI 翻譯',
    shuffleTitle: '真・隨機播放中（點一下結束）',
    shuffleBadge: '真・隨機 · {progress}',
    shuffleBadgeRound: '真・隨機 · 第 {n} 輪 · {progress}',
  },
  'zh-Hans': {
    noTrack: '没有正在播放的歌曲',
    seekLabel: '播放进度',
    mute: '静音',
    unmute: '取消静音',
    volumeLabel: '音量',
    modeToggle: '切换播放模式',
    pip: '浮动歌词窗口',
    prev: '上一首',
    play: '播放',
    pause: '暂停',
    next: '下一首',
    toggleTranslation: '显示或隐藏翻译',
    toggleRomaji: '显示或隐藏罗马拼音',
    queue: '待播清单',
    searchLibrary: '搜索与歌单',
    modeWeb: '网页播放',
    modeApp: 'App 播放',
    modeDetailWeb: '256 kbps',
    modeDetailApp: '高音质',
    modeCurrent: '当前：{mode}（点一下切换）',
    modeBadge: '{label} · {detail}',
    engineDeepl: 'DeepL 翻译',
    engineChrome: 'Chrome 翻译',
    engineAzure: 'Microsoft 翻译',
    engineOpenai: 'AI 翻译',
    shuffleTitle: '真·随机播放中（点一下结束）',
    shuffleBadge: '真·随机 · {progress}',
    shuffleBadgeRound: '真·随机 · 第 {n} 轮 · {progress}',
  },
  en: {
    noTrack: 'Nothing is playing',
    seekLabel: 'Seek',
    mute: 'Mute',
    unmute: 'Unmute',
    volumeLabel: 'Volume',
    modeToggle: 'Toggle playback mode',
    pip: 'Floating lyrics window',
    prev: 'Previous',
    play: 'Play',
    pause: 'Pause',
    next: 'Next',
    toggleTranslation: 'Show or hide translation',
    toggleRomaji: 'Show or hide romaji',
    queue: 'Queue',
    searchLibrary: 'Search & Library',
    modeWeb: 'Web playback',
    modeApp: 'App playback',
    modeDetailWeb: '256 kbps',
    modeDetailApp: 'High quality',
    modeCurrent: 'Current: {mode} (click to toggle)',
    modeBadge: '{label} · {detail}',
    engineDeepl: 'DeepL translation',
    engineChrome: 'Chrome translation',
    engineAzure: 'Microsoft translation',
    engineOpenai: 'AI translation',
    shuffleTitle: 'True shuffle active (click to stop)',
    shuffleBadge: 'True shuffle · {progress}',
    shuffleBadgeRound: 'True shuffle · round {n} · {progress}',
  },
  ja: {
    noTrack: '再生中の曲はありません',
    seekLabel: '再生位置',
    mute: 'ミュート',
    unmute: 'ミュート解除',
    volumeLabel: '音量',
    modeToggle: '再生モード切替',
    pip: '歌詞のフローティングウィンドウ',
    prev: '前へ',
    play: '再生',
    pause: '一時停止',
    next: '次へ',
    toggleTranslation: '翻訳の表示・非表示',
    toggleRomaji: 'ローマ字の表示・非表示',
    queue: '再生待ち',
    searchLibrary: '検索とライブラリ',
    modeWeb: 'Web 再生',
    modeApp: 'App 再生',
    modeDetailWeb: '256 kbps',
    modeDetailApp: '高音質',
    modeCurrent: '現在：{mode}（クリックで切替）',
    modeBadge: '{label} · {detail}',
    engineDeepl: 'DeepL 翻訳',
    engineChrome: 'Chrome 翻訳',
    engineAzure: 'Microsoft 翻訳',
    engineOpenai: 'AI 翻訳',
    shuffleTitle: '真のシャッフル再生中（クリックで終了）',
    shuffleBadge: '真のシャッフル · {progress}',
    shuffleBadgeRound: '真のシャッフル · 第 {n} 周 · {progress}',
  },
  ko: {
    noTrack: '재생 중인 곡이 없습니다',
    seekLabel: '재생 위치',
    mute: '음소거',
    unmute: '음소거 해제',
    volumeLabel: '볼륨',
    modeToggle: '재생 모드 전환',
    pip: '가사 플로팅 창',
    prev: '이전',
    play: '재생',
    pause: '일시정지',
    next: '다음',
    toggleTranslation: '번역 표시/숨기기',
    toggleRomaji: '로마자 표시/숨기기',
    queue: '재생 대기열',
    searchLibrary: '검색 및 라이브러리',
    modeWeb: '웹 재생',
    modeApp: '앱 재생',
    modeDetailWeb: '256 kbps',
    modeDetailApp: '고음질',
    modeCurrent: '현재: {mode} (클릭하여 전환)',
    modeBadge: '{label} · {detail}',
    engineDeepl: 'DeepL 번역',
    engineChrome: 'Chrome 번역',
    engineAzure: 'Microsoft 번역',
    engineOpenai: 'AI 번역',
    shuffleTitle: '진정한 셔플 재생 중 (클릭하여 종료)',
    shuffleBadge: '진정한 셔플 · {progress}',
    shuffleBadgeRound: '진정한 셔플 · {n}회차 · {progress}',
  },
  es: {
    noTrack: 'No hay ninguna canción en reproducción',
    seekLabel: 'Posición de reproducción',
    mute: 'Silenciar',
    unmute: 'Activar sonido',
    volumeLabel: 'Volumen',
    modeToggle: 'Cambiar modo de reproducción',
    pip: 'Ventana flotante de letras',
    prev: 'Anterior',
    play: 'Reproducir',
    pause: 'Pausar',
    next: 'Siguiente',
    toggleTranslation: 'Mostrar u ocultar traducción',
    toggleRomaji: 'Mostrar u ocultar romaji',
    queue: 'Cola de reproducción',
    searchLibrary: 'Buscar y biblioteca',
    modeWeb: 'Reproducción web',
    modeApp: 'Reproducción en app',
    modeDetailWeb: '256 kbps',
    modeDetailApp: 'Alta calidad',
    modeCurrent: 'Actual: {mode} (clic para cambiar)',
    modeBadge: '{label} · {detail}',
    engineDeepl: 'Traducción DeepL',
    engineChrome: 'Traducción Chrome',
    engineAzure: 'Traducción Microsoft',
    engineOpenai: 'Traducción AI',
    shuffleTitle: 'Aleatorio real activo (clic para detener)',
    shuffleBadge: 'Aleatorio real · {progress}',
    shuffleBadgeRound: 'Aleatorio real · ronda {n} · {progress}',
  },
});

export interface NowPlayingHandlers {
  onTogglePlay(): void;
  onNext(): void;
  onPrev(): void;
  onSeek(ms: number): void;
  onVolume(pct: number): void;
  onModeToggle(): void;
  onToggleTranslation(): void;
  onToggleRomaji(): void;
  onOpenLibrary(): void;
  onToggleQueue(): void;
  onOpenPip(): void;
  onStopShuffle(): void;
}

export interface ShuffleBadgeInfo {
  played: number;
  total: number;
  round: number;
}

export type TranslationEngine = 'deepl' | 'chrome' | 'azure' | 'openai';

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** 將毫秒格式化為 m:ss；負數、NaN、Infinity 一律視為 0。 */
export function formatTime(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

const VOLUME_THROTTLE_MS = 150;

/**
 * 尚未收到播放狀態前 seek 的暫定上限。
 * update() 之後會被實際歌曲長度覆寫，這裡只避免把值鎖在 0。
 */
const INITIAL_SEEK_MAX = String(Number.MAX_SAFE_INTEGER);

/**
 * 封面下方的歌曲資訊與控制列，版面仿 Apple Music：
 * 歌名／歌手 — 專輯、狀態徽章、進度條（剩餘時間）、
 * 左側音量與播放模式、中間上一首／播放／下一首、右側翻譯／羅馬拼音／待播清單／搜尋。
 */
export class NowPlayingView {
  private readonly handlers: NowPlayingHandlers;

  private readonly titleEl: HTMLDivElement;
  private readonly artistEl: HTMLDivElement;
  private readonly modeBadge: HTMLSpanElement;
  private readonly engineBadge: HTMLSpanElement;
  private readonly shuffleBadge: HTMLButtonElement;
  private readonly pipBtn: HTMLButtonElement;
  private readonly seekEl: HTMLInputElement;
  private readonly curEl: HTMLSpanElement;
  private readonly durEl: HTMLSpanElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly modeBtn: HTMLButtonElement;
  private readonly transBtn: HTMLButtonElement;
  private readonly romajiBtn: HTMLButtonElement;
  private readonly queueBtn: HTMLButtonElement;
  private readonly volBtn: HTMLButtonElement;
  private readonly volumeEl: HTMLInputElement;

  private dragging = false;
  private lastVolumeAt = Number.NEGATIVE_INFINITY;
  private durationMs = 0;
  private volume = 100;
  private volumeBeforeMute = 100;

  constructor(root: HTMLElement, h: NowPlayingHandlers) {
    this.handlers = h;

    const meta = createEl('div', 'meta');
    this.titleEl = createEl('div', 'title', t('noTrack'));
    this.artistEl = createEl('div', 'artist', '');
    meta.append(this.titleEl, this.artistEl);

    const badges = createEl('div', 'badges');
    this.modeBadge = createEl('span', 'badge mode-badge');
    this.engineBadge = createEl('span', 'badge engine-badge');
    this.engineBadge.hidden = true;
    this.shuffleBadge = createEl('button', 'badge shuffle-badge');
    this.shuffleBadge.type = 'button';
    this.shuffleBadge.hidden = true;
    this.shuffleBadge.title = t('shuffleTitle');
    badges.append(this.modeBadge, this.engineBadge, this.shuffleBadge);

    const progress = createEl('div', 'progress');
    this.curEl = createEl('span', 'time cur', '0:00');
    this.seekEl = createEl('input', 'seek');
    this.seekEl.type = 'range';
    this.seekEl.min = '0';
    this.seekEl.step = '1';
    this.seekEl.max = INITIAL_SEEK_MAX;
    this.seekEl.value = '0';
    this.seekEl.setAttribute('aria-label', t('seekLabel'));
    this.durEl = createEl('span', 'time dur', '-0:00');
    progress.append(this.curEl, this.seekEl, this.durEl);

    const controls = createEl('div', 'controls');

    const left = createEl('div', 'ctl-group ctl-left');
    const volWrap = createEl('div', 'vol-wrap');
    this.volBtn = iconButton('vol-btn', 'volume', t('mute'));
    this.volumeEl = createEl('input', 'volume');
    this.volumeEl.type = 'range';
    this.volumeEl.min = '0';
    this.volumeEl.max = '100';
    this.volumeEl.value = '100';
    this.volumeEl.setAttribute('aria-label', t('volumeLabel'));
    volWrap.append(this.volBtn, this.volumeEl);
    this.modeBtn = iconButton('mode', 'web', t('modeToggle'));
    this.pipBtn = iconButton('pip-btn', 'pip', t('pip'));
    this.pipBtn.hidden = !('documentPictureInPicture' in globalThis);
    left.append(volWrap, this.modeBtn, this.pipBtn);

    const center = createEl('div', 'ctl-group ctl-center');
    const prevBtn = iconButton('prev', 'prev', t('prev'));
    this.playBtn = iconButton('play', 'play', t('play'));
    // 播放與暫停兩個圖示疊在一起，用 CSS 做切換動畫
    this.playBtn.innerHTML = `<span class="ico ico-play">${ICONS.play}</span><span class="ico ico-pause">${ICONS.pause}</span>`;
    const nextBtn = iconButton('next', 'next', t('next'));
    center.append(prevBtn, this.playBtn, nextBtn);

    const right = createEl('div', 'ctl-group ctl-right');
    this.transBtn = iconButton('tog-trans', 'translate', t('toggleTranslation'));
    this.romajiBtn = iconButton('tog-romaji', 'romaji', t('toggleRomaji'));
    this.romajiBtn.hidden = true;
    this.queueBtn = iconButton('queue-btn', 'queue', t('queue'));
    const openLibBtn = iconButton('open-lib', 'search', t('searchLibrary'));
    right.append(this.transBtn, this.romajiBtn, this.queueBtn, openLibBtn);

    controls.append(left, center, right);
    root.append(meta, badges, progress, controls);
    this.setMode('web');

    prevBtn.addEventListener('click', () => this.handlers.onPrev());
    this.playBtn.addEventListener('click', () => this.handlers.onTogglePlay());
    nextBtn.addEventListener('click', () => this.handlers.onNext());
    this.modeBtn.addEventListener('click', () => this.handlers.onModeToggle());
    this.transBtn.addEventListener('click', () => this.handlers.onToggleTranslation());
    this.romajiBtn.addEventListener('click', () => this.handlers.onToggleRomaji());
    this.queueBtn.addEventListener('click', () => this.handlers.onToggleQueue());
    openLibBtn.addEventListener('click', () => this.handlers.onOpenLibrary());
    this.pipBtn.addEventListener('click', () => this.handlers.onOpenPip());
    this.shuffleBadge.addEventListener('click', () => this.handlers.onStopShuffle());

    this.volBtn.addEventListener('click', () => {
      if (this.volume > 0) {
        this.volumeBeforeMute = this.volume;
        this.applyVolume(0, true);
      } else {
        this.applyVolume(this.volumeBeforeMute || 50, true);
      }
    });

    this.seekEl.addEventListener('pointerdown', () => {
      this.dragging = true;
    });
    const endDrag = (): void => {
      this.dragging = false;
    };
    root.ownerDocument.defaultView?.addEventListener('pointerup', endDrag);
    root.ownerDocument.defaultView?.addEventListener('pointercancel', endDrag);

    this.seekEl.addEventListener('input', () => {
      this.paintProgress(Number(this.seekEl.value));
    });
    this.seekEl.addEventListener('change', () => {
      this.dragging = false;
      this.handlers.onSeek(Number(this.seekEl.value));
    });

    this.volumeEl.addEventListener('input', () => {
      const pct = Number(this.volumeEl.value);
      this.volume = pct;
      this.paintVolume();
      const now = Date.now();
      if (now - this.lastVolumeAt < VOLUME_THROTTLE_MS) {
        return;
      }
      this.lastVolumeAt = now;
      this.handlers.onVolume(pct);
    });

    root.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== ' ') {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) {
        return;
      }
      event.preventDefault();
      this.handlers.onTogglePlay();
    });
  }

  update(state: PlaybackState | null): void {
    const track = state?.track ?? null;

    this.titleEl.textContent = track ? track.name : t('noTrack');
    this.titleEl.title = track ? track.name : '';
    const artists = track ? track.artists.join(', ') : '';
    this.artistEl.textContent = track && track.album ? `${artists} — ${track.album}` : artists;

    const playing = state?.isPlaying === true;
    this.playBtn.classList.toggle('playing', playing);
    this.playBtn.setAttribute('aria-label', playing ? t('pause') : t('play'));
    this.playBtn.title = playing ? t('pause') : t('play');

    const duration = track ? Math.max(0, Math.floor(track.durationMs)) : 0;
    this.durationMs = duration;
    this.seekEl.max = String(duration);

    this.updatePosition(state?.positionMs ?? 0);
  }

  updatePosition(ms: number): void {
    const safeMs = Number.isFinite(ms) ? ms : 0;
    this.curEl.textContent = formatTime(safeMs);
    this.durEl.textContent = `-${formatTime(this.durationMs - safeMs)}`;

    if (this.dragging) {
      return;
    }

    const max = Number(this.seekEl.max);
    const upper = Number.isFinite(max) && max > 0 ? max : 0;
    const clamped = Math.min(Math.max(Math.floor(safeMs), 0), upper);
    this.seekEl.value = String(clamped);
    this.paintProgress(clamped);
  }

  setMode(m: 'web' | 'app'): void {
    setIcon(this.modeBtn, m === 'app' ? 'app' : 'web');
    const modeLabel = t(m === 'app' ? 'modeApp' : 'modeWeb');
    const modeDetail = t(m === 'app' ? 'modeDetailApp' : 'modeDetailWeb');
    const label = t('modeCurrent', { mode: modeLabel });
    this.modeBtn.setAttribute('aria-label', label);
    this.modeBtn.title = label;
    this.modeBadge.innerHTML = `${ICONS[m === 'app' ? 'app' : 'web']}<span>${t('modeBadge', { label: modeLabel, detail: modeDetail })}</span>`;
    this.modeBadge.classList.remove('pop');
    void this.modeBadge.offsetWidth; // 重新觸發動畫
    this.modeBadge.classList.add('pop');
  }

  /** 顯示這首歌的翻譯來源；null 表示沒有翻譯（例如中文歌）。 */
  setEngine(engine: TranslationEngine | null): void {
    if (engine === null) {
      this.engineBadge.hidden = true;
      return;
    }
    this.engineBadge.hidden = false;
    const engineKey =
      engine === 'deepl'
        ? 'engineDeepl'
        : engine === 'chrome'
          ? 'engineChrome'
          : engine === 'azure'
            ? 'engineAzure'
            : 'engineOpenai';
    this.engineBadge.innerHTML = `${ICONS.translate}<span>${t(engineKey)}</span>`;
    this.engineBadge.classList.remove('pop');
    void this.engineBadge.offsetWidth;
    this.engineBadge.classList.add('pop');
  }

  setToggles(t: { translation: boolean; romaji: boolean; romajiAvailable: boolean }): void {
    this.transBtn.classList.toggle('on', t.translation);
    this.transBtn.setAttribute('aria-pressed', String(t.translation));
    this.romajiBtn.classList.toggle('on', t.romaji);
    this.romajiBtn.setAttribute('aria-pressed', String(t.romaji));
    this.romajiBtn.hidden = !t.romajiAvailable;
  }

  /** 真・隨機播放的進度；null 表示沒有在真・隨機播放 */
  setShuffle(info: ShuffleBadgeInfo | null): void {
    if (info === null) {
      this.shuffleBadge.hidden = true;
      return;
    }
    const wasHidden = this.shuffleBadge.hidden;
    this.shuffleBadge.hidden = false;
    const progress = `${info.played}/${info.total}`;
    const text =
      info.round > 1
        ? t('shuffleBadgeRound', { n: info.round, progress })
        : t('shuffleBadge', { progress });
    this.shuffleBadge.innerHTML = `${ICONS.shuffle}<span>${text}</span>`;
    if (wasHidden) {
      this.shuffleBadge.classList.remove('pop');
      void this.shuffleBadge.offsetWidth;
      this.shuffleBadge.classList.add('pop');
    }
  }

  setPipOpen(open: boolean): void {
    this.pipBtn.classList.toggle('on', open);
    this.pipBtn.setAttribute('aria-pressed', String(open));
  }

  setQueueOpen(open: boolean): void {
    this.queueBtn.classList.toggle('on', open);
    this.queueBtn.setAttribute('aria-pressed', String(open));
  }

  setVolume(pct: number): void {
    const safe = Number.isFinite(pct) ? Math.min(Math.max(Math.round(pct), 0), 100) : 0;
    this.applyVolume(safe, false);
  }

  private applyVolume(pct: number, notify: boolean): void {
    this.volume = pct;
    this.volumeEl.value = String(pct);
    this.paintVolume();
    if (notify) this.handlers.onVolume(pct);
  }

  private paintVolume(): void {
    this.volumeEl.style.setProperty('--fill', `${this.volume}%`);
    setIcon(this.volBtn, this.volume === 0 ? 'mute' : 'volume');
    this.volBtn.setAttribute('aria-label', this.volume === 0 ? t('unmute') : t('mute'));
  }

  private paintProgress(ms: number): void {
    const pct = this.durationMs > 0 ? Math.min(100, (ms / this.durationMs) * 100) : 0;
    this.seekEl.style.setProperty('--fill', `${pct}%`);
  }
}
