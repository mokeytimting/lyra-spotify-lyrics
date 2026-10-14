import type { Plugin } from 'vite';

/**
 * 本機 API 的防護：只接受 Lyra 自己頁面送出的請求。
 *
 * 瀏覽器在跨網站請求時一定會帶 Origin；「簡單請求」（例如 text/plain 的 POST）不會先送 CORS 預檢，
 * 所以光靠 CORS 擋不住別的網站在背景觸發翻譯、或讓伺服器把金鑰送到別的網址。這裡直接拒絕：
 * - Origin 存在但不是允許的來源（不論 GET 或 POST）
 * - 非 GET/HEAD 的請求沒有帶 application/json（迫使跨站請求一定要經過 CORS 預檢）
 */
export function isAllowedRequest(
  method: string | undefined,
  headers: Record<string, string | string[] | undefined>,
  allowedOrigins: readonly string[],
): boolean {
  const origin = headers.origin;
  if (typeof origin === 'string' && !allowedOrigins.includes(origin)) return false;
  const m = (method ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  const ct = headers['content-type'];
  return typeof ct === 'string' && ct.toLowerCase().startsWith('application/json');
}

export function apiGuardPlugin(allowedOrigins: readonly string[], prefixes: readonly string[] = ['/api/']): Plugin {
  return {
    name: 'lyra-api-guard',
    // 必須比其他 API middleware 先執行
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (!prefixes.some((p) => path.startsWith(p))) return next();
        if (isAllowedRequest(req.method, req.headers, allowedOrigins)) return next();
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'FORBIDDEN' }));
      });
    },
  };
}
