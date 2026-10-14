import { test, expect } from 'vitest';
import { toTraditional, isLikelySimplified } from '../../src/text/chinese';

test('toTraditional 將簡體「后来」轉為繁體「後來」', () => {
  expect(toTraditional('后来')).toBe('後來');
});

test('toTraditional 對已是繁體字串原樣回傳', () => {
  expect(toTraditional('後來')).toBe('後來');
});

test('toTraditional 對空字串回傳空字串', () => {
  expect(toTraditional('')).toBe('');
});

test('toTraditional 對純空白字串原樣回傳', () => {
  expect(toTraditional('   ')).toBe('   ');
});

test('isLikelySimplified 對簡體字串回傳 true', () => {
  expect(isLikelySimplified('后来')).toBe(true);
});

test('isLikelySimplified 對繁體字串回傳 false', () => {
  expect(isLikelySimplified('後來')).toBe(false);
});

test('isLikelySimplified 對空字串回傳 false', () => {
  expect(isLikelySimplified('')).toBe(false);
});

test('isLikelySimplified 對純空白字串回傳 false', () => {
  expect(isLikelySimplified('   ')).toBe(false);
});
