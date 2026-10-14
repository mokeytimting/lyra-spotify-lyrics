import { afterEach, expect, test, vi } from 'vitest';

import { LyricsView } from '../../src/ui/lyricsView';

interface ScrollCall {
  top: number;
  behavior: string;
}

function makeRoot(): { root: HTMLDivElement; scrollCalls: ScrollCall[] } {
  localStorage.clear();
  const root = document.createElement('div');
  document.body.appendChild(root);

  const scrollCalls: ScrollCall[] = [];
  const scrollTo = (options?: ScrollToOptions): void => {
    const top =
      options && typeof options.top === 'number' ? options.top : Number.NaN;
    const behavior =
      options && typeof options.behavior === 'string' ? options.behavior : '';
    scrollCalls.push({ top, behavior });
  };
  Object.defineProperty(root, 'scrollTo', {
    configurable: true,
    writable: true,
    value: scrollTo,
  });
  Object.defineProperty(root, 'clientHeight', {
    configurable: true,
    value: 300,
  });

  return { root, scrollCalls };
}

function linesOf(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.line'));
}

function origOf(line: HTMLElement): HTMLElement | null {
  return line.querySelector<HTMLElement>('.orig');
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
});

test('建構子：localStorage 沒有 prefs 時使用預設值', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  expect(view.getOptions()).toEqual({
    showTranslation: true,
    showRomaji: false,
    offsetMs: 0,
  });
});

test('建構子：從 localStorage 讀取已存的 prefs', () => {
  const { root } = makeRoot();
  localStorage.setItem(
    'spl.prefs',
    JSON.stringify({ showTranslation: false, showRomaji: true, offsetMs: 250 }),
  );
  const view = new LyricsView(root, () => {});
  expect(view.getOptions()).toEqual({
    showTranslation: false,
    showRomaji: true,
    offsetMs: 250,
  });
});

test('建構子：localStorage 讀取失敗時使用預設值', () => {
  const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });

  try {
    const { root } = makeRoot();
    const view = new LyricsView(root, () => {});
    expect(view.getOptions()).toEqual({
      showTranslation: true,
      showRomaji: false,
      offsetMs: 0,
    });
  } finally {
    spy.mockRestore();
  }
});

test('setLines：依 lines 建立對應數量的 .line 與 .orig，並帶正確的 data-index', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
      { timeMs: 2000, text: 'c' },
    ],
    'en',
  );
  const els = linesOf(root);
  expect(els.length).toBe(3);
  for (let i = 0; i < els.length; i += 1) {
    expect(els[i].getAttribute('data-index')).toBe(String(i));
    expect(origOf(els[i])?.textContent).toBe(String.fromCharCode(97 + i));
  }
});

test('setLines：空白行顯示 ♪ 並加上 gap class', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: '' },
      { timeMs: 2000, text: 'c' },
    ],
    'en',
  );
  const els = linesOf(root);
  expect(origOf(els[1])?.textContent).toBe('♪');
  const hasGap =
    els[1].classList.contains('gap') ||
    els[1].querySelector('.orig')?.classList.contains('gap') === true;
  expect(hasGap).toBe(true);
  expect(els[0].classList.contains('gap')).toBe(false);
  expect(els[2].classList.contains('gap')).toBe(false);
});

test('setLines：再次呼叫會清空並以新的資料重建 DOM', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
    ],
    'en',
  );
  view.setLines([{ timeMs: 0, text: 'x' }], 'en');
  const els = linesOf(root);
  expect(els.length).toBe(1);
  expect(origOf(els[0])?.textContent).toBe('x');
  expect(els[0].getAttribute('data-index')).toBe('0');
});

test('setLines：空陣列不建立任何 .line', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines([], 'en');
  expect(linesOf(root).length).toBe(0);
});

test('setTranslations：非 null 的行建立 .trans，null 的行沒有 .trans', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
      { timeMs: 2000, text: 'c' },
    ],
    'en',
  );
  view.setTranslations(['甲', null, '丙']);
  const els = linesOf(root);
  expect(els[0].querySelector('.trans')?.textContent).toBe('甲');
  expect(els[1].querySelector('.trans')).toBeNull();
  expect(els[2].querySelector('.trans')?.textContent).toBe('丙');
});

test('setTranslations：先前的 .trans 在變為 null 時被移除', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
    ],
    'en',
  );
  view.setTranslations(['x', 'y']);
  expect(root.querySelectorAll('.trans').length).toBe(2);
  view.setTranslations([null, null]);
  expect(root.querySelectorAll('.trans').length).toBe(0);
});

test('setFurigana：設定 .orig 的 innerHTML，保留 ruby/rt/rp', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines([{ timeMs: 0, text: '夢' }], 'ja');
  view.setFurigana(['<ruby>夢<rp>(</rp><rt>ゆめ</rt><rp>)</rp></ruby>']);
  const orig = root.querySelector<HTMLElement>('.line .orig');
  expect(orig?.querySelector('ruby')).not.toBeNull();
  expect(orig?.querySelector('rt')?.textContent).toBe('ゆめ');
  expect(orig?.querySelector('rp')?.textContent).toBe('(');
});

test('setFurigana：移除不允許的標籤但保留其文字', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines([{ timeMs: 0, text: 'x' }], 'ja');
  view.setFurigana(['<ruby>夢<rt>ゆめ</rt></ruby><b>BOLD</b><span>SPAN</span>']);
  const orig = root.querySelector<HTMLElement>('.line .orig');
  expect(orig?.querySelector('ruby')).not.toBeNull();
  expect(orig?.querySelector('b')).toBeNull();
  expect(orig?.querySelector('span')).toBeNull();
  expect(orig?.textContent?.includes('BOLD')).toBe(true);
  expect(orig?.textContent?.includes('SPAN')).toBe(true);
});

test('setFurigana：null 的那一行不變動 .orig 內容', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
    ],
    'ja',
  );
  view.setFurigana([null, '<ruby>b<rt>び</rt></ruby>']);
  const els = linesOf(root);
  expect(origOf(els[0])?.textContent).toBe('a');
  expect(origOf(els[0])?.querySelector('ruby')).toBeNull();
  expect(origOf(els[1])?.querySelector('ruby')).not.toBeNull();
});

test('setRomaji：非 null 的行建立 .romaji，null 的行移除 .romaji', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
      { timeMs: 2000, text: 'c' },
    ],
    'ja',
  );
  view.setRomaji(['yume', null, 'kaze']);
  const els = linesOf(root);
  expect(els[0].querySelector('.romaji')?.textContent).toBe('yume');
  expect(els[1].querySelector('.romaji')).toBeNull();
  expect(els[2].querySelector('.romaji')?.textContent).toBe('kaze');
  view.setRomaji([null, null, null]);
  expect(root.querySelectorAll('.romaji').length).toBe(0);
});

test('setActive：目前行加 active、之前的行加 past，其他行兩者皆無', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
      { timeMs: 2000, text: 'c' },
      { timeMs: 3000, text: 'd' },
    ],
    'en',
  );
  view.setActive(2);
  const els = linesOf(root);
  expect(els[0].classList.contains('past')).toBe(true);
  expect(els[1].classList.contains('past')).toBe(true);
  expect(els[2].classList.contains('active')).toBe(true);
  expect(els[2].classList.contains('past')).toBe(false);
  expect(els[3].classList.contains('active')).toBe(false);
  expect(els[3].classList.contains('past')).toBe(false);
});

test('setActive：再次呼叫時，前一個 active 會被換成 past', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
      { timeMs: 2000, text: 'c' },
    ],
    'en',
  );
  view.setActive(1);
  view.setActive(2);
  const els = linesOf(root);
  expect(els[1].classList.contains('active')).toBe(false);
  expect(els[1].classList.contains('past')).toBe(true);
  expect(els[2].classList.contains('active')).toBe(true);
});

function twoLines(view: LyricsView, root: HTMLElement): HTMLElement[] {
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1000, text: 'b' },
    ],
    'en',
  );
  const els = linesOf(root);
  Object.defineProperty(els[0], 'offsetTop', { value: 0, configurable: true });
  Object.defineProperty(els[1], 'offsetTop', { value: 100, configurable: true });
  return els;
}

test('setLines：第一句對齊在畫面 35% 的位置', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  twoLines(view, root);
  view.setActive(-1);
  expect(view.getShift()).toBeCloseTo(300 * 0.35, 5);
});

test('setActive：換行時把目前行移到 35% 的位置（--shift = clientHeight * 0.35 - offsetTop）', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  twoLines(view, root);
  view.setActive(1);
  expect(view.getShift()).toBeCloseTo(300 * 0.35 - 100, 5);
  expect(root.style.getPropertyValue('--shift')).toBe(`${Math.round(300 * 0.35 - 100)}px`);
});

test('setActive：下面的行依距離錯開開始時間（波浪）', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setLines(
    [0, 1, 2, 3].map((i) => ({ timeMs: i * 1000, text: `l${i}` })),
    'en',
  );
  view.setActive(1);
  const delays = linesOf(root).map((el) => parseInt(el.style.getPropertyValue('--delay'), 10));
  expect(delays[0]).toBe(0);
  expect(delays[1]).toBeLessThan(delays[2]);
  expect(delays[2]).toBeLessThan(delays[3]);
});

test('setActive：3 秒內使用者有 wheel 捲動則不自動對齊', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  twoLines(view, root);
  const before = view.getShift();
  root.dispatchEvent(new Event('wheel'));
  view.setActive(1);
  expect(view.getShift()).toBe(before);
});

test('setActive：3 秒內使用者有 touchmove 捲動則不自動對齊', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  twoLines(view, root);
  const before = view.getShift();
  root.dispatchEvent(new Event('touchmove'));
  view.setActive(1);
  expect(view.getShift()).toBe(before);
});

test(
  'setActive：超過 3 秒後手動捲動的抑制失效，會自動對齊',
  async () => {
    const { root } = makeRoot();
    const view = new LyricsView(root, () => {});
    twoLines(view, root);
    root.dispatchEvent(new Event('wheel'));
    await new Promise((resolve) => setTimeout(resolve, 3100));
    view.setActive(1);
    expect(view.getShift()).toBeCloseTo(300 * 0.35 - 100, 5);
  },
  15000,
);

test('setOptions：合併設定並寫入 localStorage 的 spl.prefs', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setOptions({ showTranslation: false });
  const raw = localStorage.getItem('spl.prefs');
  expect(raw).not.toBeNull();
  const stored = JSON.parse(raw as string) as {
    showTranslation: boolean;
    showRomaji: boolean;
    offsetMs: number;
  };
  expect(stored.showTranslation).toBe(false);
  expect(stored.showRomaji).toBe(false);
  expect(stored.offsetMs).toBe(0);
  expect(view.getOptions()).toEqual({
    showTranslation: false,
    showRomaji: false,
    offsetMs: 0,
  });
});

test('setOptions：showTranslation 切換 root 上的 hide-trans class', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setOptions({ showTranslation: false });
  expect(root.classList.contains('hide-trans')).toBe(true);
  view.setOptions({ showTranslation: true });
  expect(root.classList.contains('hide-trans')).toBe(false);
});

test('setOptions：showRomaji 切換 root 上的 show-romaji class', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setOptions({ showRomaji: true });
  expect(root.classList.contains('show-romaji')).toBe(true);
  view.setOptions({ showRomaji: false });
  expect(root.classList.contains('show-romaji')).toBe(false);
});

test('setOptions：多次呼叫會保留先前欄位', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setOptions({ showRomaji: true });
  view.setOptions({ offsetMs: 500 });
  expect(view.getOptions()).toEqual({
    showTranslation: true,
    showRomaji: true,
    offsetMs: 500,
  });
});

test('getOptions：回傳目前合併後的設定物件', () => {
  const { root } = makeRoot();
  const view = new LyricsView(root, () => {});
  view.setOptions({ offsetMs: -200 });
  expect(view.getOptions()).toEqual({
    showTranslation: true,
    showRomaji: false,
    offsetMs: -200,
  });
});

test('點擊 .line：以該行的 timeMs 呼叫 onSeek', () => {
  const { root } = makeRoot();
  const seeks: number[] = [];
  const view = new LyricsView(root, (ms) => {
    seeks.push(ms);
  });
  view.setLines(
    [
      { timeMs: 0, text: 'a' },
      { timeMs: 1234, text: 'b' },
      { timeMs: 5000, text: 'c' },
    ],
    'en',
  );
  const els = linesOf(root);
  els[1].click();
  expect(seeks).toEqual([1234]);
});
