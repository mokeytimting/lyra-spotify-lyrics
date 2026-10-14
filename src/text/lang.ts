import type { TargetLang } from '../i18n';

/** 'en' 代表以拉丁字母為主的歌（英文、西班牙文等） */
export type SongLang = 'ja' | 'zh' | 'en' | 'ko' | 'other';

/** 平假名、片假名（含濁點、半濁點、長音符等） */
const KANA_RE = /[\u3040-\u30ff]/;
/** 漢字（含擴充 A） */
const HANZI_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
/** 拉丁字母（Basic Latin + Latin-1 Supplement + Latin Extended-A/B） */
const LATIN_RE = /[A-Za-z\u00c0-\u024f]/;
/** 任何 Unicode 字母（用來判斷「這行是否只有標點、數字、符號」） */
const ANY_LETTER_RE = /\p{L}/u;

const HANZI_G = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
const LATIN_G = /[A-Za-z\u00c0-\u024f]/g;
/** \u97d3\u6587\u5b57\u6bcd\uff08\u8afa\u6587\u97f3\u7bc0\u3001\u5b57\u6bcd\uff09 */
const HANGUL_G = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/g;
const ANY_LETTER_G = /\p{L}/gu;

function countMatches(text: string, re: RegExp): number {
  const matched = text.match(re);
  return matched === null ? 0 : matched.length;
}

function countKana(text: string): number {
  return countMatches(text, new RegExp(KANA_RE.source, 'g'));
}

function countHanzi(text: string): number {
  return countMatches(text, HANZI_G);
}

function countLatin(text: string): number {
  return countMatches(text, LATIN_G);
}

function countLetters(text: string): number {
  return countMatches(text, ANY_LETTER_G);
}

/**
 * 以整首歌的內容判斷語言。
 * - 出現假名的行數超過 3 行（>= 4 行）→ 'ja'
 * - 漢字佔（漢字 + 拉丁字母）的比例超過 50%，且假名行數 <= 3 → 'zh'
 * - 拉丁字母佔多數 → 'en'
 * - 其他（韓文、西里爾文、無字母內容等）→ 'other'
 */
export function detectSongLang(lines: string[]): SongLang {
  let kanaLines = 0;
  let hanziTotal = 0;
  let latinTotal = 0;
  let hangulTotal = 0;

  for (const line of lines) {
    if (typeof line !== 'string') continue;
    if (KANA_RE.test(line)) kanaLines += 1;
    hanziTotal += countHanzi(line);
    latinTotal += countLatin(line);
    hangulTotal += countMatches(line, HANGUL_G);
  }

  if (kanaLines > 3) return 'ja';
  if (hangulTotal > 0 && hangulTotal / (hangulTotal + hanziTotal + latinTotal) > 0.5) return 'ko';

  const letterTotal = hanziTotal + latinTotal;
  if (letterTotal > 0 && hanziTotal / letterTotal > 0.5) return 'zh';
  if (letterTotal > 0 && latinTotal / letterTotal > 0.5) return 'en';
  return 'other';
}

/**
 * 判斷單行是否需要翻譯。
 * - 空白行、只有標點／數字／符號的行 → false
 * - 中文歌（songLang === 'zh'）整首不翻譯 → false
 * - 非中文歌中，含漢字、不含假名、且漢字佔該行字母字元多數的行（歌中的中文句子）→ false
 * - 其餘（含非中文歌裡的英文行、日文行、韓文行等）→ true
 */
export function needsTranslation(
  line: string,
  songLang: SongLang,
  target: TargetLang = 'zh-Hant',
): boolean {
  if (typeof line !== 'string') return false;

  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (!ANY_LETTER_RE.test(trimmed)) return false;

  const kanaCount = countKana(trimmed);
  const hanziCount = countHanzi(trimmed);
  const letters = countLetters(trimmed);

  // 已經是目標語言的歌／行就不翻
  if (target === 'zh-Hant' || target === 'zh-Hans') {
    if (songLang === 'zh') return false;
    if (hanziCount > 0 && kanaCount === 0 && letters > 0 && hanziCount * 2 > letters) return false;
    return true;
  }
  const latinMajority = letters > 0 && countLatin(trimmed) * 2 > letters;
  if (target === 'ja') {
    if (kanaCount > 0) return false;
    // 只有漢字的行：日文歌裡多半是日文，不翻；其他歌（例如中文歌）要翻
    if (!latinMajority && hanziCount > 0) return songLang !== 'ja';
    return true;
  }
  if (target === 'ko') {
    return countMatches(trimmed, HANGUL_G) === 0;
  }
  // en / es：拉丁字母為主的行不翻
  return !latinMajority;
}
