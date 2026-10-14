import { afterEach, expect, test } from 'vitest';
import { LyricsPicker } from '../../src/ui/lyricsPicker';

interface SearchItem {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  durationSec: number;
  synced: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mk(over: Partial<SearchItem> = {}): SearchItem {
  return {
    id: 1,
    trackName: 'Song',
    artistName: 'Artist',
    albumName: 'Album',
    durationSec: 100,
    synced: true,
    ...over,
  };
}

function mountRoot(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'picker';
  document.body.appendChild(root);
  return root;
}

function makePicker(
  root: HTMLElement,
  results: SearchItem[],
  onPick: (id: number) => void | Promise<void> = () => undefined,
): { picker: LyricsPicker; searches: string[] } {
  const searches: string[] = [];
  const deps = {
    search: (q: string): Promise<SearchItem[]> => {
      searches.push(q);
      return Promise.resolve(results);
    },
    onPick,
  };
  const picker = new LyricsPicker(root, deps);
  return { picker, searches };
}

function items(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('.picker-item'));
}

function itemByName(root: HTMLElement, name: string): HTMLButtonElement {
  const found = items(root).find(
    (el) => el.querySelector('.name')?.textContent === name,
  );
  expect(found, `列表中應該要有 name 為「${name}」的項目`).toBeDefined();
  return found as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

test('open() 會為 root 加上 class open 並使 isOpen() 為 true，close() 會移除並使 isOpen() 為 false', async () => {
  const root = mountRoot();
  const { picker } = makePicker(root, []);
  expect(picker.isOpen()).toBe(false);
  picker.open('q', 100);
  expect(picker.isOpen()).toBe(true);
  expect(root.classList.contains('open')).toBe(true);
  picker.close();
  expect(picker.isOpen()).toBe(false);
  expect(root.classList.contains('open')).toBe(false);
  await delay(0);
});

test('DOM 結構：picker-card > picker-head(h3「手動搜尋歌詞」+ button.picker-close aria-label「關閉」) + input.picker-q[type=search] + picker-list + p.picker-note', async () => {
  const root = mountRoot();
  const { picker } = makePicker(root, []);
  picker.open('q', 100);

  const card = root.querySelector('.picker-card');
  expect(card, 'root 內應該要有 .picker-card').not.toBeNull();

  const head = card!.querySelector('.picker-head');
  expect(head, '.picker-card 內應該要有 .picker-head').not.toBeNull();

  const heading = head!.querySelector('h3');
  expect(heading, '.picker-head 內應該要有 h3').not.toBeNull();
  expect(heading!.textContent).toBe('手動搜尋歌詞');

  const closeBtn = head!.querySelector('button.picker-close');
  expect(closeBtn, '.picker-head 內應該要有 button.picker-close').not.toBeNull();
  expect(closeBtn!.getAttribute('aria-label')).toBe('關閉');

  const input = card!.querySelector('input.picker-q');
  expect(input, '.picker-card 內應該要有 input.picker-q').not.toBeNull();
  expect(input!.getAttribute('type')).toBe('search');

  expect(card!.querySelector('.picker-list'), '.picker-card 內應該要有 .picker-list').not.toBeNull();

  const note = card!.querySelector('p.picker-note');
  expect(note, '.picker-card 內應該要有 p.picker-note').not.toBeNull();
  expect(note!.textContent).toBe('歌詞來自 LRCLIB 社群資料庫；選好後這首歌會記住你的選擇');

  await delay(0);
});

test('open(initialQuery) 會把 initialQuery 填入 input.picker-q 並讓 input 取得焦點', async () => {
  const root = mountRoot();
  const { picker } = makePicker(root, []);
  picker.open('夜的第七章', 100);

  const input = root.querySelector<HTMLInputElement>('input.picker-q');
  expect(input).not.toBeNull();
  expect(input!.value).toBe('夜的第七章');
  expect(document.activeElement).toBe(input);

  await delay(0);
});

test('open() 會立刻以 initialQuery 搜尋一次', async () => {
  const root = mountRoot();
  const { picker, searches } = makePicker(root, []);
  picker.open('hello', 100);
  await delay(0);
  expect(searches).toEqual(['hello']);
});

test('input 停止輸入 350ms 後才搜尋（debounce）；未滿 350ms 不搜尋', async () => {
  const root = mountRoot();
  const { picker, searches } = makePicker(root, []);
  picker.open('', 100);
  await delay(0);
  expect(searches).toEqual(['']);

  const input = root.querySelector<HTMLInputElement>('input.picker-q');
  expect(input).not.toBeNull();
  input!.value = 'abc';
  input!.dispatchEvent(new Event('input', { bubbles: true }));

  await delay(200);
  expect(searches, '200ms 時不應該已經搜尋').toEqual(['']);

  await delay(300);
  expect(searches, '超過 350ms 後應該搜尋最新輸入').toEqual(['', 'abc']);
});

test('連續輸入多次只會在停止後搜尋最後一次的查詢字串', async () => {
  const root = mountRoot();
  const { picker, searches } = makePicker(root, []);
  picker.open('', 100);
  await delay(0);

  const input = root.querySelector<HTMLInputElement>('input.picker-q');
  expect(input).not.toBeNull();
  input!.value = 'a';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(100);
  input!.value = 'ab';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(100);
  input!.value = 'abc';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(450);

  expect(searches).toEqual(['', 'abc']);
});

test('過時的搜尋結果會被丟棄', async () => {
  const root = mountRoot();
  let resolveFirst: ((value: SearchItem[]) => void) | null = null;
  const searches: string[] = [];
  const deps = {
    search: (q: string): Promise<SearchItem[]> => {
      searches.push(q);
      if (q === 'old') {
        return new Promise<SearchItem[]>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve([
        mk({ id: 9, trackName: 'NEW', durationSec: 100, synced: true }),
      ]);
    },
    onPick: () => undefined,
  };
  const picker = new LyricsPicker(root, deps);

  picker.open('old', 100);
  await delay(0);

  const input = root.querySelector<HTMLInputElement>('input.picker-q');
  expect(input).not.toBeNull();
  input!.value = 'new';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(450);

  const listBefore = root.querySelector('.picker-list')?.textContent ?? '';
  expect(listBefore).toMatch(/NEW/);

  expect(resolveFirst, '第一次搜尋應該有被呼叫').not.toBeNull();
  resolveFirst!([mk({ id: 1, trackName: 'OLD', durationSec: 100, synced: true })]);
  await delay(20);

  const listAfter = root.querySelector('.picker-list')?.textContent ?? '';
  expect(listAfter).toMatch(/NEW/);
  expect(listAfter).not.toMatch(/OLD/);
  expect(searches).toEqual(['old', 'new']);
});

test('每筆結果的 DOM：span.name 為 trackName、span.sub 為 artistName · albumName、span.dur 為 m:ss', async () => {
  const root = mountRoot();
  const results = [
    mk({ id: 1, trackName: '同步歌', artistName: 'A', albumName: 'B', durationSec: 65, synced: true }),
    mk({ id: 2, trackName: '純文字歌', artistName: 'C', albumName: 'D', durationSec: 66, synced: false }),
  ];
  const { picker } = makePicker(root, results);
  picker.open('q', 65);
  await delay(0);

  const synced = itemByName(root, '同步歌');
  expect(synced.querySelector('.name')?.textContent).toBe('同步歌');
  expect(synced.querySelector('.sub')?.textContent).toBe('A · B');
  expect(synced.querySelector('.dur')?.textContent).toBe('1:05');

  const plain = itemByName(root, '純文字歌');
  expect(plain.querySelector('.name')?.textContent).toBe('純文字歌');
  expect(plain.querySelector('.sub')?.textContent).toBe('C · D');
  expect(plain.querySelector('.dur')?.textContent).toBe('1:06');
});

test('span.badge：synced 為 true 時文字「同步」並加 class synced，否則「純文字」', async () => {
  const root = mountRoot();
  const results = [
    mk({ id: 1, trackName: '同步歌', durationSec: 100, synced: true }),
    mk({ id: 2, trackName: '純文字歌', durationSec: 100, synced: false }),
  ];
  const { picker } = makePicker(root, results);
  picker.open('q', 100);
  await delay(0);

  const syncedBadge = itemByName(root, '同步歌').querySelector('.badge');
  expect(syncedBadge).not.toBeNull();
  expect(syncedBadge!.textContent).toBe('同步');
  expect(syncedBadge!.classList.contains('synced')).toBe(true);

  const plainBadge = itemByName(root, '純文字歌').querySelector('.badge');
  expect(plainBadge).not.toBeNull();
  expect(plainBadge!.textContent).toBe('純文字');
  expect(plainBadge!.classList.contains('synced')).toBe(false);
});

test('與 trackDurationSec 相差 2 秒以內的項目加 class match 並排在最前面，超過 2 秒的不加', async () => {
  const root = mountRoot();
  const results = [
    mk({ id: 1, trackName: '差3秒', durationSec: 103, synced: true }),
    mk({ id: 2, trackName: '差2秒', durationSec: 102, synced: true }),
    mk({ id: 3, trackName: '負差2秒', durationSec: 98, synced: true }),
  ];
  const { picker } = makePicker(root, results);
  picker.open('q', 100);
  await delay(0);

  const over = itemByName(root, '差3秒');
  const edgeOver = itemByName(root, '差2秒');
  const edgeUnder = itemByName(root, '負差2秒');

  expect(edgeOver.classList.contains('match'), '相差 2 秒應該算 match').toBe(true);
  expect(edgeUnder.classList.contains('match'), '相差 -2 秒應該算 match').toBe(true);
  expect(over.classList.contains('match'), '相差 3 秒不應該算 match').toBe(false);

  const order = items(root);
  expect(order[0]).toBe(edgeOver);
  expect(order[1]).toBe(edgeUnder);
  expect(order[2]).toBe(over);
});

test('同為 match 時，有同步歌詞的項目排在純文字項目之前', async () => {
  const root = mountRoot();
  const results = [
    mk({ id: 1, trackName: '純文字', durationSec: 100, synced: false }),
    mk({ id: 2, trackName: '同步', durationSec: 100, synced: true }),
  ];
  const { picker } = makePicker(root, results);
  picker.open('q', 100);
  await delay(0);

  const order = items(root);
  expect(order[0]?.querySelector('.name')?.textContent).toBe('同步');
  expect(order[1]?.querySelector('.name')?.textContent).toBe('純文字');
});

test('沒有同步歌詞的項目會被加上 disabled，有同步歌詞的項目不會', async () => {
  const root = mountRoot();
  const results = [
    mk({ id: 1, trackName: '同步歌', durationSec: 100, synced: true }),
    mk({ id: 2, trackName: '純文字歌', durationSec: 100, synced: false }),
  ];
  const { picker } = makePicker(root, results);
  picker.open('q', 100);
  await delay(0);

  expect(itemByName(root, '同步歌').disabled).toBe(false);
  expect(itemByName(root, '純文字歌').disabled).toBe(true);
});

test('點擊可用項目會以 id 呼叫 onPick，並在 onPick 完成後才 close()', async () => {
  const root = mountRoot();
  const picked: number[] = [];
  const holder: { picker: LyricsPicker | null } = { picker: null };
  const deps = {
    search: (): Promise<SearchItem[]> =>
      Promise.resolve([mk({ id: 42, trackName: 'S', durationSec: 100, synced: true })]),
    onPick: async (id: number): Promise<void> => {
      await delay(30);
      expect(holder.picker?.isOpen(), 'onPick 尚未完成前不應該關閉').toBe(true);
      picked.push(id);
    },
  };
  const picker = new LyricsPicker(root, deps);
  holder.picker = picker;

  picker.open('q', 100);
  await delay(0);

  const first = items(root)[0];
  expect(first).toBeDefined();
  first!.click();
  await delay(120);

  expect(picked).toEqual([42]);
  expect(picker.isOpen()).toBe(false);
});

test('沒有結果時顯示 div.picker-empty 文字「找不到結果，試試只輸入歌名」', async () => {
  const root = mountRoot();
  const { picker } = makePicker(root, []);
  picker.open('nothing', 100);
  await delay(0);

  const empty = root.querySelector('.picker-empty');
  expect(empty, '沒有結果時應該要有 .picker-empty').not.toBeNull();
  expect(empty!.textContent).toBe('找不到結果，試試只輸入歌名');
  expect(items(root).length).toBe(0);
});

test('點擊 root 本身（背景）會關閉', async () => {
  const root = mountRoot();
  const { picker } = makePicker(root, []);
  picker.open('q', 100);
  await delay(0);

  root.click();
  expect(picker.isOpen()).toBe(false);
  expect(root.classList.contains('open')).toBe(false);
});

test('按 Esc 會關閉', async () => {
  const root = mountRoot();
  const { picker } = makePicker(root, []);
  picker.open('q', 100);
  await delay(0);

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(picker.isOpen()).toBe(false);
  expect(root.classList.contains('open')).toBe(false);
});

test('點擊 button.picker-close 會關閉', async () => {
  const root = mountRoot();
  const { picker } = makePicker(root, []);
  picker.open('q', 100);
  await delay(0);

  const closeBtn = root.querySelector<HTMLButtonElement>('button.picker-close');
  expect(closeBtn).not.toBeNull();
  closeBtn!.click();
  expect(picker.isOpen()).toBe(false);
});
