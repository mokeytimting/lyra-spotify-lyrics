// @vitest-environment node
import { test, expect } from 'vitest';
import path from 'node:path';
import {
  initJapanese,
  toFuriganaHtml,
  toRomaji,
} from '../../src/text/japanese';

const DICT_PATH = path.resolve('node_modules/kuromoji/dict') + '/';
const TIMEOUT_MS = 30000;

test(
  'toRomaji 在 initJapanese 尚未完成時會自動等待初始化',
  async () => {
    const initPromise = initJapanese(DICT_PATH);
    const romaji = await toRomaji('ゆめ');
    await initPromise;
    expect(romaji).toBe('yume');
  },
  TIMEOUT_MS,
);

test(
  'initJapanese 重複呼叫會回傳同一個 Promise',
  async () => {
    const first = initJapanese(DICT_PATH);
    const second = initJapanese(DICT_PATH);
    expect(second).toBe(first);
    await Promise.all([first, second]);
  },
  TIMEOUT_MS,
);

test(
  'toFuriganaHtml 對「夢」輸出 hiragana ruby 標音',
  async () => {
    const html = await toFuriganaHtml('夢');
    expect(html).toContain('<ruby>夢<rp>(</rp><rt>ゆめ</rt><rp>)</rp></ruby>');
  },
  TIMEOUT_MS,
);

test(
  'toRomaji 對「ゆめ」回傳 yume',
  async () => {
    expect(await toRomaji('ゆめ')).toBe('yume');
  },
  TIMEOUT_MS,
);

test(
  'toRomaji 使用 hepburn 系統（し → shi）',
  async () => {
    expect(await toRomaji('し')).toBe('shi');
  },
  TIMEOUT_MS,
);

test(
  'toFuriganaHtml 對空輸入回傳空字串',
  async () => {
    expect(await toFuriganaHtml('')).toBe('');
  },
  TIMEOUT_MS,
);

test(
  'toRomaji 對空輸入回傳空字串',
  async () => {
    expect(await toRomaji('')).toBe('');
  },
  TIMEOUT_MS,
);

test(
  'toRomaji 對只有空白的輸入回傳空字串',
  async () => {
    expect(await toRomaji('   ')).toBe('');
  },
  TIMEOUT_MS,
);

test(
  'toRomaji 會 trim 前後的空白',
  async () => {
    expect(await toRomaji('  ゆめ  ')).toBe('yume');
  },
  TIMEOUT_MS,
);

test(
  'toRomaji 會把連續空白壓成一個',
  async () => {
    const result = await toRomaji('ゆめ  ゆめ');
    expect(result).not.toMatch(/\s{2,}/);
  },
  TIMEOUT_MS,
);
