import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Window } from 'happy-dom';
import { PipLyrics, pipSupported } from '../../src/ui/pipLyrics';

type AnyWindow = any;

let mainWindow: AnyWindow;
let pipWindow: AnyWindow;
let requestWindowCalls: Array<{ width: number; height: number }>;

beforeEach(() => {
  mainWindow = new Window();
  pipWindow = new Window();
  requestWindowCalls = [];
  vi.stubGlobal('window', mainWindow);
  vi.stubGlobal('document', mainWindow.document);
});

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    pipWindow?.close?.();
  } catch {
    /* noop */
  }
  try {
    mainWindow?.close?.();
  } catch {
    /* noop */
  }
});

/** 在主視窗安裝 Document Picture-in-Picture 的模擬實作。 */
function installPipApi(): void {
  mainWindow.documentPictureInPicture = {
    requestWindow(options: { width: number; height: number }) {
      requestWindowCalls.push({ width: options.width, height: options.height });
      return Promise.resolve(pipWindow);
    },
  };
}

function q(selector: string): any {
  return pipWindow.document.querySelector(selector);
}

/** 盡量寬鬆地判斷元素是否被隱藏（實作可能用 display / hidden / class / opacity）。 */
function isHidden(el: any): boolean {
  if (!el) return true;
  if (el.hidden === true) return true;
  const style = el.style ?? {};
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden') return true;
  if (style.opacity === '0' || style.opacity === 0) return true;
  if (typeof el.getAttribute === 'function' && el.getAttribute('hidden') !== null) return true;
  if (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('hidden')) {
    return true;
  }
  return false;
}

/** 在 pip 文件的任一元素上尋找指定的 CSS 自訂屬性值。 */
function readCssVar(name: string): string | null {
  const doc = pipWindow.document;
  const nodes: any[] = [doc.documentElement, doc.body];
  try {
    nodes.push(...Array.from(doc.querySelectorAll('*')));
  } catch {
    /* noop */
  }
  const pattern = new RegExp(name + '\\s*:\\s*([^;]+)');
  for (const node of nodes) {
    if (!node) continue;
    if (node.style && typeof node.style.getPropertyValue === 'function') {
      const value = node.style.getPropertyValue(name);
      if (value) return String(value).trim();
    }
    if (typeof node.getAttribute === 'function') {
      const attr = node.getAttribute('style');
      if (attr && attr.includes(name)) {
        const m = attr.match(pattern);
        if (m) return m[1].trim();
      }
    }
  }
  return null;
}

describe('pipSupported()', () => {
  test('window 沒有 documentPictureInPicture 時回傳 false', () => {
    expect(pipSupported()).toBe(false);
  });

  test('window 有 documentPictureInPicture 時回傳 true', () => {
    installPipApi();
    expect(pipSupported()).toBe(true);
  });
});

describe('PipLyrics.isOpen()', () => {
  test('尚未 open 時回傳 false', () => {
    installPipApi();
    const pip = new PipLyrics();
    expect(pip.isOpen()).toBe(false);
  });
});

describe('PipLyrics.open()', () => {
  test('不支援時回傳 false、不呼叫 requestWindow、維持未開啟', async () => {
    const pip = new PipLyrics();
    expect(await pip.open()).toBe(false);
    expect(pip.isOpen()).toBe(false);
    expect(requestWindowCalls.length).toBe(0);
  });

  test('支援時回傳 true 並以 { width: 460, height: 190 } 呼叫 requestWindow', async () => {
    installPipApi();
    const pip = new PipLyrics();
    expect(await pip.open()).toBe(true);
    expect(requestWindowCalls.length).toBe(1);
    expect(requestWindowCalls[0]).toEqual({ width: 460, height: 190 });
    expect(pip.isOpen()).toBe(true);
  });

  test('requestWindow 在呼叫 open() 後立刻同步被觸發（可用於使用者手勢中）', async () => {
    installPipApi();
    const pip = new PipLyrics();
    const pending = pip.open();
    expect(requestWindowCalls.length).toBe(1);
    await pending;
  });

  test('已開啟時再呼叫 open() 回傳 true 且不重複呼叫 requestWindow', async () => {
    installPipApi();
    const pip = new PipLyrics();
    expect(await pip.open()).toBe(true);
    expect(await pip.open()).toBe(true);
    expect(requestWindowCalls.length).toBe(1);
    expect(pip.isOpen()).toBe(true);
  });
});

describe('PipLyrics.close()', () => {
  test('close() 之後 isOpen() 回傳 false', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    expect(pip.isOpen()).toBe(true);
    pip.close();
    expect(pip.isOpen()).toBe(false);
  });
});

describe('pip 視窗的 pagehide', () => {
  test('pip 視窗觸發 pagehide 時呼叫 onClose', async () => {
    installPipApi();
    let closeCount = 0;
    const pip = new PipLyrics({
      onClose: () => {
        closeCount += 1;
      },
    });
    await pip.open();
    pipWindow.dispatchEvent(new pipWindow.Event('pagehide'));
    expect(closeCount).toBe(1);
  });

  test('未提供 onClose 時 pip 視窗觸發 pagehide 不應拋錯', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    expect(() => {
      pipWindow.dispatchEvent(new pipWindow.Event('pagehide'));
    }).not.toThrow();
  });
});

describe('pip 視窗的內容結構', () => {
  test('pip 文件的 head 內有一個自帶樣式的 <style>', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    const style = pipWindow.document.head.querySelector('style');
    expect(style, 'pip 文件的 head 應該包含一個 style 元素').toBeTruthy();
    const css = String(style.textContent ?? '');
    expect(css.includes('radial-gradient'), '樣式應包含 radial-gradient').toBe(true);
    expect(css.includes('linear-gradient'), '樣式應包含 linear-gradient').toBe(true);
    expect(css.includes('@keyframes'), '樣式應包含 @keyframes 動畫').toBe(true);
    expect(css.includes('20s'), '動畫時長應為 20s').toBe(true);
    expect(css.includes('alternate'), '動畫應為 alternate').toBe(true);
  });

  test('pip 文件包含 div.pip 以及 .pip-line/.pip-trans/.pip-next/.pip-meta', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    const root = q('.pip');
    expect(root, 'div.pip 應該存在').toBeTruthy();
    const line = q('.pip-line');
    const trans = q('.pip-trans');
    const next = q('.pip-next');
    const meta = q('.pip-meta');
    expect(line, '.pip-line 應該存在').toBeTruthy();
    expect(trans, '.pip-trans 應該存在').toBeTruthy();
    expect(next, '.pip-next 應該存在').toBeTruthy();
    expect(meta, '.pip-meta 應該存在').toBeTruthy();
    expect(root.contains(line)).toBe(true);
    expect(root.contains(trans)).toBe(true);
    expect(root.contains(next)).toBe(true);
    expect(root.contains(meta)).toBe(true);
  });
});

describe('PipLyrics.update()', () => {
  test('未開啟時只記住資料，open 後立刻套用', async () => {
    installPipApi();
    const pip = new PipLyrics();
    pip.update({ line: '你好', translation: 'hello', next: '再見', title: '歌名', artist: '歌手' });
    await pip.open();
    expect(q('.pip-line').textContent).toBe('你好');
    expect(q('.pip-trans').textContent).toBe('hello');
    expect(String(q('.pip-next').textContent).includes('再見')).toBe(true);
    expect(q('.pip-meta').textContent).toBe('歌名 · 歌手');
  });

  test('line 為 null 時 .pip-line 顯示「♪」', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: null, translation: null, next: null, title: 'T', artist: 'A' });
    expect(q('.pip-line').textContent).toBe('♪');
  });

  test('translation 為 null 時隱藏 .pip-trans', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'a', translation: null, next: null, title: 'T', artist: 'A' });
    expect(isHidden(q('.pip-trans')), '.pip-trans 應該被隱藏').toBe(true);
  });

  test('translation 非 null 時顯示 .pip-trans 且內容為該翻譯', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'a', translation: 'tr', next: null, title: 'T', artist: 'A' });
    const trans = q('.pip-trans');
    expect(trans.textContent).toBe('tr');
    expect(isHidden(trans), '.pip-trans 應該顯示').toBe(false);
  });

  test('next 為 null 時隱藏 .pip-next', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'a', translation: null, next: null, title: 'T', artist: 'A' });
    expect(isHidden(q('.pip-next')), '.pip-next 應該被隱藏').toBe(true);
  });

  test('next 非 null 時顯示 .pip-next 且帶有「下一句：」前綴與內容', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'a', translation: null, next: '下一段', title: 'T', artist: 'A' });
    const next = q('.pip-next');
    expect(isHidden(next), '.pip-next 應該顯示').toBe(false);
    const text = String(next.textContent ?? '');
    expect(text.includes('下一句：'), '應包含「下一句：」前綴').toBe(true);
    expect(text.includes('下一段'), '應包含 next 的內容').toBe(true);
  });

  test('.pip-meta 顯示「<title> · <artist>」', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'a', translation: null, next: null, title: '曲名', artist: '演唱者' });
    expect(q('.pip-meta').textContent).toBe('曲名 · 演唱者');
  });

  test('line 與上次不同時對 .pip-line 與 .pip-trans 加上 class "in"', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'one', translation: 'tr', next: null, title: 'T', artist: 'A' });
    expect(q('.pip-line').classList.contains('in'), '.pip-line 應該有 class "in"').toBe(true);
    expect(q('.pip-trans').classList.contains('in'), '.pip-trans 應該有 class "in"').toBe(true);
  });

  test('line 改變後再次 update 仍會重新套用 class "in"', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'one', translation: 'tr', next: null, title: 'T', artist: 'A' });
    pip.update({ line: 'two', translation: 'tr2', next: null, title: 'T', artist: 'A' });
    expect(q('.pip-line').textContent).toBe('two');
    expect(q('.pip-line').classList.contains('in')).toBe(true);
    expect(q('.pip-trans').textContent).toBe('tr2');
    expect(q('.pip-trans').classList.contains('in')).toBe(true);
  });

  test('歌詞以 textContent 設定，HTML 標籤不會被解析成元素', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: '<b>x</b>', translation: null, next: null, title: 'T', artist: 'A' });
    const line = q('.pip-line');
    expect(line.textContent).toBe('<b>x</b>');
    expect(line.querySelector('b')).toBe(null);
  });

  test('meta 以 textContent 設定，HTML 標籤不會被解析成元素', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.update({ line: 'a', translation: null, next: null, title: '<b>T</b>', artist: 'A' });
    const meta = q('.pip-meta');
    expect(meta.textContent).toBe('<b>T</b> · A');
    expect(meta.querySelector('b')).toBe(null);
  });
});

describe('PipLyrics.setColors()', () => {
  test('未開啟時記住顏色，open 後立刻套用 --c1/--c2/--c3', async () => {
    installPipApi();
    const pip = new PipLyrics();
    pip.setColors(['#111111', '#222222', '#333333']);
    await pip.open();
    expect(readCssVar('--c1')).toBe('#111111');
    expect(readCssVar('--c2')).toBe('#222222');
    expect(readCssVar('--c3')).toBe('#333333');
  });

  test('已開啟時 setColors 立即套用 --c1/--c2/--c3', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.setColors(['rgb(1, 1, 1)', 'rgb(2, 2, 2)', 'rgb(3, 3, 3)']);
    expect(readCssVar('--c1')).toBe('rgb(1, 1, 1)');
    expect(readCssVar('--c2')).toBe('rgb(2, 2, 2)');
    expect(readCssVar('--c3')).toBe('rgb(3, 3, 3)');
  });

  test('再次 setColors 會覆蓋先前的顏色', async () => {
    installPipApi();
    const pip = new PipLyrics();
    await pip.open();
    pip.setColors(['#000000', '#000000', '#000000']);
    pip.setColors(['#ffffff', '#eeeeee', '#dddddd']);
    expect(readCssVar('--c1')).toBe('#ffffff');
    expect(readCssVar('--c2')).toBe('#eeeeee');
    expect(readCssVar('--c3')).toBe('#dddddd');
  });
});
