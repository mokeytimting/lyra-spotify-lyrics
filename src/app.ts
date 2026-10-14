import { tApp } from './i18n/appStrings';
/**
 * 應用主流程（計畫 Task 11）。
 *
 * 分成兩層：
 * - createTrackPipeline：可單元測試的換歌流程。以遞增的 trackToken 丟棄過期的
 *   非同步結果（歌詞、假名、翻譯），確保快速切歌時舊歌的資料不會蓋掉新歌。
 * - startApp：整合層。建立外殼、控制器、歌詞畫面、選歌面板並串起事件。
 */

import { CONFIG } from './config';
import { lineIndexAt } from './lyrics/lrc';
import type { LyricLine } from './lyrics/lrc';
import { fetchLyrics } from './lyrics/lrclib';
import { PlayerController, type ControllerDeps } from './playback/controller';
import { decideStartupMode, loadMode } from './playback/modes';
import type { Mode } from './playback/modes';
import { startPolling } from './playback/remote';
import { createWebPlayer } from './playback/webPlayer';
import {
  getDevices,
  getMyPlaylists,
  getPlaybackState,
  getPlaylistItems,
  getSavedTracks,
  next,
  NotOwnedError,
  pause,
  play,
  previous,
  QuotaExceededError,
  search,
  seek,
  setVolume,
  transferPlayback,
  getQueue,
  addToQueue,
  getAllTrackUris,
  setSpotifyShuffle,
} from './spotify/api';
import { getAccessToken } from './spotify/auth';
import type { PlaybackState, Track } from './spotify/types';
import { toSimplified, toTraditional } from './text/chinese';
import { getTargetLang } from './i18n';
import { toFuriganaHtml, toRomaji } from './text/japanese';
import { detectSongLang } from './text/lang';
import type { SongLang } from './text/lang';
import { activateChromeTranslator } from './translate/chrome';
import { NeedsUserActivationError, translateSong } from './translate/index';
import { setBackgroundArt, updateBackgroundFromImage } from './ui/background';
import { QueueView } from './ui/queueView';
import { LibraryPanel } from './ui/libraryPanel';
import { LyricsView } from './ui/lyricsView';
import { NowPlayingView } from './ui/nowPlaying';
import { createShell } from './ui/shell';
import { SettingsPanel } from './ui/settingsPanel';
import { LyricsPicker } from './ui/lyricsPicker';
import { PipLyrics } from './ui/pipLyrics';
import { iconButton, ICONS } from './ui/icons';
import { searchCandidates } from './lyrics/lrclib';
import { TrueShuffle } from './shuffle/session';
import type { DeckState } from './shuffle/deck';
import { loadSettings, loadStore, saveSettings, saveStore, testTranslation } from './settings/client';
import type { PublicSettings } from './settings/types';

function chromeTranslatorAvailable(): boolean {
  return 'Translator' in globalThis;
}

type Lang = SongLang;

export interface PipelineDeps {
  fetchLyrics(
    t: Track,
  ): Promise<{ kind: 'synced'; lines: LyricLine[] } | { kind: 'none' }>;
  detectSongLang(lines: string[]): Lang;
  toTraditional(s: string): string;
  toFuriganaHtml(line: string): Promise<string>;
  toRomaji(line: string): Promise<string>;
  translateSong(
    trackId: string,
    lines: string[],
    lang: Lang,
    opts?: {
      onUpgraded?: (l: (string | null)[]) => void;
      onEngine?: (engine: 'deepl' | 'chrome', fromCache: boolean) => void;
    },
  ): Promise<(string | null)[]>;
  /** 回報目前這首歌的翻譯來源；null 表示沒有翻譯。 */
  onEngine?(engine: 'deepl' | 'chrome' | null): void;
  view: {
    setLines(lines: LyricLine[], lang: Lang): void;
    setTranslations(t: (string | null)[]): void;
    setFurigana(h: (string | null)[]): void;
    setRomaji(r: (string | null)[]): void;
  };
  setNoLyrics(on: boolean): void;
  onLangChange(lang: Lang | null): void;
  onTranslationError(e: unknown): void;
}

/**
 * 建立換歌流程。
 *
 * 每個非同步步驟完成後都必須先確認 token 沒有被更新的換歌動作取代；
 * 不是最新的就直接丟棄結果，連 view 的方法都不呼叫。
 */
export function createTrackPipeline(d: PipelineDeps): {
  onTrack(t: Track | null): Promise<void>;
  reload(t: Track | null): Promise<void>;
  lines(): LyricLine[];
  isCurrent(token: number): boolean;
} {
  let token = 0;
  let currentId: string | null | undefined = undefined;
  let currentLines: LyricLine[] = [];

  function isCurrent(candidate: number): boolean {
    return candidate === token;
  }

  /** 日文歌：平行產生假名標音與羅馬拼音，兩者都完成且仍是最新才套用。 */
  async function applyJapanese(texts: string[], myToken: number): Promise<void> {
    try {
      const [furigana, romaji] = await Promise.all([
        Promise.all(
          texts.map(async (text): Promise<string | null> => {
            if (typeof text !== 'string' || text.trim() === '') return null;
            try {
              return await d.toFuriganaHtml(text);
            } catch (e) {
              console.warn('產生假名標音失敗：', e);
              return null;
            }
          }),
        ),
        Promise.all(
          texts.map(async (text): Promise<string | null> => {
            if (typeof text !== 'string' || text.trim() === '') return null;
            try {
              return await d.toRomaji(text);
            } catch (e) {
              console.warn('產生羅馬拼音失敗：', e);
              return null;
            }
          }),
        ),
      ]);

      if (!isCurrent(myToken)) return;
      d.view.setFurigana(furigana);
      d.view.setRomaji(romaji);
    } catch (e) {
      console.warn('日文標音流程失敗：', e);
    }
  }

  /** 翻譯：DeepL 升級結果與主要結果都要先確認 token 仍是最新。 */
  async function applyTranslation(
    trackId: string,
    texts: string[],
    lang: Lang,
    myToken: number,
  ): Promise<void> {
    try {
      const result = await d.translateSong(trackId, texts, lang, {
        onUpgraded: (upgraded) => {
          if (isCurrent(myToken)) {
            d.view.setTranslations(upgraded);
          }
        },
        onEngine: (engine) => {
          if (isCurrent(myToken)) d.onEngine?.(engine);
        },
      });
      if (!isCurrent(myToken)) return;
      d.view.setTranslations(result);
    } catch (e) {
      if (!isCurrent(myToken)) return;
      d.onTranslationError(e);
    }
  }

  async function onTrack(t: Track | null): Promise<void> {
    const id = t === null ? null : t.id;
    if (id === currentId) return;

    currentId = id;
    token += 1;
    d.onEngine?.(null);
    const myToken = token;

    if (t === null) {
      currentLines = [];
      d.setNoLyrics(true);
      d.onLangChange(null);
      return;
    }

    let result: { kind: 'synced'; lines: LyricLine[] } | { kind: 'none' };
    try {
      result = await d.fetchLyrics(t);
    } catch (e) {
      console.warn('取得歌詞失敗：', e);
      if (!isCurrent(myToken)) return;
      currentLines = [];
      d.setNoLyrics(true);
      d.onLangChange(null);
      return;
    }

    if (!isCurrent(myToken)) return;

    if (result.kind === 'none') {
      currentLines = [];
      d.setNoLyrics(true);
      d.onLangChange(null);
      return;
    }

    const rawLines = Array.isArray(result.lines) ? result.lines : [];
    const texts = rawLines.map((line) => (typeof line.text === 'string' ? line.text : ''));
    const lang = d.detectSongLang(texts);

    let lines: LyricLine[] = rawLines;
    if (lang === 'zh') {
      lines = rawLines.map((line) => ({
        timeMs: line.timeMs,
        text: d.toTraditional(typeof line.text === 'string' ? line.text : ''),
      }));
    }

    currentLines = lines;
    d.setNoLyrics(false);
    d.view.setLines(lines, lang);
    d.onLangChange(lang);

    const tasks: Promise<void>[] = [];
    if (lang === 'ja') {
      tasks.push(applyJapanese(texts, myToken));
    }
    tasks.push(applyTranslation(t.id, texts, lang, myToken));
    await Promise.all(tasks);
  }

  return {
    onTrack,
    /** 強制重新載入（例如手動指定歌詞之後） */
    reload: (t: Track | null) => {
      currentId = undefined;
      return onTrack(t);
    },
    lines: () => currentLines,
    isCurrent,
  };
}

/**
 * 整合層：建立整個畫面並啟動播放流程。
 */
export async function startApp(root: HTMLElement, initialSettings: PublicSettings): Promise<void> {
  const shell = createShell(root);
  let settings = initialSettings;
  let currentTrack: Track | null = null;
  let currentTranslations: (string | null)[] = [];

  // ---- 設定（右上角齒輪） ----
  const settingsPanel = new SettingsPanel(
    shell.settingsRoot,
    {
      load: loadSettings,
      save: saveSettings,
      test: testTranslation,
      redirectUri: CONFIG.redirectUri,
      chromeTranslatorAvailable,
    },
    {
      onSaved: (next) => {
        const engineChanged = next.translation.engine !== settings.translation.engine;
        const clientChanged = next.spotifyClientId !== settings.spotifyClientId;
        settings = next;
        if (clientChanged) {
          location.reload();
          return;
        }
        if (engineChanged) void retranslateCurrent(true);
      },
    },
  );
  shell.settingsRoot.querySelector('.set-close')?.insertAdjacentHTML('afterbegin', ICONS.close);
  const gear = iconButton('settings-btn', 'gear', tApp('settings'));
  gear.addEventListener('click', () => void settingsPanel.open('normal'));
  shell.stage.appendChild(gear);

  // ---- 手動搜尋歌詞（找不到同步歌詞時） ----
  const picker = new LyricsPicker(shell.pickerRoot, {
    search: (q) => searchCandidates(q),
    onPick: async (id) => {
      if (!currentTrack) return;
      await saveStore('lyrics-map', currentTrack.id, { lrclibId: id });
      await pipeline.reload(currentTrack);
    },
  });
  shell.pickerRoot.querySelector('.picker-close')?.insertAdjacentHTML('afterbegin', ICONS.close);
  const findLyrics = document.createElement('button');
  findLyrics.type = 'button';
  findLyrics.className = 'find-lyrics';
  findLyrics.innerHTML = `${ICONS.search}<span>${tApp('findLyrics')}</span>`;
  findLyrics.addEventListener('click', () => {
    if (!currentTrack) return;
    picker.open(`${currentTrack.name} ${currentTrack.artists[0] ?? ''}`.trim(), currentTrack.durationMs / 1000);
  });
  shell.nowPlayingRoot.after(findLyrics);

  // ---- 浮動歌詞視窗 ----
  const pip = new PipLyrics({ onClose: () => nowPlaying.setPipOpen(false) });
  function pipUpdate(index: number): void {
    const lines = pipeline.lines();
    const line = index >= 0 ? lines[index]?.text ?? null : null;
    let nextLine: string | null = null;
    for (let i = index + 1; i < lines.length; i += 1) {
      const t = lines[i]?.text ?? '';
      if (t.trim()) {
        nextLine = t;
        break;
      }
    }
    pip.update({
      line: line && line.trim() ? line : null,
      translation:
        index >= 0 && lyricsView.getOptions().showTranslation ? currentTranslations[index] ?? null : null,
      next: nextLine,
      title: currentTrack?.name ?? '',
      artist: currentTrack?.artists.join(', ') ?? '',
    });
  }
  function pipColors(): void {
    const cs = getComputedStyle(document.documentElement);
    const c = [1, 2, 3].map((i) => cs.getPropertyValue(`--c${i}`).trim() || '#333');
    pip.setColors([c[0]!, c[1]!, c[2]!]);
  }

  // ---- 真・隨機播放 ----
  const shuffle = new TrueShuffle({
    fetchUris: (src, onProgress) =>
      getAllTrackUris(src.kind === 'liked' ? { kind: 'liked' } : { kind: 'playlist', id: src.id }, onProgress),
    prepare: () => setSpotifyShuffle(false),
    playUris: async (uris) => {
      await ensureActivated();
      return (await controller?.playUris(uris)) ?? false;
    },
    addToQueue: (uri) => addToQueue(uri),
    load: (id) => loadStore<DeckState>('shuffle', id),
    save: (id, s) => saveStore('shuffle', id, s),
    onChange: (info) => nowPlaying.setShuffle(info),
    onStatus: (msg) => (msg ? shell.showNotice(msg) : shell.hideNotice()),
  });

  let controller: PlayerController | null = null;
  let webPlayer: Awaited<ReturnType<typeof createWebPlayer>> | null = null;
  let activated = false;
  let lastCoverUrl: string | null = null;
  let lastActiveIndex = -2;
  let currentSongLang: SongLang | null = null;

  const lyricsView = new LyricsView(shell.lyricsRoot, (ms) => {
    void controller?.seek(ms);
  });

  async function ensureActivated(): Promise<void> {
    if (activated || webPlayer === null) return;
    activated = true;
    try {
      await webPlayer.activate();
    } catch (e) {
      console.warn('啟用網頁播放器失敗：', e);
    }
  }

  function syncToggles(): void {
    const options = lyricsView.getOptions();
    nowPlaying.setToggles({
      translation: options.showTranslation,
      romaji: options.showRomaji,
      romajiAvailable: currentSongLang === 'ja',
    });
  }

  async function handleModeToggle(): Promise<void> {
    await ensureActivated();
    if (controller === null) return;
    const nextMode: Mode = controller.mode === 'app' ? 'web' : 'app';
    await controller.setMode(nextMode);
  }

  let library: LibraryPanel | null = null;

  async function handleTogglePlay(): Promise<void> {
    await ensureActivated();
    await controller?.togglePlay();
  }

  const nowPlaying = new NowPlayingView(shell.nowPlayingRoot, {
    onTogglePlay: () => {
      void handleTogglePlay();
    },
    onNext: () => {
      void controller?.next();
    },
    onPrev: () => {
      void controller?.prev();
    },
    onSeek: (ms: number) => {
      void controller?.seek(ms);
    },
    onVolume: (pct: number) => {
      void controller?.setVolume(pct);
    },
    onModeToggle: () => {
      void handleModeToggle();
    },
    onToggleTranslation: () => {
      lyricsView.setOptions({ showTranslation: !lyricsView.getOptions().showTranslation });
      syncToggles();
      if (pip.isOpen()) pipUpdate(lastActiveIndex);
    },
    onToggleRomaji: () => {
      lyricsView.setOptions({ showRomaji: !lyricsView.getOptions().showRomaji });
      syncToggles();
    },
    onOpenLibrary: () => {
      library?.toggle();
    },
    onToggleQueue: () => {
      setQueueOpen(!queueOpen);
    },
    onOpenPip: () => {
      if (pip.isOpen()) {
        pip.close();
        nowPlaying.setPipOpen(false);
        return;
      }
      void pip.open().then((ok) => {
        nowPlaying.setPipOpen(ok);
        if (ok) {
          pipColors();
          pipUpdate(lastActiveIndex);
        }
      });
    },
    onStopShuffle: () => shuffle.stop(),
  });

  const queueView = new QueueView(shell.queueRoot);
  let queueOpen = false;
  let queueToken = 0;

  async function refreshQueue(): Promise<void> {
    const my = ++queueToken;
    queueView.setLoading();
    try {
      const tracks = await getQueue();
      if (my === queueToken) queueView.setTracks(tracks);
    } catch (e) {
      console.warn('取得待播清單失敗：', e);
      if (my === queueToken) queueView.setError();
    }
  }

  function setQueueOpen(open: boolean): void {
    queueOpen = open;
    shell.setQueueOpen(open);
    nowPlaying.setQueueOpen(open);
    if (open) void refreshQueue();
  }

  async function retranslateCurrent(force = false): Promise<void> {
    if (controller === null) return;
    const track = controller.state?.track ?? null;
    if (track === null) return;

    const lines = pipeline.lines();
    if (lines.length === 0) return;

    const texts = lines.map((line) => (typeof line.text === 'string' ? line.text : ''));
    try {
      const result = await translateSong(track.id, texts, currentSongLang ?? 'other', {
        force,
        onEngine: (engine) => nowPlaying.setEngine(engine),
      });
      currentTranslations = result;
      if (pip.isOpen()) pipUpdate(lastActiveIndex);
      const still = controller.state?.track ?? null;
      if (still !== null && still.id === track.id) {
        lyricsView.setTranslations(result);
      }
    } catch {
      shell.showNotice(tApp('translateUnavailable'));
      window.setTimeout(() => {
        shell.hideNotice();
      }, 5000);
    }
  }

  function handleTranslationError(e: unknown): void {
    if (e instanceof NeedsUserActivationError) {
      shell.showNotice(tApp('needChromeModel'), [
        {
          label: tApp('enableTranslation'),
          onClick: () => {
            void (async () => {
              try {
                await activateChromeTranslator(
                  e.sourceLanguage,
                  (ratio) => {
                    shell.showNotice(tApp('downloadingModel', { pct: Math.round(ratio * 100) }));
                  },
                  getTargetLang(),
                );
                shell.hideNotice();
                await retranslateCurrent();
              } catch {
                shell.showNotice(tApp('translateUnavailable'));
                window.setTimeout(() => {
                  shell.hideNotice();
                }, 5000);
              }
            })();
          },
        },
      ]);
      return;
    }

    shell.showNotice(tApp('translateUnavailable'));
    window.setTimeout(() => {
      shell.hideNotice();
    }, 5000);
  }

  const pipeline = createTrackPipeline({
    fetchLyrics: async (t) => {
      const mapped = await loadStore<{ lrclibId?: number }>('lyrics-map', t.id).catch(() => null);
      const lrclibId = typeof mapped?.lrclibId === 'number' ? mapped.lrclibId : undefined;
      return fetchLyrics(t, fetch, { lrclibId });
    },
    detectSongLang,
    // 中文歌詞依翻譯語言統一成繁體或簡體；其他語言保持原樣
    toTraditional: (x) => {
      const target = getTargetLang();
      return target === 'zh-Hans' ? toSimplified(x) : target === 'zh-Hant' ? toTraditional(x) : x;
    },
    toFuriganaHtml,
    toRomaji,
    translateSong,
    view: {
      setLines: (lines, lang) => {
        currentTranslations = [];
        lyricsView.setLines(lines, lang);
      },
      setTranslations: (t) => {
        currentTranslations = t;
        lyricsView.setTranslations(t);
        if (pip.isOpen()) pipUpdate(lastActiveIndex);
      },
      setFurigana: (h) => {
        lyricsView.setFurigana(h);
      },
      setRomaji: (r) => {
        lyricsView.setRomaji(r);
      },
    },
    setNoLyrics: (on) => {
      shell.setNoLyrics(on);
    },
    onLangChange: (lang) => {
      currentSongLang = lang;
      lastActiveIndex = -2;
      syncToggles();
    },
    onTranslationError: (e) => {
      handleTranslationError(e);
    },
    onEngine: (engine) => {
      nowPlaying.setEngine(engine);
    },
  });

  let webAvailable = true;
  try {
    webPlayer = await createWebPlayer(
      (s) => {
        controller?.handleWebState(s);
      },
      getAccessToken,
    );
  } catch (e) {
    console.warn('建立網頁播放器失敗：', e);
    webAvailable = false;
    webPlayer = null;
    shell.showNotice(tApp('webPlayerFailed'));
  }

  const webPlayerDep: ControllerDeps['webPlayer'] = webPlayer ?? {
    deviceId: '',
    connect: async (): Promise<boolean> => false,
    disconnect: (): void => {
      // 沒有網頁播放器時不需要做任何事。
    },
  };

  controller = new PlayerController({
    api: {
      getDevices,
      transferPlayback,
      play,
      pause,
      next,
      previous,
      seek,
      setVolume,
    },
    webPlayer: webPlayerDep,
    startPolling: (cb) =>
      startPolling(cb, CONFIG.remotePollMs, getPlaybackState, (e) => {
        if (e instanceof QuotaExceededError) {
          shell.showNotice(tApp('quota'));
        }
      }),
  });

  library = new LibraryPanel(shell.libraryRoot, {
    search,
    getMyPlaylists,
    getPlaylistItems,
    getSavedTracks,
    playContext: async (uri: string, offsetUri?: string) => {
      await controller?.playContext(uri, offsetUri);
    },
    playUris: async (uris: string[], offsetUri?: string) => {
      await controller?.playUris(uris, offsetUri);
    },
    isNotOwned: (e: unknown) => e instanceof NotOwnedError,
    trueShuffle: (src) =>
      void shuffle.start(
        src.kind === 'liked'
          ? { kind: 'liked', id: 'liked', name: tApp('likedSongs') }
          : { kind: 'playlist', id: src.id, name: src.name },
      ),
  });

  let lastQueueTrackId: string | null = null;
  controller.on('state', (payload) => {
    const state = (payload ?? null) as PlaybackState | null;
    nowPlaying.update(state);

    const track = state?.track ?? null;
    if (track?.id !== currentTrack?.id) shuffle.onTrack(track?.uri ?? null);
    currentTrack = track;
    shell.setCover(track?.imageUrl ?? null, track?.name ?? '');
    shell.setPlaying(state?.isPlaying === true);
    const trackId = track?.id ?? null;
    if (trackId !== lastQueueTrackId) {
      lastQueueTrackId = trackId;
      // 換歌時待播清單也會跟著變；開著的時候才去抓，避免浪費 API 額度
      if (queueOpen) window.setTimeout(() => void refreshQueue(), 600);
    }

    const url = track?.imageUrl ?? null;
    if (url !== lastCoverUrl) {
      lastCoverUrl = url;
      setBackgroundArt(url);
      if (url !== null) {
        void updateBackgroundFromImage(url).then(() => {
          if (pip.isOpen()) pipColors();
        });
      }
    }

    void pipeline.onTrack(track);
  });

  controller.on('mode', () => {
    nowPlaying.setMode(controller?.mode ?? 'web');
  });

  controller.on('no-device', () => {
    shell.showNotice(tApp('noDevice'), [
      {
        label: tApp('openSpotify'),
        onClick: () => {
          location.href = 'spotify:';
        },
      },
      {
        label: tApp('useWebPlayer'),
        onClick: () => {
          shell.hideNotice();
          void controller?.setMode('web');
        },
      },
    ]);
  });

  controller.on('quota', () => {
    shell.showNotice(tApp('quota'));
  });

  syncToggles();

  const startupState = await getPlaybackState().catch(() => null);
  const startupMode: Mode = webAvailable
    ? decideStartupMode(startupState, loadMode())
    : 'app';

  await controller.start(startupMode);
  nowPlaying.setMode(controller.mode);

  const loop = (): void => {
    requestAnimationFrame(loop);

    const pos = controller?.clock.now() ?? 0;
    nowPlaying.updatePosition(pos);

    const index = lineIndexAt(
      pipeline.lines(),
      pos + CONFIG.lyricsLeadMs + lyricsView.getOptions().offsetMs,
    );
    if (index !== lastActiveIndex) {
      lastActiveIndex = index;
      lyricsView.setActive(index);
      if (pip.isOpen()) pipUpdate(index);
    }
  };
  requestAnimationFrame(loop);

  // 微調歌詞時間：[ 讓歌詞晚一點、] 讓歌詞早一點、\ 歸零（設定會記住）
  let offsetNoticeTimer = 0;
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    let offset = lyricsView.getOptions().offsetMs;
    if (event.key === ']') offset += 100;
    else if (event.key === '[') offset -= 100;
    else if (event.key === '\\') offset = 0;
    else return;
    event.preventDefault();
    offset = Math.max(-3000, Math.min(3000, offset));
    lyricsView.setOptions({ offsetMs: offset });
    lastActiveIndex = -2;
    const sec = (Math.abs(offset) / 1000).toFixed(1);
    shell.showNotice(offset === 0 ? tApp('offsetDefault') : tApp(offset > 0 ? 'offsetEarlier' : 'offsetLater', { sec }));
    window.clearTimeout(offsetNoticeTimer);
    offsetNoticeTimer = window.setTimeout(() => shell.hideNotice(), 1500);
  });
}
