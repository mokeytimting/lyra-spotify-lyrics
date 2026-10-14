import { test, expect, vi } from 'vitest';
import { createShell } from '../../src/ui/shell';

function setInnerWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    writable: true,
    configurable: true,
  });
}

function dispatchResize(): void {
  window.dispatchEvent(new Event('resize'));
}

function makeEnv(innerWidth: number = 1000): HTMLElement {
  setInnerWidth(innerWidth);
  document.body.replaceChildren();
  const root = document.createElement('div');
  root.id = 'app';
  document.body.appendChild(root);
  return root;
}

// ---------- 結構 ----------

test('createShell 清空 root 後依 DOM 契約建立 .bg 與三個 .blob 色塊', () => {
  const root = makeEnv();
  const leftover = document.createElement('div');
  leftover.className = 'leftover';
  root.appendChild(leftover);

  createShell(root);

  expect(root.querySelector('.leftover')).toBeNull();
  const bg = root.querySelector('.bg');
  expect(bg).not.toBeNull();
  expect(bg!.querySelector('.blob.b1')).not.toBeNull();
  expect(bg!.querySelector('.blob.b2')).not.toBeNull();
  expect(bg!.querySelector('.blob.b3')).not.toBeNull();
});

test('createShell 建立 .stage 內含 .left（.cover-wrap > img.cover、.now-playing）與 .lyrics', () => {
  const root = makeEnv();
  createShell(root);
  const stage = root.querySelector('.stage');
  expect(stage).not.toBeNull();
  const left = stage!.querySelector('.left');
  expect(left).not.toBeNull();
  const coverWrap = left!.querySelector('.cover-wrap');
  expect(coverWrap).not.toBeNull();
  const cover = coverWrap!.querySelector('img.cover');
  expect(cover).not.toBeNull();
  expect(left!.querySelector('.now-playing')).not.toBeNull();
  expect(stage!.querySelector('.lyrics')).not.toBeNull();
});

test('createShell 建立 .notice[hidden]，內含 .msg 與 .actions', () => {
  const root = makeEnv();
  createShell(root);
  const notice = root.querySelector('.notice');
  expect(notice).not.toBeNull();
  expect(notice!.hasAttribute('hidden')).toBe(true);
  expect(notice!.querySelector('.msg')).not.toBeNull();
  expect(notice!.querySelector('.actions')).not.toBeNull();
});

test('createShell 建立 aside.library', () => {
  const root = makeEnv();
  createShell(root);
  expect(root.querySelector('aside.library')).not.toBeNull();
});

test('createShell 建立 .login[hidden]，內含 h1、p 與 button.login-btn', () => {
  const root = makeEnv();
  createShell(root);
  const login = root.querySelector('.login');
  expect(login).not.toBeNull();
  expect(login!.hasAttribute('hidden')).toBe(true);
  expect(login!.querySelector('h1')).not.toBeNull();
  expect(login!.querySelector('p')).not.toBeNull();
  expect(login!.querySelector('button.login-btn')).not.toBeNull();
});

test('createShell 回傳的 Shell 物件提供各節點參考', () => {
  const root = makeEnv();
  const shell = createShell(root);
  expect(shell.root).toBe(root);
  expect(shell.stage).toBe(root.querySelector('.stage'));
  expect(shell.cover).toBe(root.querySelector('img.cover'));
  expect(shell.nowPlayingRoot).toBe(root.querySelector('.now-playing'));
  expect(shell.lyricsRoot).toBe(root.querySelector('.lyrics'));
  expect(shell.libraryRoot).toBe(root.querySelector('aside.library'));
});

// ---------- 版面 ----------

test('視窗寬度 >= 600px 時 .stage 為 layout-full', () => {
  const root = makeEnv(1000);
  createShell(root);
  const stage = root.querySelector('.stage')!;
  expect(stage.classList.contains('layout-full')).toBe(true);
  expect(stage.classList.contains('layout-mini')).toBe(false);
});

test('視窗寬度 < 600px 時 .stage 為 layout-mini', () => {
  const root = makeEnv(599);
  createShell(root);
  const stage = root.querySelector('.stage')!;
  expect(stage.classList.contains('layout-mini')).toBe(true);
  expect(stage.classList.contains('layout-full')).toBe(false);
});

test('視窗寬度剛好等於 600px 時 .stage 為 layout-full（邊界）', () => {
  const root = makeEnv(600);
  createShell(root);
  const stage = root.querySelector('.stage')!;
  expect(stage.classList.contains('layout-full')).toBe(true);
  expect(stage.classList.contains('layout-mini')).toBe(false);
});

test('createShell 可自訂 breakpointPx，並依該值決定版面', () => {
  const root = makeEnv(700);
  const shell = createShell(root, 800);
  const stage = shell.stage;
  expect(stage.classList.contains('layout-mini')).toBe(true);

  const root2 = makeEnv(700);
  const shell2 = createShell(root2, 600);
  expect(shell2.stage.classList.contains('layout-full')).toBe(true);
});

test('window resize 事件會依新的 innerWidth 更新 .stage 版面', () => {
  const root = makeEnv(1000);
  const shell = createShell(root);
  const stage = shell.stage;
  expect(stage.classList.contains('layout-full')).toBe(true);

  setInnerWidth(400);
  dispatchResize();
  expect(stage.classList.contains('layout-mini')).toBe(true);
  expect(stage.classList.contains('layout-full')).toBe(false);

  setInnerWidth(900);
  dispatchResize();
  expect(stage.classList.contains('layout-full')).toBe(true);
  expect(stage.classList.contains('layout-mini')).toBe(false);
});

test('destroy() 之後 window resize 不再更新版面（監聽器已移除）', () => {
  const root = makeEnv(1000);
  const shell = createShell(root);
  const stage = shell.stage;
  expect(stage.classList.contains('layout-full')).toBe(true);

  shell.destroy();
  setInnerWidth(400);
  dispatchResize();

  expect(stage.classList.contains('layout-full')).toBe(true);
  expect(stage.classList.contains('layout-mini')).toBe(false);
});

// ---------- setCover ----------

test('setCover(url, alt) 設定 img.cover 的 src 與 alt，且無 class empty', () => {
  const root = makeEnv();
  const shell = createShell(root);
  shell.setCover('https://example.com/a.jpg', '歌曲名');
  const img = root.querySelector('img.cover')!;
  expect(img.getAttribute('src')).toBe('https://example.com/a.jpg');
  expect(img.getAttribute('alt')).toBe('歌曲名');
  expect(img.classList.contains('empty')).toBe(false);
});

test('setCover(null, alt) 移除 img 的 src 並加上 class empty', () => {
  const root = makeEnv();
  const shell = createShell(root);
  shell.setCover('https://example.com/a.jpg', '歌曲名');
  shell.setCover(null, '歌曲名');
  const img = root.querySelector('img.cover')!;
  expect(img.getAttribute('src')).toBeNull();
  expect(img.classList.contains('empty')).toBe(true);
});

test('setCover 再次給 url 時會移除 empty class', () => {
  const root = makeEnv();
  const shell = createShell(root);
  shell.setCover(null, 'a');
  shell.setCover('https://example.com/b.jpg', 'b');
  const img = root.querySelector('img.cover')!;
  expect(img.getAttribute('src')).toBe('https://example.com/b.jpg');
  expect(img.classList.contains('empty')).toBe(false);
});

// ---------- setNoLyrics ----------

test('setNoLyrics(true/false) 切換 .stage 的 no-lyrics class', () => {
  const root = makeEnv();
  const shell = createShell(root);
  const stage = root.querySelector('.stage')!;
  expect(stage.classList.contains('no-lyrics')).toBe(false);
  shell.setNoLyrics(true);
  expect(stage.classList.contains('no-lyrics')).toBe(true);
  shell.setNoLyrics(false);
  expect(stage.classList.contains('no-lyrics')).toBe(false);
});

// ---------- notice ----------

test('showNotice 移除 .notice 的 hidden 並設定 .msg 文字', () => {
  const root = makeEnv();
  const shell = createShell(root);
  shell.showNotice('找不到裝置');
  const notice = root.querySelector('.notice')!;
  expect(notice.hasAttribute('hidden')).toBe(false);
  expect(notice.querySelector('.msg')!.textContent).toBe('找不到裝置');
});

test('showNotice 會替換先前的 .msg 與 .actions 內容', () => {
  const root = makeEnv();
  const shell = createShell(root);
  shell.showNotice('第一次', [{ label: 'A', onClick: () => {} }]);
  shell.showNotice('第二次');
  const notice = root.querySelector('.notice')!;
  expect(notice.querySelector('.msg')!.textContent).toBe('第二次');
  expect(notice.querySelectorAll('.actions button').length).toBe(0);
});

test('showNotice 的 actions 會產生按鈕，點擊時呼叫對應的 onClick', () => {
  const root = makeEnv();
  const shell = createShell(root);
  let count = 0;
  shell.showNotice('提示', [
    { label: '打開 Spotify', onClick: () => { count += 1; } },
    { label: '改用網頁播放', onClick: () => { count += 10; } },
  ]);
  const buttons = root.querySelectorAll<HTMLButtonElement>('.notice .actions button');
  expect(buttons.length).toBe(2);
  expect(buttons[0].textContent).toBe('打開 Spotify');
  expect(buttons[1].textContent).toBe('改用網頁播放');
  buttons[0].click();
  buttons[1].click();
  expect(count).toBe(11);
});

test('hideNotice 先播放淡出動畫，再將 .notice 加上 hidden', () => {
  vi.useFakeTimers();
  try {
    const root = makeEnv();
    const shell = createShell(root);
    shell.showNotice('提示');
    shell.hideNotice();
    const notice = root.querySelector('.notice')!;
    expect(notice.classList.contains('leaving')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(notice.hasAttribute('hidden')).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

// ---------- login ----------

test('showLogin 顯示 .login，並設定 h1/p/按鈕的繁中文字', () => {
  const root = makeEnv();
  const shell = createShell(root);
  shell.showLogin(() => {});
  const login = root.querySelector('.login')!;
  expect(login.hasAttribute('hidden')).toBe(false);
  expect(login.querySelector('h1')!.textContent).toBe('Lyra');
  expect(login.querySelector('p')!.textContent).toBe('登入你的 Spotify Premium 帳號開始使用');
  const btn = login.querySelector('button.login-btn');
  expect(btn).not.toBeNull();
  expect(btn!.textContent).toBe('用 Spotify 登入');
});

test('showLogin 的按鈕點擊時呼叫 onLogin', () => {
  const root = makeEnv();
  const shell = createShell(root);
  let called = 0;
  shell.showLogin(() => { called += 1; });
  const btn = root.querySelector<HTMLButtonElement>('.login .login-btn')!;
  btn.click();
  expect(called).toBe(1);
});

test('hideLogin 會將 .login 加上 hidden', () => {
  const root = makeEnv();
  const shell = createShell(root);
  shell.showLogin(() => {});
  shell.hideLogin();
  const login = root.querySelector('.login')!;
  expect(login.hasAttribute('hidden')).toBe(true);
});
