import { CONFIG } from '../config';
import { UI_LANGS, defineStrings, getLang, setUiLang, type UiLang } from '../i18n';

const t = defineStrings({
  'zh-Hant': {
    loginDesc: '登入你的 Spotify Premium 帳號開始使用',
    loginBtn: '用 Spotify 登入',
  },
  'zh-Hans': {
    loginDesc: '登录你的 Spotify Premium 帐号开始使用',
    loginBtn: '使用 Spotify 登录',
  },
  en: {
    loginDesc: 'Log in with your Spotify Premium account to get started',
    loginBtn: 'Log in with Spotify',
  },
  ja: {
    loginDesc: 'Spotify Premium アカウントでログインして始めましょう',
    loginBtn: 'Spotify でログイン',
  },
  ko: {
    loginDesc: 'Spotify Premium 계정으로 로그인하여 시작하세요',
    loginBtn: 'Spotify로 로그인',
  },
  es: {
    loginDesc: 'Inicia sesión con tu cuenta de Spotify Premium para empezar',
    loginBtn: 'Iniciar sesión con Spotify',
  },
});

export interface NoticeAction {
  label: string;
  onClick: () => void;
}

export interface Shell {
  root: HTMLElement;
  stage: HTMLElement;
  cover: HTMLImageElement;
  nowPlayingRoot: HTMLElement;
  lyricsRoot: HTMLElement;
  libraryRoot: HTMLElement;
  queueRoot: HTMLElement;
  settingsRoot: HTMLElement;
  pickerRoot: HTMLElement;
  setQueueOpen(open: boolean): void;
  setPlaying(playing: boolean): void;
  setCover(url: string | null, alt: string): void;
  setNoLyrics(on: boolean): void;
  showNotice(msg: string, actions?: NoticeAction[]): void;
  hideNotice(): void;
  showLogin(onLogin: () => void): void;
  hideLogin(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function createShell(
  root: HTMLElement,
  breakpointPx: number = CONFIG.miniBreakpointPx,
): Shell {
  root.replaceChildren();

  // --- 背景色塊 ---
  const bg = el('div', 'bg');
  // WebGL 流動背景（不支援時改用下面的 CSS 旋轉圖層）
  bg.appendChild(el('canvas', 'bg-fluid'));
  // 兩組旋轉中的模糊封面圖層（換歌時交叉淡入），讓背景像活的而不是一張圖
  for (let i = 0; i < 2; i += 1) {
    const set = el('div', `art-set s${i}`);
    for (const r of ['art r1', 'art r2', 'art r3']) set.appendChild(el('div', r));
    bg.appendChild(set);
  }
  const blobClasses = ['blob b1', 'blob b2', 'blob b3'];
  for (const cls of blobClasses) {
    bg.appendChild(el('div', cls));
  }

  // --- 舞台 ---
  const stage = el('div', 'stage');

  const left = el('div', 'left');

  const coverWrap = el('div', 'cover-wrap');
  const cover = el('img', 'cover');
  cover.alt = '';
  coverWrap.appendChild(cover);

  const nowPlayingRoot = el('div', 'now-playing');

  left.appendChild(coverWrap);
  left.appendChild(nowPlayingRoot);

  const lyricsRoot = el('div', 'lyrics');
  const queueRoot = el('div', 'queue');

  const notice = el('div', 'notice');
  notice.hidden = true;
  const noticeMsg = el('div', 'msg');
  const noticeActions = el('div', 'actions');
  notice.appendChild(noticeMsg);
  notice.appendChild(noticeActions);

  stage.appendChild(left);
  stage.appendChild(lyricsRoot);
  stage.appendChild(queueRoot);
  stage.appendChild(notice);

  // --- 選歌面板、設定面板、手動搜尋歌詞 ---
  const libraryRoot = el('aside', 'library');
  const settingsRoot = el('aside', 'settings');
  const pickerRoot = el('div', 'picker');

  // --- 登入畫面 ---
  const login = el('div', 'login');
  login.hidden = true;
  const loginTitle = el('h1', '');
  loginTitle.textContent = 'Lyra';
  const loginDesc = el('p', '');
  loginDesc.textContent = t('loginDesc');
  const loginBtn = el('button', 'login-btn');
  loginBtn.type = 'button';
  loginBtn.textContent = t('loginBtn');
  const loginLang = el('select', 'login-lang');
  for (const lang of UI_LANGS) {
    const option = el('option', '');
    option.value = lang.id;
    option.textContent = lang.label;
    loginLang.appendChild(option);
  }
  loginLang.value = getLang();
  loginLang.addEventListener('change', () => {
    setUiLang(loginLang.value as UiLang);
  });
  login.appendChild(loginTitle);
  login.appendChild(loginDesc);
  login.appendChild(loginBtn);
  login.appendChild(loginLang);

  root.appendChild(bg);
  root.appendChild(stage);
  root.appendChild(libraryRoot);
  root.appendChild(settingsRoot);
  root.appendChild(pickerRoot);
  root.appendChild(login);

  // --- 版面切換 ---
  const applyLayout = (): void => {
    const mini = window.innerWidth < breakpointPx;
    stage.classList.toggle('layout-mini', mini);
    stage.classList.toggle('layout-full', !mini);
  };
  applyLayout();
  window.addEventListener('resize', applyLayout);

  let loginHandler: (() => void) | null = null;

  const setCover = (url: string | null, alt: string): void => {
    cover.alt = alt;
    if (url === null || url === '') {
      cover.removeAttribute('src');
      cover.classList.add('empty');
    } else {
      if (cover.getAttribute('src') !== url) {
        cover.src = url;
        // 換歌時的封面進場動畫
        coverWrap.classList.remove('swap');
        void coverWrap.offsetWidth;
        coverWrap.classList.add('swap');
      }
      cover.classList.remove('empty');
    }
  };

  const setQueueOpen = (open: boolean): void => {
    stage.classList.toggle('show-queue', open);
  };

  const setPlaying = (playing: boolean): void => {
    stage.classList.toggle('paused', !playing);
  };

  const setNoLyrics = (on: boolean): void => {
    stage.classList.toggle('no-lyrics', on);
  };

  const showNotice = (msg: string, actions?: NoticeAction[]): void => {
    noticeMsg.textContent = msg;
    noticeActions.replaceChildren();
    for (const action of actions ?? []) {
      const btn = el('button', '');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.onClick();
      });
      noticeActions.appendChild(btn);
    }
    window.clearTimeout(noticeTimer);
    notice.classList.remove('leaving');
    notice.hidden = false;
  };

  let noticeTimer = 0;
  const hideNotice = (): void => {
    if (notice.hidden) return;
    notice.classList.add('leaving');
    noticeTimer = window.setTimeout(() => {
      notice.hidden = true;
      notice.classList.remove('leaving');
    }, 250);
  };

  const showLogin = (onLogin: () => void): void => {
    if (loginHandler !== null) {
      loginBtn.removeEventListener('click', loginHandler);
    }
    loginHandler = (): void => {
      onLogin();
    };
    loginBtn.addEventListener('click', loginHandler);
    login.hidden = false;
  };

  const hideLogin = (): void => {
    login.hidden = true;
  };

  const destroy = (): void => {
    window.removeEventListener('resize', applyLayout);
    if (loginHandler !== null) {
      loginBtn.removeEventListener('click', loginHandler);
      loginHandler = null;
    }
    noticeActions.replaceChildren();
    window.clearTimeout(noticeTimer);
    root.replaceChildren();
  };

  return {
    root,
    stage,
    cover,
    nowPlayingRoot,
    lyricsRoot,
    libraryRoot,
    queueRoot,
    settingsRoot,
    pickerRoot,
    setQueueOpen,
    setPlaying,
    setCover,
    setNoLyrics,
    showNotice,
    hideNotice,
    showLogin,
    hideLogin,
    destroy,
  };
}
