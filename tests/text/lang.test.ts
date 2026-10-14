import { test, expect } from 'vitest';

import { detectSongLang, needsTranslation } from '../../src/text/lang';

const ALL_LANGS: string[] = ['ja', 'zh', 'en', 'ko', 'other'];

/* ---------------- detectSongLang ---------------- */

test('detectSongLang: 假名行超過 3 行 → ja', () => {
  expect(detectSongLang(['夢を見る', '君の名前', 'さようなら', 'ありがとう'])).toBe('ja');
});

test('detectSongLang: 日文歌裡有一行英文，整首仍判為 ja', () => {
  expect(
    detectSongLang(['夢を見る', '君の名前', 'さようなら', 'ありがとう', 'Hello world']),
  ).toBe('ja');
});

test('detectSongLang: 假名行剛好 3 行不算 ja（規則為「超過 3 行」）', () => {
  expect(detectSongLang(['我愛你', '你愛我', 'ら', 'り', 'る'])).toBe('zh');
});

test('detectSongLang: 假名行 4 行即為 ja', () => {
  expect(detectSongLang(['我愛你', 'ら', 'り', 'る', 'れ'])).toBe('ja');
});

test('detectSongLang: 漢字佔字母字元多數且假名行 <= 3 → zh', () => {
  expect(detectSongLang(['后来', '我们都哭了'])).toBe('zh');
});

test('detectSongLang: 以拉丁字母為主 → en', () => {
  expect(detectSongLang(['Hello world', 'How are you today'])).toBe('en');
});

test('detectSongLang: 韓文為主 → ko', () => {
  expect(detectSongLang(['안녕하세요', '반갑습니다'])).toBe('ko');
});

test('detectSongLang: 西里爾文等其他文字 → other', () => {
  expect(detectSongLang(['Привет мир', 'Как дела'])).toBe('other');
});

test('needsTranslation 依目標語言略過已經是該語言的行', () => {
  expect(needsTranslation('hello there', 'en', 'en')).toBe(false);
  expect(needsTranslation('夢ならば', 'ja', 'ja')).toBe(false);
  expect(needsTranslation('夢ならば', 'ja', 'en')).toBe(true);
  expect(needsTranslation('사랑해', 'ko', 'ko')).toBe(false);
  expect(needsTranslation('사랑해', 'ko', 'zh-Hant')).toBe(true);
  expect(needsTranslation('hello there', 'ja', 'ja')).toBe(true);
  expect(needsTranslation('我愛你', 'zh', 'en')).toBe(true);
});

test('detectSongLang: 空陣列不丟錯，回傳合法的語言分類', () => {
  expect(ALL_LANGS).toContain(detectSongLang([]));
});

test('detectSongLang: 只有空白的行不丟錯，回傳合法的語言分類', () => {
  expect(ALL_LANGS).toContain(detectSongLang(['   ', '\t', '\n']));
});

/* ---------------- needsTranslation ---------------- */

test('needsTranslation: zh 歌一律 false（連純英文行、韓文行也是）', () => {
  expect(needsTranslation('Hello world', 'zh')).toBe(false);
  expect(needsTranslation('我愛你', 'zh')).toBe(false);
  expect(needsTranslation('안녕하세요', 'zh')).toBe(false);
});

test('needsTranslation: 空字串與只含空白 → false', () => {
  expect(needsTranslation('', 'ja')).toBe(false);
  expect(needsTranslation('   ', 'ja')).toBe(false);
  expect(needsTranslation(' \t ', 'en')).toBe(false);
  expect(needsTranslation('', 'zh')).toBe(false);
  expect(needsTranslation('', 'other')).toBe(false);
});

test('needsTranslation: 只有數字、標點或符號 → false', () => {
  expect(needsTranslation('12345', 'ja')).toBe(false);
  expect(needsTranslation('!!!...', 'en')).toBe(false);
  expect(needsTranslation('♪♪', 'ja')).toBe(false);
  expect(needsTranslation('1,234!', 'en')).toBe(false);
});

test('needsTranslation: 日文歌裡的純英文行要翻譯', () => {
  expect(needsTranslation('Hello world', 'ja')).toBe(true);
});

test('needsTranslation: 含假名的行要翻譯（即使同時有漢字）', () => {
  expect(needsTranslation('こんにちは', 'ja')).toBe(true);
  expect(needsTranslation('夢を見る', 'ja')).toBe(true);
});

test('needsTranslation: 非 zh 歌中「有漢字、沒假名、漢字佔字母字元多數」的行 → false', () => {
  expect(needsTranslation('我愛你', 'ja')).toBe(false);
  expect(needsTranslation('我愛你', 'en')).toBe(false);
  expect(needsTranslation('我愛你', 'other')).toBe(false);
});

test('needsTranslation: 漢字與拉丁字母數量相同不算「漢字佔多數」→ true', () => {
  expect(needsTranslation('我愛你abc', 'en')).toBe(true);
});

test('needsTranslation: 漢字多於拉丁字母 → false', () => {
  expect(needsTranslation('我愛你a', 'en')).toBe(false);
});

test('needsTranslation: 純拉丁字母的行在非 zh 歌中要翻譯', () => {
  expect(needsTranslation('Hello', 'en')).toBe(true);
  expect(needsTranslation('Hello', 'ja')).toBe(true);
  expect(needsTranslation('Hello', 'other')).toBe(true);
});

test('needsTranslation: 韓文等其他文字在非 zh 歌中要翻譯', () => {
  expect(needsTranslation('안녕하세요', 'other')).toBe(true);
  expect(needsTranslation('안녕하세요', 'en')).toBe(true);
  expect(needsTranslation('안녕하세요', 'ja')).toBe(true);
});
