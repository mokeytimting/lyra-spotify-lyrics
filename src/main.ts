import './styles/main.css';
import './styles/panels.css';
import { CONFIG } from './config';
import { tApp } from './i18n/appStrings';
import { getLang, isUiLang, setLangNoReload } from './i18n';
import { AuthRequiredError, beginLogin, handleCallback, hasTokens, logout } from './spotify/auth';
import { createShell } from './ui/shell';
import { SettingsPanel } from './ui/settingsPanel';
import { ICONS } from './ui/icons';
import { loadSettings, saveSettings, testTranslation } from './settings/client';
import { startApp } from './app';
import type { PublicSettings } from './settings/types';

const root = document.getElementById('app')!;
document.documentElement.lang = getLang();

export function chromeTranslatorAvailable(): boolean {
  return 'Translator' in globalThis;
}

/** 第一次使用：還沒有 Client ID 時顯示設定畫面，存好後重新整理。 */
function showSetup(): void {
  const shell = createShell(root);
  const panel = new SettingsPanel(
    shell.settingsRoot,
    {
      load: loadSettings,
      save: saveSettings,
      test: testTranslation,
      redirectUri: CONFIG.redirectUri,
      chromeTranslatorAvailable,
    },
    { onSaved: () => location.reload() },
  );
  shell.settingsRoot.querySelector('.set-close')?.insertAdjacentHTML('afterbegin', ICONS.close);
  void panel.open('setup');
}

function showLogin(): void {
  const shell = createShell(root);
  shell.showLogin(() => void beginLogin());
}

async function boot(): Promise<void> {
  // 示範模式：/?demo&view=main|queue|settings&lang=en
  const params = new URLSearchParams(location.search);
  // GitHub Pages 上的線上試玩版只有示範模式
  if (params.has('demo') || import.meta.env.VITE_STATIC_DEMO === '1') {
    const lang = params.get('lang');
    if (isUiLang(lang)) setLangNoReload(lang);
    document.documentElement.lang = getLang();
    const { startDemo } = await import('./demo');
    return startDemo(root, params.get('view') ?? 'main');
  }
  let settings: PublicSettings;
  try {
    settings = await loadSettings();
  } catch (e) {
    console.error(e);
    root.textContent = tApp('noServer');
    return;
  }
  CONFIG.clientId = settings.spotifyClientId;
  if (!CONFIG.clientId) return showSetup();

  if (location.pathname === '/callback') {
    try {
      await handleCallback(new URL(location.href));
    } catch (e) {
      console.error('登入失敗', e);
      history.replaceState(null, '', '/');
    }
  }
  if (!hasTokens()) return showLogin();
  try {
    await startApp(root, settings);
  } catch (e) {
    if (e instanceof AuthRequiredError) {
      logout();
      return showLogin();
    }
    throw e;
  }
}

boot().catch((e) => {
  console.error(e);
  root.textContent = tApp('bootFailed');
});
