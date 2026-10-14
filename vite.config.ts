import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { apiPlugin } from './server/apiRoutes';
import { createSettingsStore } from './server/settingsStore';
import { testEngine, translateWith } from './server/translators';
import { translationStorePlugin } from './server/translationStore';
import { kuromojiDictPlugin } from './server/kuromojiDict';
import { apiGuardPlugin } from './server/guard';

const ORIGIN = 'http://127.0.0.1:5180';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const dataDir = path.resolve('data');
  // 舊版把 DeepL 金鑰放在 .env.local；第一次啟動時自動搬進 data/settings.json
  const settings = createSettingsStore(path.join(dataDir, 'settings.json'), {
    legacyDeeplKey: env.DEEPL_API_KEY,
  });

  return {
    server: {
      host: '127.0.0.1',
      port: 5180,
      strictPort: true,
      // 只允許 Lyra 自己的頁面跨來源存取
      cors: { origin: [ORIGIN] },
      // data/ 裡有 API 金鑰與個人資料，不能被當成靜態檔案提供
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', 'data/**', '**/data/**'] },
    },
    // 瀏覽器改用 browserify 打包好的版本：原始碼裡的 zlibjs 依賴頂層 this，被 Vite 預先打包後會壞掉。
    // 測試（node）仍用原本的進入點。
    resolve: process.env.VITEST
      ? {}
      : {
          alias: {
            'kuroshiro-analyzer-kuromoji': 'kuroshiro-analyzer-kuromoji/dist/kuroshiro-analyzer-kuromoji.min.js',
          },
        },
    plugins: [
      apiGuardPlugin([ORIGIN]),
      apiPlugin({ settings, translateWith, testEngine, dataDir }),
      translationStorePlugin(path.join(dataDir, 'translations')),
      kuromojiDictPlugin(),
    ],
    test: { environment: 'happy-dom', setupFiles: ['tests/setup.ts'] },
  };
});
