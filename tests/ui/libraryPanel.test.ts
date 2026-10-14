import { test, expect, beforeEach, afterEach } from 'vitest';
import { Window } from 'happy-dom';
import { LibraryPanel } from '../../src/ui/libraryPanel';

let win: any;
let doc: any;

beforeEach(() => {
  win = new Window();
  doc = win.document;
});

afterEach(() => {
  win = null;
  doc = null;
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mkTrack(
  id: string,
  name: string,
  artists: string[] = ['Artist'],
  album = 'Album',
  uri?: string,
) {
  return {
    id,
    uri: uri ?? `spotify:track:${id}`,
    name,
    artists,
    album,
    durationMs: 200000,
    imageUrl: null as string | null,
  };
}

function mkAlbum(id: string, name: string, artist = 'Artist', uri?: string) {
  return {
    uri: uri ?? `spotify:album:${id}`,
    name,
    imageUrl: null as string | null,
    artist,
  };
}

function mkPlaylist(id: string, name: string, owned = true, uri?: string) {
  return {
    id,
    uri: uri ?? `spotify:playlist:${id}`,
    name,
    imageUrl: null as string | null,
    owned,
  };
}

function mkDeps(overrides: Record<string, any> = {}) {
  return {
    search: async () => ({ tracks: [], playlists: [], albums: [] }),
    getMyPlaylists: async () => ({ playlists: [], next: false }),
    getPlaylistItems: async () => ({ tracks: [], next: false }),
    getSavedTracks: async () => ({ tracks: [], next: false }),
    playContext: async () => {},
    playUris: async () => {},
    isNotOwned: () => false,
    ...overrides,
  };
}

function mkRoot(): any {
  const root = doc.createElement('aside');
  root.className = 'library';
  doc.body.appendChild(root);
  return root;
}

function fireInput(el: any) {
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}

function fireKey(k: string) {
  const ev = new win.KeyboardEvent('keydown', {
    key: k,
    bubbles: true,
    cancelable: true,
  });
  doc.dispatchEvent(ev);
  return ev;
}

function libBodyOf(root: any): any {
  return root.querySelector('.lib-body');
}

function namesOf(root: any): string[] {
  return Array.from(root.querySelectorAll('.lib-body .lib-item .name')).map(
    (n: any) => n.textContent,
  );
}

/* ------------------------------------------------------------------ */
/* DOM 契約                                                            */
/* ------------------------------------------------------------------ */

test('建構時建立 lib-head、三個 lib-tab、lib-close、lib-search、lib-body、play-all、lib-note', () => {
  const root = mkRoot();
  new LibraryPanel(root, mkDeps() as any);

  const head = root.querySelector('.lib-head');
  expect(head).toBeTruthy();

  const tabs = Array.from(root.querySelectorAll('.lib-tab')) as any[];
  expect(tabs.length).toBe(3);
  expect(tabs[0].getAttribute('data-tab')).toBe('search');
  expect(tabs[1].getAttribute('data-tab')).toBe('playlists');
  expect(tabs[2].getAttribute('data-tab')).toBe('liked');
  expect(tabs[0].textContent).toBe('搜尋');
  expect(tabs[1].textContent).toBe('歌單');
  expect(tabs[2].textContent).toBe('已按讚的歌曲');

  const close = root.querySelector('.lib-close');
  expect(close).toBeTruthy();
  expect(close.querySelector('svg')).toBeTruthy();
  expect(close.getAttribute('aria-label')).toBe('關閉');

  const search = root.querySelector('input.lib-search');
  expect(search).toBeTruthy();
  expect(search.getAttribute('type')).toBe('search');
  expect(search.getAttribute('placeholder')).toBe('搜尋歌曲、歌手、專輯');

  expect(root.querySelector('.lib-body')).toBeTruthy();
  expect(root.querySelector('button.play-all')).toBeTruthy();
  expect(root.querySelector('.lib-note')).toBeTruthy();
});

/* ------------------------------------------------------------------ */
/* open / close / toggle / isOpen                                      */
/* ------------------------------------------------------------------ */

test("open() 會在 root 加上 'open' class 並讓 isOpen() 為 true", () => {
  const root = mkRoot();
  const panel = new LibraryPanel(root, mkDeps() as any);
  expect(panel.isOpen()).toBe(false);
  panel.open();
  expect(root.classList.contains('open')).toBe(true);
  expect(panel.isOpen()).toBe(true);
});

test("close() 會移除 'open' class 並讓 isOpen() 為 false", () => {
  const root = mkRoot();
  const panel = new LibraryPanel(root, mkDeps() as any);
  panel.open();
  panel.close();
  expect(root.classList.contains('open')).toBe(false);
  expect(panel.isOpen()).toBe(false);
});

test('toggle() 在 open 與 close 之間切換', () => {
  const root = mkRoot();
  const panel = new LibraryPanel(root, mkDeps() as any);
  panel.toggle();
  expect(panel.isOpen()).toBe(true);
  panel.toggle();
  expect(panel.isOpen()).toBe(false);
});

test("open('search') 會將焦點放到搜尋框", () => {
  const root = mkRoot();
  const panel = new LibraryPanel(root, mkDeps() as any);
  panel.open('search');
  const search = root.querySelector('input.lib-search');
  expect(doc.activeElement).toBe(search);
});

/* ------------------------------------------------------------------ */
/* 鍵盤                                                                */
/* ------------------------------------------------------------------ */

test("焦點不在輸入框時按 '/' 會 open('search') 並 preventDefault", () => {
  const root = mkRoot();
  const panel = new LibraryPanel(root, mkDeps() as any);
  const ev = fireKey('/');
  expect(panel.isOpen()).toBe(true);
  const searchTab = root.querySelector('.lib-tab[data-tab="search"]');
  expect(searchTab.classList.contains('active')).toBe(true);
  expect(ev.defaultPrevented).toBe(true);
});

test("焦點在 input 時按 '/' 不會開啟面板", () => {
  const root = mkRoot();
  const panel = new LibraryPanel(root, mkDeps() as any);
  const outside = doc.createElement('input');
  doc.body.appendChild(outside);
  outside.focus();
  expect(doc.activeElement).toBe(outside);
  fireKey('/');
  expect(panel.isOpen()).toBe(false);
});

test("按 'Escape' 會關閉面板", () => {
  const root = mkRoot();
  const panel = new LibraryPanel(root, mkDeps() as any);
  panel.open();
  fireKey('Escape');
  expect(panel.isOpen()).toBe(false);
});

/* ------------------------------------------------------------------ */
/* 搜尋                                                                */
/* ------------------------------------------------------------------ */

test('搜尋輸入 debounce 300ms：連續三次輸入只呼叫一次 search', async () => {
  let calls = 0;
  const deps = mkDeps({
    search: async () => {
      calls += 1;
      return { tracks: [], playlists: [], albums: [] };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'a';
  fireInput(input);
  input.value = 'ab';
  fireInput(input);
  input.value = 'abc';
  fireInput(input);
  expect(calls).toBe(0);
  await delay(380);
  expect(calls).toBe(1);
});

test('空字串清空清單且不呼叫 search', async () => {
  let calls = 0;
  const deps = mkDeps({
    search: async () => {
      calls += 1;
      return { tracks: [mkTrack('t1', 'Song')], playlists: [], albums: [] };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');

  input.value = 'x';
  fireInput(input);
  await delay(380);
  expect(calls).toBe(1);
  const body = libBodyOf(root);
  expect(body.querySelectorAll('.lib-item').length > 0).toBe(true);

  input.value = '';
  fireInput(input);
  await delay(380);
  expect(calls).toBe(1);
  expect(body.querySelectorAll('.lib-item').length).toBe(0);
});

test('搜尋結果依序顯示歌曲、專輯、歌單', async () => {
  const deps = mkDeps({
    search: async () => ({
      tracks: [mkTrack('t1', 'TrackName')],
      albums: [mkAlbum('a1', 'AlbumName')],
      playlists: [mkPlaylist('p1', 'PlaylistName')],
    }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const items = Array.from(
    libBodyOf(root).querySelectorAll('.lib-item'),
  ) as any[];
  expect(items.length).toBe(3);
  expect(items[0].querySelector('.name').textContent).toBe('TrackName');
  expect(items[1].querySelector('.name').textContent).toBe('AlbumName');
  expect(items[2].querySelector('.name').textContent).toBe('PlaylistName');
});

test('搜尋結果的歌曲 sub 為「歌手 · 專輯」', async () => {
  const deps = mkDeps({
    search: async () => ({
      tracks: [mkTrack('t1', 'T1', ['Singer'], 'AlbumX')],
      albums: [],
      playlists: [],
    }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const item = libBodyOf(root).querySelector('.lib-item');
  expect(item.querySelector('.sub').textContent).toBe('Singer · AlbumX');
});

test("搜尋結果的專輯 sub 為 '專輯 · ' + artist", async () => {
  const deps = mkDeps({
    search: async () => ({
      tracks: [],
      albums: [mkAlbum('a1', 'Alb', 'TheArtist')],
      playlists: [],
    }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const item = libBodyOf(root).querySelector('.lib-item');
  expect(item.querySelector('.sub').textContent).toBe('專輯 · TheArtist');
});

test("搜尋結果的歌單 sub 為 '歌單'", async () => {
  const deps = mkDeps({
    search: async () => ({
      tracks: [],
      albums: [],
      playlists: [mkPlaylist('p1', 'PList')],
    }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const item = libBodyOf(root).querySelector('.lib-item');
  expect(item.querySelector('.sub').textContent).toBe('歌單');
});

test('點擊搜尋結果的歌曲會以單一 uri 呼叫 playUris', async () => {
  let played: any = null;
  const deps = mkDeps({
    search: async () => ({
      tracks: [mkTrack('t1', 'T1', ['A'], 'Alb', 'spotify:track:tt1')],
      albums: [],
      playlists: [],
    }),
    playUris: async (uris: string[], offsetUri?: string) => {
      played = { uris, offsetUri };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const item = libBodyOf(root).querySelector('.lib-item');
  item.click();
  await delay(20);
  expect(played).toBeTruthy();
  expect(played.uris).toEqual(['spotify:track:tt1']);
});

test('點擊搜尋結果的專輯會呼叫 playContext(album.uri)', async () => {
  let played: any = null;
  const deps = mkDeps({
    search: async () => ({
      tracks: [],
      albums: [mkAlbum('a1', 'Alb', 'Artist', 'spotify:album:aa1')],
      playlists: [],
    }),
    playContext: async (uri: string, offsetUri?: string) => {
      played = { uri, offsetUri };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const item = libBodyOf(root).querySelector('.lib-item');
  item.click();
  await delay(20);
  expect(played).toBeTruthy();
  expect(played.uri).toBe('spotify:album:aa1');
});

test('點擊搜尋結果的歌單會開啟該歌單（呼叫 getPlaylistItems）', async () => {
  const calls: string[] = [];
  const deps = mkDeps({
    search: async () => ({
      tracks: [],
      albums: [],
      playlists: [mkPlaylist('p1', 'PList', true, 'spotify:playlist:pp1')],
    }),
    getPlaylistItems: async (id: string) => {
      calls.push(id);
      return { tracks: [], next: false };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const item = libBodyOf(root).querySelector('.lib-item');
  item.click();
  await delay(20);
  expect(calls).toEqual(['p1']);
});

test('搜尋清單捲到底時以 offset=10 載入下一頁並附加歌曲結果', async () => {
  const calls: Array<{ q: string; offset: number | undefined }> = [];
  const deps = mkDeps({
    search: async (q: string, offset?: number) => {
      calls.push({ q, offset });
      if (offset === undefined) {
        return { tracks: [mkTrack('t1', 'P1')], albums: [], playlists: [] };
      }
      return { tracks: [mkTrack('t2', 'P2')], albums: [], playlists: [] };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);
  expect(calls.length).toBe(1);

  const body = libBodyOf(root);
  Object.defineProperty(body, 'scrollHeight', {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(body, 'clientHeight', {
    value: 500,
    configurable: true,
  });
  Object.defineProperty(body, 'scrollTop', {
    value: 460,
    writable: true,
    configurable: true,
  });
  body.dispatchEvent(new win.Event('scroll', { bubbles: true }));
  await delay(30);

  expect(calls.length).toBe(2);
  expect(calls[1].offset).toBe(10);
  const names = namesOf(root);
  expect(names.includes('P1')).toBe(true);
  expect(names.includes('P2')).toBe(true);
});

test('過時的搜尋結果會被丟棄', async () => {
  const pending: Array<{ q: string; resolve: (v: any) => void }> = [];
  const deps = mkDeps({
    search: (q: string) =>
      new Promise((resolve) => {
        pending.push({ q, resolve });
      }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');

  input.value = 'a';
  fireInput(input);
  await delay(380);
  expect(pending.length).toBe(1);
  expect(pending[0].q).toBe('a');

  input.value = 'ab';
  fireInput(input);
  await delay(380);
  expect(pending.length).toBe(2);
  expect(pending[1].q).toBe('ab');

  pending[1].resolve({
    tracks: [mkTrack('tb', 'NEWSONG')],
    albums: [],
    playlists: [],
  });
  await delay(20);
  pending[0].resolve({
    tracks: [mkTrack('ta', 'OLDSSONG')],
    albums: [],
    playlists: [],
  });
  await delay(20);

  const names = namesOf(root);
  expect(names.includes('NEWSONG')).toBe(true);
  expect(names.includes('OLDSSONG')).toBe(false);
});

test('搜尋失敗時 lib-body 顯示「載入失敗，請稍後再試」', async () => {
  const deps = mkDeps({
    search: async () => {
      throw new Error('boom');
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const body = libBodyOf(root);
  expect(body.textContent).toContain('載入失敗，請稍後再試');
});

/* ------------------------------------------------------------------ */
/* 歌單分頁                                                            */
/* ------------------------------------------------------------------ */

test('歌單分頁列出自己的歌單', async () => {
  const deps = mkDeps({
    getMyPlaylists: async () => ({
      playlists: [
        mkPlaylist('p1', 'MyList'),
        mkPlaylist('p2', 'OtherList', false),
      ],
      next: false,
    }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('playlists');
  await delay(30);

  const names = namesOf(root);
  expect(names.includes('MyList')).toBe(true);
  expect(names.includes('OtherList')).toBe(true);
});

test('點歌單成功時顯示返回列、播放整張歌單按鈕與曲目', async () => {
  const playlist = mkPlaylist('p1', 'MyList', true, 'spotify:playlist:pp1');
  const track = mkTrack('t1', 'Track1');
  const deps = mkDeps({
    getMyPlaylists: async () => ({ playlists: [playlist], next: false }),
    getPlaylistItems: async () => ({ tracks: [track], next: false }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('playlists');
  await delay(30);

  const body = libBodyOf(root);
  const plItem = body.querySelector('.lib-item');
  plItem.click();
  await delay(30);

  const items = Array.from(body.querySelectorAll('.lib-item')) as any[];
  const back = items.find((el) => el.textContent.includes('← 返回歌單'));
  expect(back).toBeTruthy();

  const playAllBtn = root.querySelector('button.play-all');
  expect(playAllBtn).toBeTruthy();
  expect(playAllBtn.textContent).toBe('播放整張歌單');

  const trackItem = items.find(
    (el) =>
      el.querySelector('.name') &&
      el.querySelector('.name').textContent === 'Track1',
  );
  expect(trackItem).toBeTruthy();
});

test('歌單中的曲目被點擊時以 playlist uri 與該曲目 uri 呼叫 playContext', async () => {
  const playlist = mkPlaylist('p1', 'MyList', true, 'spotify:playlist:pp1');
  const track = mkTrack('t1', 'Track1', ['A'], 'Alb', 'spotify:track:tt1');
  let played: any = null;
  const deps = mkDeps({
    getMyPlaylists: async () => ({ playlists: [playlist], next: false }),
    getPlaylistItems: async () => ({ tracks: [track], next: false }),
    playContext: async (uri: string, offsetUri?: string) => {
      played = { uri, offsetUri };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('playlists');
  await delay(30);

  const body = libBodyOf(root);
  body.querySelector('.lib-item').click();
  await delay(30);

  const items = Array.from(body.querySelectorAll('.lib-item')) as any[];
  const trackItem = items.find(
    (el) =>
      el.querySelector('.name') &&
      el.querySelector('.name').textContent === 'Track1',
  );
  expect(trackItem).toBeTruthy();
  trackItem.click();
  await delay(30);

  expect(played).toBeTruthy();
  expect(played.uri).toBe('spotify:playlist:pp1');
  expect(played.offsetUri).toBe('spotify:track:tt1');
});

test('別人的歌單（isNotOwned 為 true）不列出曲目，只顯示播放整張歌單與 lib-note 提示', async () => {
  const notOwnedMarker = {};
  const playlist = mkPlaylist('p1', 'OtherList', false, 'spotify:playlist:pp1');
  const deps = mkDeps({
    getMyPlaylists: async () => ({ playlists: [playlist], next: false }),
    getPlaylistItems: async () => {
      throw notOwnedMarker;
    },
    isNotOwned: (e: unknown) => e === notOwnedMarker,
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('playlists');
  await delay(30);

  const body = libBodyOf(root);
  body.querySelector('.lib-item').click();
  await delay(30);

  const note = Array.from(root.querySelectorAll('.lib-note')).find(
    (el: any) => el.textContent === 'Spotify 限制：只能檢視自己建立的歌單曲目',
  );
  expect(note).toBeTruthy();

  const playAllBtn = Array.from(root.querySelectorAll('button.play-all')).find(
    (b: any) => b.textContent === '播放整張歌單',
  );
  expect(playAllBtn).toBeTruthy();

  const trackNames = Array.from(
    root.querySelectorAll('.lib-body .lib-item .name'),
  ).map((n: any) => n.textContent);
  expect(trackNames.includes('Track1')).toBe(false);
});

/* ------------------------------------------------------------------ */
/* 已按讚分頁                                                          */
/* ------------------------------------------------------------------ */

test('已按讚分頁載入清單，點第 i 首時以全部已載入 uri 與該首 uri 呼叫 playUris', async () => {
  let played: any = null;
  const tracks = [
    mkTrack('t1', 'T1', ['A'], 'Alb', 'spotify:track:1'),
    mkTrack('t2', 'T2', ['A'], 'Alb', 'spotify:track:2'),
    mkTrack('t3', 'T3', ['A'], 'Alb', 'spotify:track:3'),
  ];
  const deps = mkDeps({
    getSavedTracks: async () => ({ tracks, next: false }),
    playUris: async (uris: string[], offsetUri?: string) => {
      played = { uris, offsetUri };
    },
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('liked');
  await delay(30);

  const items = Array.from(
    libBodyOf(root).querySelectorAll('.lib-item'),
  ) as any[];
  expect(items.length).toBe(3);
  items[1].click();
  await delay(30);

  expect(played).toBeTruthy();
  expect(played.uris).toEqual([
    'spotify:track:1',
    'spotify:track:2',
    'spotify:track:3',
  ]);
  expect(played.offsetUri).toBe('spotify:track:2');
});

/* ------------------------------------------------------------------ */
/* 點擊曲目後關閉面板                                                   */
/* ------------------------------------------------------------------ */

test('點擊曲目後面板會關閉', async () => {
  const deps = mkDeps({
    search: async () => ({
      tracks: [mkTrack('t1', 'T1', ['A'], 'Alb', 'spotify:track:x')],
      albums: [],
      playlists: [],
    }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  libBodyOf(root).querySelector('.lib-item').click();
  await delay(20);
  expect(panel.isOpen()).toBe(false);
});

/* ------------------------------------------------------------------ */
/* 圖片                                                                */
/* ------------------------------------------------------------------ */

test("有圖片的項目 img 使用 loading='lazy'，沒有圖片時加上 'noimg'", async () => {
  const withImg = mkTrack('t1', 'WithImg', ['A'], 'Alb', 'spotify:track:w');
  withImg.imageUrl = 'https://example.com/cover.jpg';
  const withoutImg = mkTrack('t2', 'NoImg', ['A'], 'Alb', 'spotify:track:n');
  withoutImg.imageUrl = null;

  const deps = mkDeps({
    search: async () => ({
      tracks: [withImg, withoutImg],
      albums: [],
      playlists: [],
    }),
  });
  const root = mkRoot();
  const panel = new LibraryPanel(root, deps as any);
  panel.open('search');
  const input = root.querySelector('input.lib-search');
  input.value = 'q';
  fireInput(input);
  await delay(380);

  const items = Array.from(
    libBodyOf(root).querySelectorAll('.lib-item'),
  ) as any[];
  expect(items.length).toBe(2);

  const img1 = items[0].querySelector('img');
  expect(img1).toBeTruthy();
  expect(img1.getAttribute('loading')).toBe('lazy');
  expect(items[0].querySelector('.noimg')).toBe(null);

  expect(items[1].querySelector('.noimg')).toBeTruthy();
});
