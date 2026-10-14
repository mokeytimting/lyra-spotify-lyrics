/**
 * 示範模式：不用登入 Spotify，用原創的示範歌曲與封面展示介面。
 * 網址：/?demo（可加 &view=main|queue|settings、&lang=en|zh-Hant|...）
 * README 的截圖也是用這個模式產生的。
 */
import { defineStrings, getLang, getTargetLang, UI_LANGS, type TargetLang } from './i18n';
import { createShell } from './ui/shell';
import { NowPlayingView } from './ui/nowPlaying';
import { LyricsView } from './ui/lyricsView';
import { QueueView } from './ui/queueView';
import { SettingsPanel } from './ui/settingsPanel';
import { ICONS, iconButton } from './ui/icons';
import { setBackgroundArt, updateBackgroundFromImage } from './ui/background';
import { toFuriganaHtml, toRomaji } from './text/japanese';
import { CONFIG } from './config';
import type { PlaybackState, Track } from './spotify/types';
import type { PublicSettings } from './settings/types';

/** 原創示範歌詞（日文）與各語言譯文；日文介面不顯示譯文 */
const LYRICS: { t: number; ja: string; tr: Partial<Record<TargetLang, string>> }[] = [
  { t: 0, ja: '街の灯りが消えるころ', tr: { en: 'When the city lights fade out', 'zh-Hant': '城市燈火熄滅的時候', 'zh-Hans': '城市灯火熄灭的时候', ko: '거리의 불빛이 꺼질 무렵', es: 'Cuando se apagan las luces de la ciudad' } },
  { t: 4200, ja: '君への手紙を書いていた', tr: { en: 'I was writing you a letter', 'zh-Hant': '我正寫著給你的信', 'zh-Hans': '我正写着给你的信', ko: '너에게 편지를 쓰고 있었어', es: 'Te estaba escribiendo una carta' } },
  { t: 8400, ja: '届かない言葉を並べて', tr: { en: 'Lining up words that never reach you', 'zh-Hant': '排列著傳不到的話語', 'zh-Hans': '排列着传不到的话语', ko: '닿지 않는 말들을 늘어놓고', es: 'Ordenando palabras que nunca te llegan' } },
  { t: 12600, ja: '夜明けの空に飛ばした', tr: { en: 'I let them fly into the dawn', 'zh-Hant': '讓它們飛向黎明的天空', 'zh-Hans': '让它们飞向黎明的天空', ko: '새벽 하늘로 날려 보냈어', es: 'Las dejé volar hacia el amanecer' } },
  { t: 16800, ja: '', tr: {} },
  { t: 20000, ja: '明日も同じ道を歩く', tr: { en: "Tomorrow I'll walk the same road", 'zh-Hant': '明天也走同一條路', 'zh-Hans': '明天也走同一条路', ko: '내일도 같은 길을 걸어', es: 'Mañana caminaré el mismo camino' } },
  { t: 24200, ja: 'それでも心は自由だった', tr: { en: 'Even so, my heart was free', 'zh-Hant': '即使如此，心仍是自由的', 'zh-Hans': '即使如此，心仍是自由的', ko: '그래도 마음은 자유로웠어', es: 'Aun así, mi corazón era libre' } },
  { t: 28400, ja: '屋上で風を待っている', tr: { en: 'Waiting for the wind on the rooftop', 'zh-Hant': '在屋頂上等待著風', 'zh-Hans': '在屋顶上等待着风', ko: '옥상에서 바람을 기다려', es: 'Esperando el viento en la azotea' } },
  { t: 32600, ja: '遠くの街が光ってる', tr: { en: 'A distant town is shining', 'zh-Hant': '遠方的街道閃閃發光', 'zh-Hans': '远方的街道闪闪发光', ko: '먼 도시가 빛나고 있어', es: 'Una ciudad lejana está brillando' } },
  { t: 36800, ja: 'この歌が終わるまでに', tr: { en: 'Before this song comes to an end', 'zh-Hant': '在這首歌結束之前', 'zh-Hans': '在这首歌结束之前', ko: '이 노래가 끝나기 전에', es: 'Antes de que termine esta canción' } },
];

/** 部署在子路徑（例如 GitHub Pages）時也找得到靜態檔 */
const BASE = import.meta.env.BASE_URL;
const COVER = `${BASE}demo/cover.jpg`;
const TRACK: Track = {
  id: 'demo',
  uri: 'spotify:track:demo',
  name: '屋上の手紙',
  artists: ['Sora Akari'],
  album: 'Dusk City',
  durationMs: 214000,
  imageUrl: COVER,
};

const QUEUE: Track[] = [
  ['Paper Boats', 'Mio Hayase', `${BASE}demo/cover2.jpg`, 201000],
  ['Neon River', 'Kite Avenue', `${BASE}demo/cover3.jpg`, 187000],
  ['夜明けのバス', 'Sora Akari', COVER, 233000],
  ['Glass Garden', 'Mio Hayase', `${BASE}demo/cover2.jpg`, 245000],
  ['Northbound', 'Kite Avenue', `${BASE}demo/cover3.jpg`, 198000],
  ['Small Hours', 'Sora Akari', COVER, 221000],
  ['Afterglow', 'Mio Hayase', `${BASE}demo/cover2.jpg`, 176000],
].map(([name, artist, img, dur], i) => ({
  id: `q${i}`,
  uri: `spotify:track:q${i}`,
  name: name as string,
  artists: [artist as string],
  album: 'Demo',
  durationMs: dur as number,
  imageUrl: img as string,
}));

const DEMO_SETTINGS: PublicSettings = {
  spotifyClientId: '0123456789abcdef0123456789abcdef',
  translation: {
    engine: 'deepl',
    deepl: { hasKey: true },
    azure: { hasKey: false, region: '' },
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hasKey: false },
  },
};

const tDemo = defineStrings({
  'zh-Hant': { demo: '線上試玩', lyrics: '歌詞', queue: '待播清單', settings: '設定', romaji: '羅馬拼音', star: '在 GitHub 取得 Lyra' },
  'zh-Hans': { demo: '在线试玩', lyrics: '歌词', queue: '待播清单', settings: '设置', romaji: '罗马音', star: '在 GitHub 获取 Lyra' },
  en: { demo: 'Live demo', lyrics: 'Lyrics', queue: 'Up Next', settings: 'Settings', romaji: 'Romaji', star: 'Get Lyra on GitHub' },
  ja: { demo: 'デモ', lyrics: '歌詞', queue: '次に再生', settings: '設定', romaji: 'ローマ字', star: 'GitHub で Lyra を入手' },
  ko: { demo: '라이브 데모', lyrics: '가사', queue: '다음 재생', settings: '설정', romaji: '로마자', star: 'GitHub에서 Lyra 받기' },
  es: { demo: 'Demo en vivo', lyrics: 'Letra', queue: 'A continuación', settings: 'Ajustes', romaji: 'Romaji', star: 'Consigue Lyra en GitHub' },
});

const REPO_URL = 'https://github.com/mokeytimting/lyra-spotify-lyrics';

/** 示範模式下方的小工具列：切換畫面、語言、羅馬拼音，以及前往 GitHub（&shot=1 時隱藏，用於截圖） */
function demoBar(view: string, romaji: boolean): HTMLElement {
  const go = (patch: Record<string, string | null>): void => {
    const u = new URL(location.href);
    u.searchParams.set('demo', '');
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    }
    location.href = u.toString();
  };
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  const label = document.createElement('span');
  label.className = 'demo-label';
  label.textContent = tDemo('demo');
  bar.appendChild(label);
  for (const [id, key] of [['main', 'lyrics'], ['queue', 'queue'], ['settings', 'settings']] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = tDemo(key);
    b.classList.toggle('on', view === id);
    b.addEventListener('click', () => go({ view: id }));
    bar.appendChild(b);
  }
  const r = document.createElement('button');
  r.type = 'button';
  r.textContent = tDemo('romaji');
  r.classList.toggle('on', romaji);
  r.addEventListener('click', () => go({ romaji: romaji ? null : '1' }));
  bar.appendChild(r);
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Language');
  for (const l of UI_LANGS) {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = l.label;
    o.selected = l.id === getLang();
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => go({ lang: sel.value }));
  bar.appendChild(sel);
  const a = document.createElement('a');
  a.className = 'demo-star';
  a.href = REPO_URL;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = '★ ' + tDemo('star');
  bar.appendChild(a);
  return bar;
}

export async function startDemo(root: HTMLElement, view: string): Promise<void> {
  const shell = createShell(root);
  const noop = (): void => undefined;
  const nowPlaying = new NowPlayingView(shell.nowPlayingRoot, {
    onTogglePlay: noop,
    onNext: noop,
    onPrev: noop,
    onSeek: noop,
    onVolume: noop,
    onModeToggle: noop,
    onToggleTranslation: noop,
    onToggleRomaji: noop,
    onOpenLibrary: noop,
    onToggleQueue: noop,
    onOpenPip: noop,
    onStopShuffle: noop,
  });
  shell.stage.appendChild(iconButton('settings-btn', 'gear', 'Settings'));

  shell.setCover(COVER, TRACK.name);
  shell.setPlaying(true);
  setBackgroundArt(COVER);
  void updateBackgroundFromImage(COVER);

  const target = getTargetLang();
  nowPlaying.setMode('web');
  nowPlaying.setEngine(target === 'ja' ? null : 'deepl');
  // &romaji=1：同時顯示羅馬拼音
  const showRomaji = new URLSearchParams(location.search).get('romaji') === '1';
  nowPlaying.setToggles({ translation: true, romaji: showRomaji, romajiAvailable: true });

  const lyrics = new LyricsView(shell.lyricsRoot, noop);
  lyrics.setOptions({ showTranslation: true, showRomaji, offsetMs: 0 });
  lyrics.setLines(
    LYRICS.map((l) => ({ timeMs: l.t, text: l.ja })),
    'ja',
  );
  lyrics.setTranslations(LYRICS.map((l) => (target === 'ja' ? null : l.tr[target] ?? l.tr.en ?? null)));
  try {
    lyrics.setFurigana(await Promise.all(LYRICS.map((l) => (l.ja ? toFuriganaHtml(l.ja) : Promise.resolve(null)))));
    lyrics.setRomaji(await Promise.all(LYRICS.map((l) => (l.ja ? toRomaji(l.ja) : Promise.resolve(null)))));
  } catch (e) {
    console.warn('示範模式：假名載入失敗', e);
  }

  if (new URLSearchParams(location.search).get('shot') !== '1') root.appendChild(demoBar(view, showRomaji));

  // 播放進度與歌詞跟著時間前進（從第 3 句開始，循環播放）
  const start = performance.now() - LYRICS[2]!.t - 1500;
  const state = (pos: number): PlaybackState => ({
    track: TRACK,
    positionMs: pos,
    isPlaying: true,
    deviceId: null,
    deviceName: CONFIG.deviceName,
    timestamp: performance.now(),
  });
  nowPlaying.update(state(LYRICS[2]!.t + 1500));
  let last = -2;
  const tick = (): void => {
    const loop = LYRICS[LYRICS.length - 1]!.t + 5000;
    const pos = (performance.now() - start) % loop;
    nowPlaying.updatePosition(pos + 61000);
    let idx = -1;
    for (let i = 0; i < LYRICS.length; i += 1) if (LYRICS[i]!.t <= pos) idx = i;
    if (idx !== last) {
      last = idx;
      lyrics.setActive(idx);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  if (view === 'queue') {
    const queue = new QueueView(shell.queueRoot);
    queue.setTracks(QUEUE);
    shell.setQueueOpen(true);
    nowPlaying.setQueueOpen(true);
    nowPlaying.setShuffle({ played: 137, total: 412, round: 2 });
  }

  if (view === 'settings') {
    const panel = new SettingsPanel(shell.settingsRoot, {
      load: async () => DEMO_SETTINGS,
      save: async () => DEMO_SETTINGS,
      test: async () => ({ ok: true, sample: '' }),
      redirectUri: CONFIG.redirectUri,
      chromeTranslatorAvailable: () => true,
    });
    shell.settingsRoot.querySelector('.set-close')?.insertAdjacentHTML('afterbegin', ICONS.close);
    await panel.open('normal');
  }
}
