import { test, expect, vi, beforeEach, afterEach } from 'vitest';

import { setBackground, updateBackgroundFromImage } from '../../src/ui/background';

/** 沒有封面或載入失敗時使用的預設色盤（與實作一致） */
const DEFAULT_PALETTE = ['#2a2a35', '#3a2f45', '#1f2a3a'] as const;

interface FakeRoot {
  style: {
    setProperty(name: string, value: string): void;
  };
}

let props: Map<string, string>;
let root: FakeRoot;

/** 建立假的 root 元素，並掛成 document.documentElement */
beforeEach(() => {
  props = new Map<string, string>();
  root = {
    style: {
      setProperty(name: string, value: string): void {
        props.set(name, value);
      },
    },
  };
  vi.stubGlobal('document', { documentElement: root });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 產生一張單色影像資料（測試用的假 ImageData） */
function solidImage(r: number, g: number, b: number, size = 4): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i + 3 < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { data, width: size, height: size } as unknown as ImageData;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('setBackground 把三個顏色設到 root 的 --c1/--c2/--c3', () => {
  setBackground(['#111111', '#222222', '#333333'], root as unknown as HTMLElement);

  expect(props.get('--c1')).toBe('#111111');
  expect(props.get('--c2')).toBe('#222222');
  expect(props.get('--c3')).toBe('#333333');
});

test('setBackground 未指定 root 時預設使用 document.documentElement', () => {
  setBackground(['#aabbcc', '#ddeeff', '#001122']);

  expect(props.get('--c1')).toBe('#aabbcc');
  expect(props.get('--c2')).toBe('#ddeeff');
  expect(props.get('--c3')).toBe('#001122');
});

test('updateBackgroundFromImage 在 url 為 null 時套用預設色盤且不載入圖片', async () => {
  const load = vi.fn(async (): Promise<ImageData> => solidImage(255, 0, 0));

  await updateBackgroundFromImage(null, load);

  expect(load).not.toHaveBeenCalled();
  expect(props.get('--c1')).toBe(DEFAULT_PALETTE[0]);
  expect(props.get('--c2')).toBe(DEFAULT_PALETTE[1]);
  expect(props.get('--c3')).toBe(DEFAULT_PALETTE[2]);
});

test('updateBackgroundFromImage 用 url 載入圖片並套用抽出的色盤', async () => {
  const load = vi.fn(async (_url: string): Promise<ImageData> => solidImage(255, 0, 0));

  await updateBackgroundFromImage('https://example.test/cover.png', load);

  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith('https://example.test/cover.png');
  expect(props.get('--c1')).toBe('#ff0000');
  expect(props.get('--c2')).toBe('#ff0000');
  expect(props.get('--c3')).toBe('#ff0000');
});

test('updateBackgroundFromImage 在載入失敗時套用預設色盤且不丟出錯誤', async () => {
  const load = vi.fn(async (): Promise<ImageData> => {
    throw new Error('載入失敗');
  });

  await expect(
    updateBackgroundFromImage('https://example.test/broken.png', load),
  ).resolves.toBeUndefined();

  expect(props.get('--c1')).toBe(DEFAULT_PALETTE[0]);
  expect(props.get('--c2')).toBe(DEFAULT_PALETTE[1]);
  expect(props.get('--c3')).toBe(DEFAULT_PALETTE[2]);
});

test('updateBackgroundFromImage 較舊呼叫的結果會在較新呼叫之後被丟棄', async () => {
  const first = deferred<ImageData>();
  const second = deferred<ImageData>();
  const load = (url: string): Promise<ImageData> =>
    url === 'first' ? first.promise : second.promise;

  const p1 = updateBackgroundFromImage('first', load);
  const p2 = updateBackgroundFromImage('second', load);

  second.resolve(solidImage(0, 0, 255));
  await p2;
  expect(props.get('--c1')).toBe('#0000ff');

  first.resolve(solidImage(255, 0, 0));
  await p1;
  expect(props.get('--c1')).toBe('#0000ff');
  expect(props.get('--c2')).toBe('#0000ff');
  expect(props.get('--c3')).toBe('#0000ff');
});
