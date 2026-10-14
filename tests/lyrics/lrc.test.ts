import { test, expect } from 'vitest';

import { parseLrc, lineIndexAt, cleanTitle } from '../../src/lyrics/lrc';

test('parseLrc 支援 [mm:ss.xx]，一行多個時間標籤會展開並依時間排序', () => {
  expect(parseLrc('[00:12.30]a\n[00:05.00][00:20.5]b')).toEqual([
    { timeMs: 5000, text: 'b' },
    { timeMs: 12300, text: 'a' },
    { timeMs: 20500, text: 'b' },
  ]);
});

test('parseLrc 支援 [mm:ss]、[mm:ss.xx]、[mm:ss.xxx] 三種時間格式', () => {
  expect(parseLrc('[00:01]a')).toEqual([{ timeMs: 1000, text: 'a' }]);
  expect(parseLrc('[00:01.5]a')).toEqual([{ timeMs: 1500, text: 'a' }]);
  expect(parseLrc('[00:01.50]a')).toEqual([{ timeMs: 1500, text: 'a' }]);
  expect(parseLrc('[00:01.500]a')).toEqual([{ timeMs: 1500, text: 'a' }]);
});

test('parseLrc 套用 [offset:+ms]：所有時間減去該值，減完小於 0 時取 0', () => {
  expect(parseLrc('[offset:+500]\n[00:01.00]x')).toEqual([{ timeMs: 500, text: 'x' }]);
  expect(parseLrc('[offset:-500]\n[00:01.00]x')).toEqual([{ timeMs: 1500, text: 'x' }]);
  expect(parseLrc('[offset:+5000]\n[00:01.00]x')).toEqual([{ timeMs: 0, text: 'x' }]);
  expect(parseLrc('[offset:+1000]\n[00:01.00]x')).toEqual([{ timeMs: 0, text: 'x' }]);
});

test('parseLrc 略過 metadata 標籤', () => {
  expect(parseLrc('[ar:Some Artist]\n[ti:Some Title]\n[al:Some Album]\n[by:Someone]\n[00:01.00]a')).toEqual([
    { timeMs: 1000, text: 'a' },
  ]);
});

test('parseLrc 保留有時間標籤但沒有文字的行，文字為空字串（間奏）', () => {
  expect(parseLrc('[00:12.00]a\n[00:15.00]\n[00:20.00]b')).toEqual([
    { timeMs: 12000, text: 'a' },
    { timeMs: 15000, text: '' },
    { timeMs: 20000, text: 'b' },
  ]);
});

test('parseLrc 對空字串與只有空白字元的輸入回傳空陣列', () => {
  expect(parseLrc('')).toEqual([]);
  expect(parseLrc('   \n  \n\t')).toEqual([]);
});

test('lineIndexAt 在第一行之前回傳 -1', () => {
  const lines = [
    { timeMs: 5000, text: 'b' },
    { timeMs: 12300, text: 'a' },
    { timeMs: 20500, text: 'b' },
  ];
  expect(lineIndexAt(lines, 0)).toBe(-1);
  expect(lineIndexAt(lines, 4999)).toBe(-1);
});

test('lineIndexAt 在時間剛好等於某行時回傳該行索引，其餘回傳最後一個不大於該時間的行', () => {
  const lines = [
    { timeMs: 5000, text: 'b' },
    { timeMs: 12300, text: 'a' },
    { timeMs: 20500, text: 'b' },
  ];
  expect(lineIndexAt(lines, 5000)).toBe(0);
  expect(lineIndexAt(lines, 6000)).toBe(0);
  expect(lineIndexAt(lines, 12300)).toBe(1);
  expect(lineIndexAt(lines, 12301)).toBe(1);
  expect(lineIndexAt(lines, 20500)).toBe(2);
  expect(lineIndexAt(lines, 999999)).toBe(2);
});

test('lineIndexAt 對空陣列回傳 -1', () => {
  expect(lineIndexAt([], 0)).toBe(-1);
  expect(lineIndexAt([], 12345)).toBe(-1);
});

test('cleanTitle 去掉「 - Remastered」「 - Remaster」「 - Live」「 - Single Version」等版本說明', () => {
  expect(cleanTitle('Yesterday - Remastered 2009')).toBe('Yesterday');
  expect(cleanTitle('Yesterday - Remaster 2011')).toBe('Yesterday');
  expect(cleanTitle('Yesterday - Live at Wembley')).toBe('Yesterday');
  expect(cleanTitle('Yesterday - Single Version')).toBe('Yesterday');
});

test('cleanTitle 去掉括號內 feat./ft./with 段落與方括號段落', () => {
  expect(cleanTitle('Song (feat. X)')).toBe('Song');
  expect(cleanTitle('Song (ft. X)')).toBe('Song');
  expect(cleanTitle('Song (with X)')).toBe('Song');
  expect(cleanTitle('Song [Bonus Track]')).toBe('Song');
});

test('cleanTitle 會 trim 前後空白', () => {
  expect(cleanTitle('   Yesterday   ')).toBe('Yesterday');
});

test('cleanTitle 對沒有版本說明的歌名原樣回傳', () => {
  expect(cleanTitle('Yesterday')).toBe('Yesterday');
  expect(cleanTitle('  Song  ')).toBe('Song');
});

test('cleanTitle 去掉所有內容後變成空字串時回傳原字串', () => {
  expect(cleanTitle('(feat. X)')).toBe('(feat. X)');
  expect(cleanTitle('[Bonus Track]')).toBe('[Bonus Track]');
});
