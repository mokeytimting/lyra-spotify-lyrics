// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createSettingsStore } from '../../server/settingsStore';
import { DEFAULT_SETTINGS } from '../../src/settings/types';
import type { AppSettings, EngineId } from '../../src/settings/types';

const VALID_ID_LOWER = '0123456789abcdef0123456789abcdef';

interface RawFile {
  spotifyClientId?: unknown;
  translation?: {
    engine?: unknown;
    deepl?: { apiKey?: unknown };
    azure?: { apiKey?: unknown; region?: unknown };
    openai?: { baseUrl?: unknown; model?: unknown; apiKey?: unknown };
  };
}

function defaults(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value, null, 2), 'utf8');
}

async function readJson(target: string): Promise<RawFile> {
  return JSON.parse(await readFile(target, 'utf8')) as RawFile;
}

async function removeDir(target: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(target);
  } catch {
    return;
  }
  for (const name of entries) {
    const entry = path.join(target, name);
    const info = await stat(entry);
    if (info.isDirectory()) {
      await removeDir(entry);
    } else {
      await unlink(entry);
    }
  }
  await rmdir(target);
}

describe('settingsStore', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'settings-store-'));
    file = path.join(dir, 'settings.json');
  });

  afterEach(async () => {
    if (dir) {
      await removeDir(dir);
    }
  });

  describe('load', () => {
    test('load：檔案不存在時回傳預設設定', async () => {
      const store = createSettingsStore(file);
      const settings = await store.load();
      expect(settings).toEqual(defaults());
    });

    test('load：檔案只有部分欄位時與預設值深層合併', async () => {
      await writeJson(file, { spotifyClientId: 'a'.repeat(32) });
      const store = createSettingsStore(file);
      const settings = await store.load();

      const expected = defaults();
      expected.spotifyClientId = 'a'.repeat(32);
      expect(settings).toEqual(expected);
    });

    test('load：巢狀物件缺欄位時逐層補上預設值', async () => {
      await writeJson(file, { translation: { azure: { region: 'eastasia' } } });
      const store = createSettingsStore(file);
      const settings = await store.load();

      const expected = defaults();
      expected.translation.azure.region = 'eastasia';
      expect(settings).toEqual(expected);
    });

    test('load：型別不對的欄位改用預設值', async () => {
      await writeJson(file, {
        spotifyClientId: 123,
        translation: {
          azure: { region: 42, apiKey: false },
          openai: { model: true, baseUrl: null },
        },
      });
      const store = createSettingsStore(file);
      const settings = await store.load();

      expect(settings.spotifyClientId).toBe('');
      expect(settings.translation.azure.region).toBe('');
      expect(settings.translation.azure.apiKey).toBe('');
      expect(settings.translation.openai.model).toBe('gpt-4o-mini');
      expect(settings.translation.openai.baseUrl).toBe('https://api.openai.com/v1');
    });

    test('load：legacyDeeplKey 有值且 deepl.apiKey 為空時填入、把 engine 設為 deepl 並寫回檔案', async () => {
      await writeJson(file, {
        translation: { engine: 'chrome', deepl: { apiKey: '' } },
      });
      const store = createSettingsStore(file, { legacyDeeplKey: 'legacy-key' });
      const settings = await store.load();

      expect(settings.translation.deepl.apiKey).toBe('legacy-key');
      expect(settings.translation.engine).toBe('deepl');

      const onDisk = await readJson(file);
      expect(onDisk.translation?.deepl?.apiKey).toBe('legacy-key');
      expect(onDisk.translation?.engine).toBe('deepl');
    });

    test('load：legacyDeeplKey 有值但設定檔不存在時，建立檔案並寫入 legacy 金鑰', async () => {
      const store = createSettingsStore(file, { legacyDeeplKey: 'legacy-key' });
      const settings = await store.load();

      expect(settings.translation.deepl.apiKey).toBe('legacy-key');
      expect(settings.translation.engine).toBe('deepl');

      const onDisk = await readJson(file);
      expect(onDisk.translation?.deepl?.apiKey).toBe('legacy-key');
      expect(onDisk.translation?.engine).toBe('deepl');
    });

    test('load：deepl.apiKey 已有值時不套用 legacyDeeplKey', async () => {
      await writeJson(file, {
        translation: { engine: 'chrome', deepl: { apiKey: 'existing-key' } },
      });
      const store = createSettingsStore(file, { legacyDeeplKey: 'legacy-key' });
      const settings = await store.load();

      expect(settings.translation.deepl.apiKey).toBe('existing-key');
      expect(settings.translation.engine).toBe('chrome');

      const onDisk = await readJson(file);
      expect(onDisk.translation?.deepl?.apiKey).toBe('existing-key');
      expect(onDisk.translation?.engine).toBe('chrome');
    });

    test('load：結果會快取在記憶體，不會重新讀取已變動的檔案', async () => {
      await writeJson(file, { spotifyClientId: 'a'.repeat(32) });
      const store = createSettingsStore(file);
      const first = await store.load();

      await writeJson(file, { spotifyClientId: 'b'.repeat(32) });
      const second = await store.load();

      expect(second).toEqual(first);
      expect(second.spotifyClientId).toBe('a'.repeat(32));
    });
  });

  describe('save', () => {
    test('save：回傳並寫入套用 patch 後的完整設定', async () => {
      const store = createSettingsStore(file);
      const saved = await store.save({ spotifyClientId: VALID_ID_LOWER });

      const expected = defaults();
      expected.spotifyClientId = VALID_ID_LOWER;
      expect(saved).toEqual(expected);

      const onDisk = await readJson(file);
      expect(onDisk).toEqual(expected);
    });

    test('save：寫入後 load 回傳更新後的設定', async () => {
      const store = createSettingsStore(file);
      await store.load();
      await store.save({ spotifyClientId: VALID_ID_LOWER });

      const loaded = await store.load();
      expect(loaded.spotifyClientId).toBe(VALID_ID_LOWER);
    });

    test('save：字串欄位有給就覆蓋並 trim', async () => {
      const store = createSettingsStore(file);
      const saved = await store.save({
        translation: {
          azure: { region: '  eastasia  ' },
          openai: { model: '  gpt-4o-mini  ' },
        },
      });

      expect(saved.translation.azure.region).toBe('eastasia');
      expect(saved.translation.openai.model).toBe('gpt-4o-mini');
    });

    test("save：openai.baseUrl 會去掉結尾的 '/'", async () => {
      const store = createSettingsStore(file);
      const saved = await store.save({
        translation: { openai: { baseUrl: 'https://example.test/v1/' } },
      });

      expect(saved.translation.openai.baseUrl).toBe('https://example.test/v1');
      const onDisk = await readJson(file);
      expect(onDisk.translation?.openai?.baseUrl).toBe('https://example.test/v1');
    });

    test('save：apiKey 為非空字串時覆蓋，為空字串或省略時保留原值', async () => {
      const store = createSettingsStore(file);

      await store.save({ translation: { deepl: { apiKey: 'secret-1' } } });
      expect((await store.load()).translation.deepl.apiKey).toBe('secret-1');

      await store.save({ translation: { deepl: { apiKey: '' } } });
      expect((await store.load()).translation.deepl.apiKey).toBe('secret-1');

      await store.save({ translation: { deepl: {} } });
      expect((await store.load()).translation.deepl.apiKey).toBe('secret-1');

      await store.save({ translation: {} });
      expect((await store.load()).translation.deepl.apiKey).toBe('secret-1');
    });

    test('save：apiKey 為 null 時清成空字串', async () => {
      const store = createSettingsStore(file);

      await store.save({ translation: { openai: { apiKey: 'secret-2' } } });
      await store.save({ translation: { openai: { apiKey: null } } });

      expect((await store.load()).translation.openai.apiKey).toBe('');
      const onDisk = await readJson(file);
      expect(onDisk.translation?.openai?.apiKey).toBe('');
    });

    test('save：engine 為四個合法值時可正常寫入', async () => {
      const store = createSettingsStore(file);

      for (const engine of ['chrome', 'deepl', 'azure', 'openai'] as EngineId[]) {
        const saved = await store.save({ translation: { engine } });
        expect(saved.translation.engine).toBe(engine);
      }
    });

    test('save：engine 不是四個合法值之一時丟出 Error', async () => {
      const store = createSettingsStore(file);

      const promise = store.save({
        translation: { engine: 'bogus' as unknown as EngineId },
      });
      await expect(promise).rejects.toThrow(Error);
    });

    test('save：spotifyClientId 為空字串時允許', async () => {
      const store = createSettingsStore(file);
      const saved = await store.save({ spotifyClientId: '' });
      expect(saved.spotifyClientId).toBe('');
    });

    test('save：spotifyClientId 為 32 位十六進位時允許（含大寫）', async () => {
      const store = createSettingsStore(file);
      const upper = 'ABCDEF0123456789ABCDEF0123456789';

      const saved = await store.save({ spotifyClientId: upper });
      expect(saved.spotifyClientId).toBe(upper);
    });

    test('save：spotifyClientId 格式合法但語意不合法時丟出 Error', async () => {
      const store = createSettingsStore(file);
      const bad = [
        'g'.repeat(32),
        'a'.repeat(31),
        'a'.repeat(33),
        '0123456789abcdef0123456789abcdeg',
        'not-a-hex-string',
      ];

      for (const id of bad) {
        const promise = store.save({ spotifyClientId: id });
        await expect(promise).rejects.toThrow(Error);
      }
    });

    test('save：目標目錄不存在時會遞迴建立目錄並寫檔', async () => {
      const nested = path.join(dir, 'a', 'b', 'c', 'settings.json');
      const store = createSettingsStore(nested);

      await store.save({ spotifyClientId: VALID_ID_LOWER });

      const onDisk = await readJson(nested);
      expect(onDisk.spotifyClientId).toBe(VALID_ID_LOWER);
    });

    test('save：寫出的 JSON 使用兩格縮排', async () => {
      const store = createSettingsStore(file);
      await store.save({ spotifyClientId: VALID_ID_LOWER });

      const raw = await readFile(file, 'utf8');
      expect(raw).toContain('\n  "spotifyClientId"');
      expect(raw).toContain('\n    "engine"');
    });

    test('save：寫檔完成後不留下暫存檔', async () => {
      const store = createSettingsStore(file);
      await store.save({ spotifyClientId: VALID_ID_LOWER });

      const entries = await readdir(dir);
      expect(entries).toEqual(['settings.json']);
    });
  });

  describe('toPublic', () => {
    test('toPublic：hasKey 反映 apiKey 是否非空，且輸出不含任何 apiKey 字串', async () => {
      const store = createSettingsStore(file);
      const settings = defaults();
      settings.spotifyClientId = 'a'.repeat(32);
      settings.translation.engine = 'openai';
      settings.translation.deepl.apiKey = 'deepl-secret';
      settings.translation.azure.apiKey = 'azure-secret';
      settings.translation.azure.region = 'eastasia';
      settings.translation.openai.apiKey = 'openai-secret';
      settings.translation.openai.baseUrl = 'https://api.openai.com/v1';
      settings.translation.openai.model = 'gpt-4o-mini';

      const pub = store.toPublic(settings);

      expect(pub.spotifyClientId).toBe('a'.repeat(32));
      expect(pub.translation.engine).toBe('openai');
      expect(pub.translation.deepl.hasKey).toBe(true);
      expect(pub.translation.azure.hasKey).toBe(true);
      expect(pub.translation.azure.region).toBe('eastasia');
      expect(pub.translation.openai.hasKey).toBe(true);
      expect(pub.translation.openai.baseUrl).toBe('https://api.openai.com/v1');
      expect(pub.translation.openai.model).toBe('gpt-4o-mini');

      const text = JSON.stringify(pub);
      expect(text).not.toContain('deepl-secret');
      expect(text).not.toContain('azure-secret');
      expect(text).not.toContain('openai-secret');
    });

    test('toPublic：apiKey 為空時 hasKey 為 false', async () => {
      const store = createSettingsStore(file);
      const pub = store.toPublic(defaults());

      expect(pub.translation.deepl.hasKey).toBe(false);
      expect(pub.translation.azure.hasKey).toBe(false);
      expect(pub.translation.openai.hasKey).toBe(false);
    });

    test('toPublic：輸出的物件不含 apiKey 欄位', async () => {
      const store = createSettingsStore(file);
      const settings = defaults();
      settings.translation.deepl.apiKey = 'deepl-secret';
      settings.translation.azure.apiKey = 'azure-secret';
      settings.translation.openai.apiKey = 'openai-secret';

      const pub = store.toPublic(settings) as unknown as {
        translation: Record<string, Record<string, unknown>>;
      };

      expect('apiKey' in pub.translation.deepl).toBe(false);
      expect('apiKey' in pub.translation.azure).toBe(false);
      expect('apiKey' in pub.translation.openai).toBe(false);
    });
  });
});
