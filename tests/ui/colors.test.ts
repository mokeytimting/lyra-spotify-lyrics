import { test, expect } from 'vitest';

import { extractPalette } from '../../src/ui/colors';

const DEFAULT_GREYS = ['#222222', '#333333', '#444444'];

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];

interface Pixels {
  data: number[];
  width: number;
  height: number;
}

function image(pixels: number[][]): Pixels {
  const data: number[] = [];
  for (const pixel of pixels) {
    const r = pixel[0] ?? 0;
    const g = pixel[1] ?? 0;
    const b = pixel[2] ?? 0;
    const a = pixel[3] ?? 255;
    data.push(r, g, b, a);
  }
  return { data, width: pixels.length, height: 1 };
}

function repeat(pixel: number[], count: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(pixel.slice());
  }
  return out;
}

test('returns the default greys when the image has no pixels', () => {
  expect(extractPalette({ data: [], width: 0, height: 0 })).toEqual(DEFAULT_GREYS);
  expect(extractPalette({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toEqual(DEFAULT_GREYS);
});

test('returns lowercase #rrggbb strings and pads to three colours for a solid red image', () => {
  const palette = extractPalette(image(repeat(RED, 4)));
  expect(palette.length).toBe(3);
  for (const colour of palette) {
    expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  }
  expect(palette).toEqual(['#ff0000', '#ff0000', '#ff0000']);
});

test('reports both dominant colours of a half red half blue image', () => {
  const palette = extractPalette(image([...repeat(RED, 4), ...repeat(BLUE, 4)]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#ff0000')).toBe(true);
  expect(palette.includes('#0000ff')).toBe(true);
});

test('orders colours by pixel count and keeps the top three', () => {
  const pixels = [...repeat(RED, 5), ...repeat(GREEN, 3), BLUE.slice()];
  expect(extractPalette(image(pixels))).toEqual(['#ff0000', '#00ff00', '#0000ff']);
});

test('skips pixels whose alpha is below 128', () => {
  const palette = extractPalette(image([[255, 0, 0, 0], [0, 0, 255, 255]]));
  expect(palette).toEqual(['#0000ff', '#0000ff', '#0000ff']);
});

test('keeps pixels whose alpha is exactly 128', () => {
  const palette = extractPalette(image([[255, 0, 0, 128]]));
  expect(palette).toEqual(['#ff0000', '#ff0000', '#ff0000']);
});

test('excludes a bin that is darker than the 0.10 lightness bound', () => {
  const palette = extractPalette(image([[0, 0, 0], GREEN.slice()]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#00ff00')).toBe(true);
  expect(palette.includes('#000000')).toBe(false);
});

test('excludes a bin that is lighter than the 0.95 lightness bound', () => {
  const palette = extractPalette(image([[255, 255, 255], GREEN.slice()]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#00ff00')).toBe(true);
  expect(palette.includes('#ffffff')).toBe(false);
});

test('keeps a bin whose lightness is exactly at the 0.10 lower bound', () => {
  const palette = extractPalette(image([[51, 0, 0], GREEN.slice()]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#330000')).toBe(true);
});

test('excludes a bin whose lightness is just below the 0.10 lower bound', () => {
  const palette = extractPalette(image([[50, 0, 0], GREEN.slice()]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#00ff00')).toBe(true);
  expect(palette.includes('#320000')).toBe(false);
});

test('keeps a bin whose lightness is just below the 0.95 upper bound', () => {
  const palette = extractPalette(image([[242, 242, 242], GREEN.slice()]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#f2f2f2')).toBe(true);
});

test('excludes a bin whose lightness is just above the 0.95 upper bound', () => {
  const palette = extractPalette(image([[243, 243, 243], GREEN.slice()]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#00ff00')).toBe(true);
  expect(palette.includes('#f3f3f3')).toBe(false);
});

test('falls back to counting every bin when all bins are excluded by lightness', () => {
  expect(extractPalette(image(repeat([255, 255, 255], 3)))).toEqual([
    '#ffffff',
    '#ffffff',
    '#ffffff',
  ]);
  expect(extractPalette(image(repeat([0, 0, 0], 3)))).toEqual([
    '#000000',
    '#000000',
    '#000000',
  ]);
});

test('represents a bin by the average colour of the pixels it contains', () => {
  // 240..255 and 248..255 quantise to the same 4-bit bin, so the bin colour is the average 244.
  const palette = extractPalette(image([[240, 0, 0], [248, 0, 0]]));
  expect(palette).toEqual(['#f40000', '#f40000', '#f40000']);
});

test('quantises each channel separately into its own 4-bit bin', () => {
  // 255>>4 === 15 and 224>>4 === 14, so the two pixels land in different bins.
  const palette = extractPalette(image([[255, 0, 0], [224, 0, 0]]));
  expect(palette.length).toBe(3);
  expect(palette.includes('#ff0000')).toBe(true);
  expect(palette.includes('#e00000')).toBe(true);
});

test('accepts a Uint8ClampedArray as pixel data', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]);
  expect(extractPalette({ data, width: 2, height: 1 })).toEqual(['#ff0000', '#ff0000', '#ff0000']);
});
