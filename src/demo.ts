/**
 * 示範模式：不用登入 Spotify，用原創的示範歌曲與封面展示介面。
 * 網址：/?demo（可加 &view=main|queue|settings、&lang=en|zh-Hant|...）
 * README 的截圖也是用這個模式產生的。
 */
import { getTargetLang, type TargetLang } from './i18n';
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

const COVER = '/demo/cover.jpg';
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
  ['Paper Boats', 'Mio Hayase', '/demo/cover2.jpg', 201000],
  ['Neon River', 'Kite Avenue', '/demo/cover3.jpg', 187000],
  ['夜明けのバス', 'Sora Akari', COVER, 233000],
  ['Glass Garden', 'Mio Hayase', '/demo/cover2.jpg', 245000],
  ['Northbound', 'Kite Avenue', '/demo/cover3.jpg', 198000],
  ['Small Hours', 'Sora Akari', COVER, 221000],
  ['Afterglow', 'Mio Hayase', '/demo/cover2.jpg', 176000],
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
  nowPlaying.setToggles({ translation: true, romaji: false, romajiAvailable: true });

  const lyrics = new LyricsView(shell.lyricsRoot, noop);
  lyrics.setOptions({ showTranslation: true, showRomaji: false, offsetMs: 0 });
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
