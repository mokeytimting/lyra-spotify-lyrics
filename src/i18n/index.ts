/**
 * 介面多國語言。
 *
 * - 每個模組用 defineStrings() 宣告自己的字串表（6 種語言），再用回傳的 t(key, vars) 取字。
 * - 介面語言預設跟著瀏覽器語言；使用者選過就存在 localStorage。
 * - 翻譯目標語言預設等於介面語言，也可以在設定中另外指定。
 */

export type UiLang = 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'ko' | 'es';
/** 歌詞翻譯的目標語言（與介面語言同一組） */
export type TargetLang = UiLang;

export const UI_LANGS: readonly { id: UiLang; label: string }[] = [
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'es', label: 'Español' },
];

const LANG_KEY = 'spl.lang';
const TARGET_KEY = 'spl.targetLang';

export function isUiLang(v: unknown): v is UiLang {
  return typeof v === 'string' && UI_LANGS.some((l) => l.id === v);
}

/** 把瀏覽器語言（例如 zh-TW、ja-JP）對應到支援的介面語言 */
export function matchLang(tag: string | undefined | null): UiLang {
  const t = (tag ?? '').toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(t)) return 'zh-Hant';
  if (t.startsWith('zh')) return 'zh-Hans';
  if (t.startsWith('ja')) return 'ja';
  if (t.startsWith('ko')) return 'ko';
  if (t.startsWith('es')) return 'es';
  return 'en';
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 無痕模式等情況存不了就算了
  }
}

let current: UiLang | null = null;

export function getLang(): UiLang {
  if (current === null) {
    const saved = readStorage(LANG_KEY);
    current = isUiLang(saved) ? saved : matchLang(globalThis.navigator?.language);
  }
  return current;
}

/** 只改記憶體中的語言（測試用，或已經會重新整理畫面的場合） */
export function setLangNoReload(lang: UiLang): void {
  current = lang;
}

/** 切換介面語言並重新整理頁面（所有畫面都會用新語言重建） */
export function setUiLang(lang: UiLang, reload = true): void {
  writeStorage(LANG_KEY, lang);
  current = lang;
  if (reload && typeof location !== 'undefined') location.reload();
}

/** 翻譯目標語言：使用者沒有另外指定時，跟著介面語言 */
export function getTargetLang(): TargetLang {
  const saved = readStorage(TARGET_KEY);
  return isUiLang(saved) ? saved : getLang();
}

/** 指定翻譯目標語言；傳 null 表示跟著介面語言 */
export function setTargetLang(lang: TargetLang | null): void {
  writeStorage(TARGET_KEY, lang);
}

/** 是否有另外指定翻譯語言（沒有就是跟著介面語言） */
export function hasCustomTargetLang(): boolean {
  return isUiLang(readStorage(TARGET_KEY));
}

export type StringTable<K extends string> = Record<UiLang, Record<K, string>>;

/**
 * 宣告一組字串。用 {name} 當變數，例如 t('loading', { name: '歌單' })。
 * 某語言缺字時依序退回 English、繁體中文。
 */
export function defineStrings<K extends string>(table: StringTable<K>): (key: K, vars?: Record<string, string | number>) => string {
  return (key, vars) => {
    const lang = getLang();
    let s = table[lang]?.[key] ?? table.en?.[key] ?? table['zh-Hant']?.[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    }
    return s;
  };
}

/** 各語言的名稱（給 AI 翻譯的提示用） */
export const LANG_ENGLISH_NAME: Record<TargetLang, string> = {
  'zh-Hant': 'Traditional Chinese (Taiwan)',
  'zh-Hans': 'Simplified Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
};
