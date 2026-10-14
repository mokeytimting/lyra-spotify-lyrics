import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const ROUTE_PREFIX = '/api/translations/';
const MAX_BODY_BYTES = 1024 * 1024;

export function isValidTrackId(id: string): boolean {
  return typeof id === 'string' && TRACK_ID_PATTERN.test(id);
}

export function createTranslationStore(dir: string): {
  get(id: string): Promise<unknown | null>;
  put(id: string, data: unknown): Promise<void>;
} {
  const fileFor = (id: string): string => path.join(dir, `${id}.json`);

  const get = async (id: string): Promise<unknown | null> => {
    if (!isValidTrackId(id)) return null;
    try {
      const raw = await readFile(fileFor(id), 'utf8');
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  };

  const put = async (id: string, data: unknown): Promise<void> => {
    if (!isValidTrackId(id)) {
      throw new Error(`Invalid track id: ${id}`);
    }
    await mkdir(dir, { recursive: true });
    const target = fileFor(id);
    const tmp = `${target}.tmp`;
    const serialized = JSON.stringify(data);
    await writeFile(tmp, serialized === undefined ? 'null' : serialized, 'utf8');
    await rename(tmp, target);
  };

  return { get, put };
}

type BodyResult = { ok: true; body: string } | { ok: false; tooLarge: boolean };

export function translationStorePlugin(dir: string): import('vite').Plugin {
  const store = createTranslationStore(dir);

  const sendJson = (res: any, status: number, payload: unknown): void => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  };

  const collectBody = (req: any, onDone: (result: BodyResult) => void): void => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        onDone({ ok: false, tooLarge: true });
      } else {
        onDone({ ok: true, body: Buffer.concat(chunks).toString('utf8') });
      }
    });
    req.on('error', () => {
      onDone({ ok: false, tooLarge: false });
    });
  };

  return {
    name: 'translation-store',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any): void => {
        const rawUrl: string = req.url ?? '';
        const queryIndex = rawUrl.indexOf('?');
        const pathname = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);

        if (!pathname.startsWith(ROUTE_PREFIX)) {
          next();
          return;
        }

        const rawId = pathname.slice(ROUTE_PREFIX.length);
        let id: string;
        try {
          id = decodeURIComponent(rawId);
        } catch {
          id = rawId;
        }

        if (!isValidTrackId(id)) {
          sendJson(res, 400, { error: 'INVALID_ID' });
          return;
        }

        const method: string = req.method ?? '';

        if (method === 'GET') {
          void store.get(id).then((data) => {
            if (data === null || data === undefined) {
              sendJson(res, 404, { error: 'NOT_FOUND' });
            } else {
              sendJson(res, 200, data);
            }
          });
          return;
        }

        if (method === 'PUT') {
          collectBody(req, (result) => {
            if (!result.ok) {
              if (result.tooLarge) {
                sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
              } else {
                sendJson(res, 400, { error: 'READ_FAILED' });
              }
              return;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(result.body) as unknown;
            } catch {
              sendJson(res, 400, { error: 'INVALID_JSON' });
              return;
            }
            void store
              .put(id, parsed)
              .then(() => {
                res.statusCode = 204;
                res.end();
              })
              .catch(() => {
                sendJson(res, 500, { error: 'WRITE_FAILED' });
              });
          });
          return;
        }

        res.setHeader('Allow', 'GET, PUT');
        sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      });
    },
  };
}
