import { createReadStream, stat } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const DICT_URL_PREFIX = '/kuromoji-dict/';
const DICT_FILE_PATTERN = /^[a-z_]+\.dat\.gz$/;

/**
 * 把 /kuromoji-dict/<file> 這種 URL 對應到字典資料夾裡的實體檔案。
 * 只接受單一檔名且符合 /^[a-z_]+\.dat\.gz$/，其餘（含 ..、子資料夾、怪字元）一律回 null。
 * query string 會被忽略。
 */
export function resolveDictFile(urlPath: string, dictDir: string): string | null {
  if (typeof urlPath !== 'string') {
    return null;
  }

  const queryIndex = urlPath.indexOf('?');
  const pathname = queryIndex === -1 ? urlPath : urlPath.slice(0, queryIndex);

  if (!pathname.startsWith(DICT_URL_PREFIX)) {
    return null;
  }

  const fileName = pathname.slice(DICT_URL_PREFIX.length);
  if (!DICT_FILE_PATTERN.test(fileName)) {
    return null;
  }

  return join(dictDir, fileName);
}

/**
 * Vite plugin：開發時把 kuromoji 字典檔以 /kuromoji-dict/ 路徑提供給瀏覽器。
 * 內容原樣串流（.dat.gz 已是 gzip 檔，kuromoji 會自行解壓），
 * 因此不可加上 Content-Encoding: gzip 標頭。
 */
export function kuromojiDictPlugin(
  dictDir: string = resolve('node_modules/kuromoji/dict'),
): Plugin {
  return {
    name: 'kuromoji-dict',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const filePath = resolveDictFile(req.url ?? '', dictDir);
        if (filePath === null) {
          next();
          return;
        }

        stat(filePath, (err, stats) => {
          if (err !== null || !stats.isFile()) {
            next();
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', String(stats.size));

          const stream = createReadStream(filePath);
          stream.on('error', () => {
            res.destroy();
          });
          stream.pipe(res);
        });
      });
    },
  };
}
