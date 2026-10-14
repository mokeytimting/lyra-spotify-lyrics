/**
 * tests/ui/settingsPanel.test.ts
 * 以 vitest（happy-dom 環境）驗證 src/ui/settingsPanel.ts 的規格行為。
 */
import { test, expect, vi, beforeEach, afterEach, describe } from 'vitest';
import { SettingsPanel } from '../../src/ui/settingsPanel';
import type { PublicSettings, SettingsPatch } from '../../src/settings/types';

/* ------------------------------------------------------------------ */
/* 型別與小工具                                                        */
/* ------------------------------------------------------------------ */

type TestOutcome = { ok: true; sample: string } | { ok: false; code: string; message: string };

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function makeSettings(over: DeepPartial<PublicSettings> = {}): PublicSettings {
  const t = over.translation ?? {};
  return {
    spotifyClientId: over.spotifyClientId ?? '',
    translation: {
      engine: t.engine ?? 'chrome',
      deepl: { hasKey: t.deepl?.hasKey ?? false },
      azure: { hasKey: t.azure?.hasKey ?? false, region: t.azure?.region ?? '' },
      openai: {
        baseUrl: t.openai?.baseUrl ?? 'https://api.openai.com/v1',
        model: t.openai?.model ?? 'gpt-4o-mini',
        hasKey: t.openai?.hasKey ?? false,
      },
    },
  };
}

function tick(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isVisible(target: Element | null): boolean {
  if (!target) return false;
  const node = target as HTMLElement;
  if (node.hidden === true) return false;
  if (node.hasAttribute('hidden')) return false;
  const style = node.style;
  if (style) {
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
  }
  if (node.classList.contains('hidden') || node.classList.contains('is-hidden')) return false;
  return true;
}

interface HarnessOptions {
  load?: () => Promise<PublicSettings>;
  save?: (patch: SettingsPatch) => Promise<PublicSettings>;
  translate?: (patch: SettingsPatch) => Promise<TestOutcome>;
  chromeTranslatorAvailable?: () => boolean;
  redirectUri?: string;
  onSaved?: (s: PublicSettings) => void;
}

interface Harness {
  root: HTMLElement;
  panel: SettingsPanel;
  saved: SettingsPatch[];
  tested: SettingsPatch[];
  calls: { load: number };
}

let copied: string[];
let clipboardWrite: (text: string) => Promise<void>;

beforeEach(() => {
  copied = [];
  clipboardWrite = vi.fn((text: string): Promise<void> => {
    copied.push(text);
    return Promise.resolve();
  });
  const clipboard = { writeText: clipboardWrite };
  try {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
      writable: true,
    });
  } catch {
    vi.stubGlobal('navigator', clipboard);
  }
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function createHarness(opts: HarnessOptions = {}): Harness {
  const saved: SettingsPatch[] = [];
  const tested: SettingsPatch[] = [];
  const calls = { load: 0 };
  const fallback: TestOutcome = { ok: true, sample: '樣本' };

  const deps = {
    load: async (): Promise<PublicSettings> => {
      calls.load += 1;
      return opts.load ? await opts.load() : makeSettings();
    },
    save: async (patch: SettingsPatch): Promise<PublicSettings> => {
      saved.push(patch);
      return opts.save ? await opts.save(patch) : makeSettings();
    },
    test: async (patch: SettingsPatch): Promise<TestOutcome> => {
      tested.push(patch);
      return opts.translate ? await opts.translate(patch) : fallback;
    },
    redirectUri: opts.redirectUri ?? 'http://127.0.0.1:5173/callback',
    chromeTranslatorAvailable: opts.chromeTranslatorAvailable ?? (() => true),
  };

  const root = document.createElement('aside');
  root.className = 'settings';
  document.body.appendChild(root);

  const panel = new SettingsPanel(root, deps, opts.onSaved ? { onSaved: opts.onSaved } : {});
  return { root, panel, saved, tested, calls };
}

function selectEngine(h: Harness, engine: string): void {
  const radio = h.root.querySelector<HTMLInputElement>(`input[name="engine"][value="${engine}"]`);
  expect(radio).not.toBeNull();
  radio!.click();
  if (radio!.checked !== true) radio!.checked = true;
  radio!.dispatchEvent(new Event('change', { bubbles: true }));
}

function pressEscape(h: Harness): void {
  h.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function engineLabel(h: Harness, engine: string): HTMLElement | null {
  const labels = Array.from(h.root.querySelectorAll<HTMLElement>('.set-engine'));
  return (
    labels.find((label) => {
      const input = label.querySelector<HTMLInputElement>('input[type="radio"]');
      if (!input) return false;
      return input.value === engine || input.getAttribute('value') === engine;
    }) ?? null
  );
}

/* ------------------------------------------------------------------ */
/* 開啟 / 關閉                                                         */
/* ------------------------------------------------------------------ */

describe('開啟 / 關閉', () => {
  test('open() 呼叫 load、加上 open class，normal 模式標題為「設定」、儲存鈕為「儲存」', async () => {
    const h = createHarness();
    expect(h.panel.isOpen()).toBe(false);

    await h.panel.open();

    expect(h.calls.load).toBe(1);
    expect(h.panel.isOpen()).toBe(true);
    expect(h.root.classList.contains('open')).toBe(true);
    expect(h.root.classList.contains('setup')).toBe(false);

    const title = h.root.querySelector('.set-head h2');
    expect(title).not.toBeNull();
    expect(title!.textContent!.trim()).toBe('設定');
    expect(h.root.querySelector('.set-save')!.textContent!.trim()).toBe('儲存');
  });

  test("open('setup') 加上 open 與 setup class，標題「歡迎使用」、儲存鈕為「開始使用」", async () => {
    const h = createHarness();
    await h.panel.open('setup');

    expect(h.root.classList.contains('open')).toBe(true);
    expect(h.root.classList.contains('setup')).toBe(true);
    expect(h.panel.isOpen()).toBe(true);
    expect(h.root.querySelector('.set-head h2')!.textContent!.trim()).toBe('歡迎使用');
    expect(h.root.querySelector('.set-save')!.textContent!.trim()).toBe('開始使用');
  });

  test('normal 模式有 .set-close（aria-label「關閉」、textContent 為空），點擊後關閉', async () => {
    const h = createHarness();
    await h.panel.open();

    const btn = h.root.querySelector<HTMLButtonElement>('.set-close');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-label')).toBe('關閉');
    expect(btn!.textContent!.trim()).toBe('');

    btn!.click();
    expect(h.panel.isOpen()).toBe(false);
    expect(h.root.classList.contains('open')).toBe(false);
  });

  test('setup 模式不顯示關閉鈕', async () => {
    const h = createHarness();
    await h.panel.open('setup');

    const btn = h.root.querySelector('.set-close');
    expect(isVisible(btn)).toBe(false);
  });

  test('close() 會移除 open class 並讓 isOpen() 變成 false', async () => {
    const h = createHarness();
    await h.panel.open();
    expect(h.panel.isOpen()).toBe(true);

    h.panel.close();

    expect(h.panel.isOpen()).toBe(false);
    expect(h.root.classList.contains('open')).toBe(false);
  });

  test('normal 模式按 Esc 會關閉面板', async () => {
    const h = createHarness();
    await h.panel.open();

    pressEscape(h);

    expect(h.panel.isOpen()).toBe(false);
    expect(h.root.classList.contains('open')).toBe(false);
  });

  test('setup 模式按 Esc 不會關閉面板', async () => {
    const h = createHarness();
    await h.panel.open('setup');

    pressEscape(h);

    expect(h.panel.isOpen()).toBe(true);
    expect(h.root.classList.contains('open')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 版面結構                                                            */
/* ------------------------------------------------------------------ */

describe('版面結構', () => {
  test('.set-body 內有三個 .set-section，第三區顯示歌詞來源說明', async () => {
    const h = createHarness();
    await h.panel.open();

    const sections = h.root.querySelectorAll('.set-body .set-section');
    expect(sections.length).toBe(3);
    expect(sections[0].querySelector('h3')!.textContent!.trim()).toBe('Spotify 連線');
    expect(sections[1].querySelector('h3')!.textContent!.trim()).toBe('翻譯');

    const note = sections[2].querySelector('p');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('LRCLIB');
    expect(note!.textContent).toContain('Spotify');
  });

  test('Spotify 連線區顯示 redirectUri，並有 Client ID 輸入框（placeholder 與 maxlength）', async () => {
    const h = createHarness({ redirectUri: 'http://127.0.0.1:5173/callback' });
    await h.panel.open();

    const code = h.root.querySelector('.set-copy code');
    expect(code).not.toBeNull();
    expect(code!.textContent!.trim()).toBe('http://127.0.0.1:5173/callback');

    const input = h.root.querySelector<HTMLInputElement>('.set-client-id');
    expect(input).not.toBeNull();
    expect(input!.getAttribute('placeholder')).toBe('32 位英數字的 Client ID');
    expect(input!.getAttribute('maxlength')).toBe('32');
  });

  test('點擊 .set-copy-btn 會把 redirectUri 寫入剪貼簿，文字變「已複製」後 1.5 秒回復「複製」', async () => {
    const h = createHarness({ redirectUri: 'http://127.0.0.1:5173/callback' });
    await h.panel.open();

    const btn = h.root.querySelector<HTMLButtonElement>('.set-copy-btn');
    expect(btn).not.toBeNull();
    expect(btn!.textContent!.trim()).toBe('複製');

    btn!.click();
    await tick();

    expect(copied).toEqual(['http://127.0.0.1:5173/callback']);
    expect(clipboardWrite).toHaveBeenCalledWith('http://127.0.0.1:5173/callback');
    expect(btn!.textContent!.trim()).toBe('已複製');

    await sleep(1600);
    expect(btn!.textContent!.trim()).toBe('複製');
  });
});

/* ------------------------------------------------------------------ */
/* 翻譯區                                                              */
/* ------------------------------------------------------------------ */

describe('翻譯區', () => {
  test('翻譯區有四個 engine radio，value 為 chrome/deepl/azure/openai', async () => {
    const h = createHarness();
    await h.panel.open();

    const radios = h.root.querySelectorAll<HTMLInputElement>(
      'input[type="radio"][name="engine"]',
    );
    expect(radios.length).toBe(4);

    const values = Array.from(radios)
      .map((r) => r.value)
      .sort();
    expect(values).toEqual(['azure', 'chrome', 'deepl', 'openai']);
  });

  test('四個引擎的 span.name 與 span.desc 文字符合規格', async () => {
    const h = createHarness();
    await h.panel.open();

    const expected: Array<[string, string, string]> = [
      ['chrome', 'Chrome 內建', '免費、不用金鑰，品質普通'],
      ['deepl', 'DeepL', '每月 50 萬字免費，日翻中自然'],
      ['azure', 'Microsoft 翻譯', '每月 200 萬字免費'],
      ['openai', 'AI 模型（OpenAI 相容）', '最懂歌詞意境；支援 OpenAI、Gemini、Ollama 等'],
    ];

    for (const [engine, name, desc] of expected) {
      const label = engineLabel(h, engine);
      expect(label, `找不到 ${engine} 的 .set-engine`).not.toBeNull();
      const nameEl = label!.querySelector('span.name');
      const descEl = label!.querySelector('span.desc');
      expect(nameEl, `${engine} 缺少 span.name`).not.toBeNull();
      expect(descEl, `${engine} 缺少 span.desc`).not.toBeNull();
      expect(nameEl!.textContent!.trim()).toBe(name);
      expect(descEl!.textContent).toContain(desc);
    }
  });

  test('chromeTranslatorAvailable() 為 false 時，chrome 說明加註「（此瀏覽器不支援）」', async () => {
    const h = createHarness({ chromeTranslatorAvailable: () => false });
    await h.panel.open();

    const label = engineLabel(h, 'chrome');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('（此瀏覽器不支援）');
  });

  test('chromeTranslatorAvailable() 為 true 時不加註不支援', async () => {
    const h = createHarness({ chromeTranslatorAvailable: () => true });
    await h.panel.open();

    const label = engineLabel(h, 'chrome');
    expect(label).not.toBeNull();
    expect(label!.textContent).not.toContain('（此瀏覽器不支援）');
  });

  test('選到哪個引擎就只顯示對應的 .set-fields', async () => {
    const h = createHarness();
    await h.panel.open();

    for (const engine of ['deepl', 'azure', 'openai']) {
      expect(
        isVisible(h.root.querySelector(`.set-fields[data-engine="${engine}"]`)),
        `chrome 模式下 ${engine} 欄位區不應顯示`,
      ).toBe(false);
    }

    selectEngine(h, 'deepl');
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="deepl"]'))).toBe(true);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="azure"]'))).toBe(false);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="openai"]'))).toBe(false);

    selectEngine(h, 'azure');
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="deepl"]'))).toBe(false);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="azure"]'))).toBe(true);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="openai"]'))).toBe(false);

    selectEngine(h, 'openai');
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="deepl"]'))).toBe(false);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="azure"]'))).toBe(false);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="openai"]'))).toBe(true);

    selectEngine(h, 'chrome');
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="deepl"]'))).toBe(false);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="azure"]'))).toBe(false);
    expect(isVisible(h.root.querySelector('.set-fields[data-engine="openai"]'))).toBe(false);
  });

  test('各引擎欄位的型別與 placeholder 符合規格（尚未設定金鑰時）', async () => {
    const h = createHarness();
    await h.panel.open();

    const deeplKey = h.root.querySelector<HTMLInputElement>('.set-key[data-engine="deepl"]');
    expect(deeplKey).not.toBeNull();
    expect(deeplKey!.getAttribute('type')).toBe('password');
    expect(deeplKey!.getAttribute('placeholder')).toBe('金鑰');

    const azureKey = h.root.querySelector<HTMLInputElement>('.set-key[data-engine="azure"]');
    expect(azureKey).not.toBeNull();
    expect(azureKey!.getAttribute('type')).toBe('password');

    const region = h.root.querySelector<HTMLInputElement>('.set-region');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('placeholder')).toBe('區域，例如 eastasia（可留空）');

    const openaiKey = h.root.querySelector<HTMLInputElement>('.set-key[data-engine="openai"]');
    expect(openaiKey).not.toBeNull();
    expect(openaiKey!.getAttribute('type')).toBe('password');
    expect(openaiKey!.getAttribute('placeholder')).toBe('金鑰（本機模型可留空）');

    expect(h.root.querySelector('.set-base-url')).not.toBeNull();
    expect(h.root.querySelector('.set-model')).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* load 填表單                                                         */
/* ------------------------------------------------------------------ */

describe('load 填表單', () => {
  test('open() 用 load() 的結果填入 Client ID、引擎、azure 區域與金鑰狀態', async () => {
    const settings = makeSettings({
      spotifyClientId: 'abcd1234abcd1234abcd1234abcd1234',
      translation: {
        engine: 'azure',
        deepl: { hasKey: true },
        azure: { hasKey: true, region: 'eastasia' },
        openai: { hasKey: false },
      },
    });
    const h = createHarness({ load: async () => settings });
    await h.panel.open();

    expect(h.root.querySelector<HTMLInputElement>('.set-client-id')!.value).toBe(
      'abcd1234abcd1234abcd1234abcd1234',
    );
    expect(
      h.root.querySelector<HTMLInputElement>('input[name="engine"][value="azure"]')!.checked,
    ).toBe(true);
    expect(h.root.querySelector<HTMLInputElement>('.set-region')!.value).toBe('eastasia');
    expect(
      h.root
        .querySelector<HTMLInputElement>('.set-key[data-engine="azure"]')!
        .getAttribute('placeholder'),
    ).toBe('已設定（留空表示不變）');
    expect(
      h.root
        .querySelector<HTMLInputElement>('.set-key[data-engine="deepl"]')!
        .getAttribute('placeholder'),
    ).toBe('已設定（留空表示不變）');
    expect(
      h.root
        .querySelector<HTMLInputElement>('.set-key[data-engine="openai"]')!
        .getAttribute('placeholder'),
    ).toBe('金鑰（本機模型可留空）');
  });

  test('open() 用 load() 的結果填入 openai 的 baseUrl 與 model', async () => {
    const settings = makeSettings({
      translation: {
        engine: 'openai',
        openai: { baseUrl: 'http://localhost:11434/v1', model: 'llama3', hasKey: true },
      },
    });
    const h = createHarness({ load: async () => settings });
    await h.panel.open();

    expect(
      h.root.querySelector<HTMLInputElement>('input[name="engine"][value="openai"]')!.checked,
    ).toBe(true);
    expect(h.root.querySelector<HTMLInputElement>('.set-base-url')!.value).toBe(
      'http://localhost:11434/v1',
    );
    expect(h.root.querySelector<HTMLInputElement>('.set-model')!.value).toBe('llama3');
    expect(
      h.root
        .querySelector<HTMLInputElement>('.set-key[data-engine="openai"]')!
        .getAttribute('placeholder'),
    ).toBe('已設定（留空表示不變）');
  });
});

/* ------------------------------------------------------------------ */
/* 清除金鑰                                                            */
/* ------------------------------------------------------------------ */

describe('清除金鑰', () => {
  test('hasKey 為 true 時可清除金鑰：placeholder 變回「金鑰」，存檔送出 apiKey: null', async () => {
    const settings = makeSettings({ translation: { engine: 'deepl', deepl: { hasKey: true } } });
    const h = createHarness({ load: async () => settings });
    await h.panel.open();

    const key = h.root.querySelector<HTMLInputElement>('.set-key[data-engine="deepl"]');
    expect(key!.getAttribute('placeholder')).toBe('已設定（留空表示不變）');

    const clearBtn = h.root.querySelector<HTMLButtonElement>(
      '.set-clear-key[data-engine="deepl"]',
    );
    expect(clearBtn, 'hasKey 為 true 時應有 .set-clear-key').not.toBeNull();
    expect(clearBtn!.textContent!.trim()).toBe('清除');

    clearBtn!.click();
    expect(key!.getAttribute('placeholder')).toBe('金鑰');

    h.root.querySelector<HTMLButtonElement>('.set-save')!.click();
    await tick();

    expect(h.saved.length).toBe(1);
    expect(h.saved[0].translation!.engine).toBe('deepl');
    expect(h.saved[0].translation!.deepl!.apiKey).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 測試翻譯                                                            */
/* ------------------------------------------------------------------ */

describe('測試翻譯', () => {
  test('測試翻譯成功時顯示「✓ 可以使用：<sample>」並加上 ok class，且以目前表單內容呼叫 test', async () => {
    const h = createHarness({ translate: async () => ({ ok: true, sample: 'こんにちは' }) });
    await h.panel.open();

    selectEngine(h, 'deepl');
    h.root.querySelector<HTMLInputElement>('.set-key[data-engine="deepl"]')!.value = 'my-key';
    h.root.querySelector<HTMLButtonElement>('.set-test')!.click();
    await tick();

    expect(h.tested.length).toBe(1);
    expect(h.tested[0].translation!.engine).toBe('deepl');
    expect(h.tested[0].translation!.deepl!.apiKey).toBe('my-key');

    const result = h.root.querySelector('.set-test-result');
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain('✓ 可以使用：');
    expect(result!.textContent).toContain('こんにちは');
    expect(result!.classList.contains('ok')).toBe(true);
  });

  test('測試翻譯失敗時顯示「✗ <message>」並加上 err class', async () => {
    const h = createHarness({
      translate: async () => ({ ok: false, code: 'BAD_KEY', message: '金鑰無效' }),
    });
    await h.panel.open();

    h.root.querySelector<HTMLButtonElement>('.set-test')!.click();
    await tick();

    const result = h.root.querySelector('.set-test-result');
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain('✗');
    expect(result!.textContent).toContain('金鑰無效');
    expect(result!.classList.contains('err')).toBe(true);
  });

  test('測試翻譯進行中顯示「測試中…」', async () => {
    let resolveTranslate: (value: TestOutcome) => void = () => {};
    const pending = new Promise<TestOutcome>((resolve) => {
      resolveTranslate = resolve;
    });
    const h = createHarness({ translate: () => pending });
    await h.panel.open();

    h.root.querySelector<HTMLButtonElement>('.set-test')!.click();

    const result = h.root.querySelector('.set-test-result');
    expect(result).not.toBeNull();
    expect(result!.textContent).toContain('測試中');

    resolveTranslate({ ok: true, sample: 'x' });
    await tick();
    await tick();
    expect(result!.textContent).toContain('x');
  });
});

/* ------------------------------------------------------------------ */
/* 儲存                                                                */
/* ------------------------------------------------------------------ */

describe('儲存', () => {
  test('儲存時組成 patch：spotifyClientId 去空白、engine、引擎欄位、金鑰有值才放', async () => {
    const h = createHarness();
    await h.panel.open();

    h.root.querySelector<HTMLInputElement>('.set-client-id')!.value =
      '  0123456789abcdef0123456789abcdef  ';

    selectEngine(h, 'openai');
    h.root.querySelector<HTMLInputElement>('.set-base-url')!.value = 'http://localhost:11434/v1';
    h.root.querySelector<HTMLInputElement>('.set-model')!.value = 'llama3';
    h.root.querySelector<HTMLInputElement>('.set-key[data-engine="openai"]')!.value = 'sk-test';

    h.root.querySelector<HTMLButtonElement>('.set-save')!.click();
    await tick();

    expect(h.saved.length).toBe(1);
    const patch = h.saved[0];
    expect(patch.spotifyClientId).toBe('0123456789abcdef0123456789abcdef');
    expect(patch.translation!.engine).toBe('openai');
    expect(patch.translation!.openai!.baseUrl).toBe('http://localhost:11434/v1');
    expect(patch.translation!.openai!.model).toBe('llama3');
    expect(patch.translation!.openai!.apiKey).toBe('sk-test');

    const deepl = patch.translation!.deepl;
    expect(deepl === undefined || deepl.apiKey === undefined).toBe(true);
    const azure = patch.translation!.azure;
    expect(azure === undefined || azure.apiKey === undefined).toBe(true);
  });

  test('儲存成功會呼叫 onSaved，且 normal 模式會關閉面板', async () => {
    const received: PublicSettings[] = [];
    const h = createHarness({ onSaved: (s) => received.push(s) });
    await h.panel.open();

    h.root.querySelector<HTMLButtonElement>('.set-save')!.click();
    await tick();

    expect(h.saved.length).toBe(1);
    expect(received.length).toBe(1);
    expect(h.panel.isOpen()).toBe(false);
    expect(h.root.classList.contains('open')).toBe(false);
  });

  test('save 失敗時在 .set-error 顯示錯誤訊息，且不呼叫 onSaved', async () => {
    const received: PublicSettings[] = [];
    const h = createHarness({
      save: async () => {
        throw new Error('無法寫入設定檔');
      },
      onSaved: (s) => received.push(s),
    });
    await h.panel.open();

    h.root.querySelector<HTMLButtonElement>('.set-save')!.click();
    await tick();

    const err = h.root.querySelector('.set-error');
    expect(err).not.toBeNull();
    expect(err!.textContent).toContain('無法寫入設定檔');
    expect(received.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* setup 模式的 Client ID 驗證                                          */
/* ------------------------------------------------------------------ */

describe('setup 模式的 Client ID 驗證', () => {
  test('setup 模式：Client ID 非 32 位十六進位時顯示「請輸入正確的 Client ID」且不送出', async () => {
    const h = createHarness();
    await h.panel.open('setup');

    const input = h.root.querySelector<HTMLInputElement>('.set-client-id')!;
    const invalid = [
      '',
      '   ',
      'abc',
      '0123456789abcdef0123456789abcde', // 31 位
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', // 32 位但非十六進位
    ];

    for (const value of invalid) {
      input.value = value;
      h.root.querySelector<HTMLButtonElement>('.set-save')!.click();
      await tick();

      expect(h.saved.length, `不應送出：${JSON.stringify(value)}`).toBe(0);
      const err = h.root.querySelector('.set-error');
      expect(err, '應顯示 .set-error').not.toBeNull();
      expect(err!.textContent!.trim()).toBe('請輸入正確的 Client ID');
    }
  });

  test('setup 模式：合法 32 位十六進位 Client ID 可儲存、呼叫 onSaved，且不自動關閉', async () => {
    const received: PublicSettings[] = [];
    const h = createHarness({ onSaved: (s) => received.push(s) });
    await h.panel.open('setup');

    h.root.querySelector<HTMLInputElement>('.set-client-id')!.value =
      '0123456789abcdef0123456789abcdef';
    h.root.querySelector<HTMLButtonElement>('.set-save')!.click();
    await tick();

    expect(h.saved.length).toBe(1);
    expect(h.saved[0].spotifyClientId).toBe('0123456789abcdef0123456789abcdef');
    expect(received.length).toBe(1);
    expect(h.panel.isOpen()).toBe(true);
    expect(h.root.classList.contains('open')).toBe(true);
  });
});
