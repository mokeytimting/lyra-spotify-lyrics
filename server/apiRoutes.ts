import { applyPatch } from './settingsStore';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import type {
  AppSettings,
  PublicSettings,
  SettingsPatch,
  TranslateErrorCode,
  TranslateResponse,
} from '../src/settings/types';

/** 本模組的依賴注入介面：讓路由邏輯與實際的設定儲存、翻譯引擎解耦，方便測試。 */
export interface ApiDeps {
  settings: {
    load(): Promise<AppSettings>;
    save(p: SettingsPatch): Promise<AppSettings>;
    toPublic(s: AppSettings): PublicSettings;
  };
  translateWith(
    s: AppSettings,
    texts: string[],
    sourceLang: string | undefined,
    fetchImpl?: typeof fetch,
    targetLang?: string,
  ): Promise<TranslateResponse>;
  testEngine(
    s: AppSettings,
  ): Promise<{ ok: true; sample: string } | { ok: false; code: TranslateErrorCode; message: string }>;
  dataDir: string;
}

type ApiResult = { status: number; json?: unknown };

const STORE_PREFIX = '/api/store/';
const STORE_NAMESPACES: ReadonlySet<string> = new Set(['shuffle', 'lyrics-map']);
const STORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXTS = 400;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function badRequest(): ApiResult {
  return { status: 400, json: { error: 'BAD_REQUEST' } };
}

function methodNotAllowed(): ApiResult {
  return { status: 405, json: { error: 'METHOD_NOT_ALLOWED' } };
}

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function parseTranslateRequest(
  body: unknown,
): { texts: string[]; sourceLang: string | undefined; targetLang: string | undefined } | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;

  const rawTexts = record.texts;
  if (!Array.isArray(rawTexts) || rawTexts.length > MAX_TEXTS) return null;
  const texts: string[] = [];
  for (const value of rawTexts) {
    if (typeof value !== 'string') return null;
    texts.push(value);
  }

  const rawSourceLang = record.sourceLang;
  if (rawSourceLang !== undefined && typeof rawSourceLang !== 'string') return null;

  const rawTarget = record.targetLang;
  if (rawTarget !== undefined && (typeof rawTarget !== 'string' || !/^[A-Za-z-]{2,10}$/.test(rawTarget))) return null;
  return { texts, sourceLang: rawSourceLang, targetLang: rawTarget };
}

function extractTranslateErrorCode(err: unknown): TranslateErrorCode | null {
  if (err === null || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  if (
    code === 'NO_ENGINE' ||
    code === 'BAD_KEY' ||
    code === 'QUOTA' ||
    code === 'UPSTREAM' ||
    code === 'BAD_REQUEST'
  ) {
    return code;
  }
  return null;
}

function cloneSettings(source: AppSettings): AppSettings {
  return {
    spotifyClientId: source.spotifyClientId,
    translation: {
      engine: source.translation.engine,
      deepl: { apiKey: source.translation.deepl.apiKey },
      azure: {
        apiKey: source.translation.azure.apiKey,
        region: source.translation.azure.region,
      },
      openai: {
        baseUrl: source.translation.openai.baseUrl,
        model: source.translation.openai.model,
        apiKey: source.translation.openai.apiKey,
      },
    },
  };
}

async function handleSettings(
  method: string,
  body: unknown,
  deps: ApiDeps,
): Promise<ApiResult> {
  if (method === 'GET') {
    const settings = await deps.settings.load();
    return { status: 200, json: deps.settings.toPublic(settings) };
  }

  if (method === 'PUT') {
    try {
      const saved = await deps.settings.save(body as SettingsPatch);
      return { status: 200, json: deps.settings.toPublic(saved) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 400, json: { error: 'BAD_REQUEST', message } };
    }
  }

  return methodNotAllowed();
}

async function handleTranslate(
  method: string,
  body: unknown,
  deps: ApiDeps,
): Promise<ApiResult> {
  if (method !== 'POST') return methodNotAllowed();

  const parsed = parseTranslateRequest(body);
  if (parsed === null) return badRequest();

  try {
    const settings = await deps.settings.load();
    const result = await deps.translateWith(settings, parsed.texts, parsed.sourceLang, undefined, parsed.targetLang);
    return { status: 200, json: result };
  } catch (err) {
    switch (extractTranslateErrorCode(err)) {
      case 'NO_ENGINE':
        return { status: 503, json: { error: 'NO_ENGINE' } };
      case 'BAD_KEY':
        return { status: 401, json: { error: 'BAD_KEY' } };
      case 'QUOTA':
        return { status: 429, json: { error: 'QUOTA' } };
      default:
        return { status: 502, json: { error: 'UPSTREAM' } };
    }
  }
}

async function handleTranslateTest(
  method: string,
  body: unknown,
  deps: ApiDeps,
): Promise<ApiResult> {
  if (method !== 'POST') return methodNotAllowed();

  let patch: SettingsPatch | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body !== 'object' || Array.isArray(body)) return badRequest();
    const record = body as Record<string, unknown>;
    const rawPatch = record.patch;
    if (rawPatch !== undefined && rawPatch !== null) {
      if (typeof rawPatch !== 'object' || Array.isArray(rawPatch)) return badRequest();
      patch = rawPatch as SettingsPatch;
    }
  }

  let settings: AppSettings;
  try {
    const base = await deps.settings.load();
    settings = patch === undefined ? base : applyPatch(base, patch);
  } catch (err) {
    return { status: 400, json: { error: 'BAD_REQUEST', message: err instanceof Error ? err.message : String(err) } };
  }
  try {
    const result = await deps.testEngine(settings);
    return { status: 200, json: result };
  } catch {
    return { status: 502, json: { error: 'UPSTREAM' } };
  }
}

async function handleStore(
  method: string,
  pathname: string,
  body: unknown,
  deps: ApiDeps,
): Promise<ApiResult> {
  if (method !== 'GET' && method !== 'PUT') return methodNotAllowed();

  const rest = pathname.slice(STORE_PREFIX.length);
  const segments = rest.split('/');
  if (segments.length !== 2) return badRequest();

  const namespace = decodePathSegment(segments[0]);
  const id = decodePathSegment(segments[1]);
  if (namespace === null || id === null) return badRequest();
  if (!STORE_NAMESPACES.has(namespace)) return badRequest();
  if (!STORE_ID_PATTERN.test(id)) return badRequest();

  const filePath = path.join(deps.dataDir, namespace, `${id}.json`);

  if (method === 'GET') {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      return { status: 404, json: { error: 'NOT_FOUND' } };
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return { status: 200, json: parsed };
    } catch {
      return { status: 404, json: { error: 'NOT_FOUND' } };
    }
  }

  try {
    await mkdir(path.join(deps.dataDir, namespace), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    const serialized = JSON.stringify(body);
    await writeFile(tmpPath, serialized === undefined ? 'null' : serialized, 'utf8');
    await rename(tmpPath, filePath);
    return { status: 204 };
  } catch {
    return { status: 500, json: { error: 'WRITE_FAILED' } };
  }
}

export async function handleApi(
  method: string,
  pathname: string,
  body: unknown,
  deps: ApiDeps,
): Promise<{ status: number; json?: unknown } | null> {
  const queryIndex = pathname.indexOf('?');
  const routePath = queryIndex === -1 ? pathname : pathname.slice(0, queryIndex);
  const httpMethod = method.toUpperCase();

  if (routePath === '/api/settings') {
    return handleSettings(httpMethod, body, deps);
  }
  if (routePath === '/api/translate') {
    return handleTranslate(httpMethod, body, deps);
  }
  if (routePath === '/api/translate/test') {
    return handleTranslateTest(httpMethod, body, deps);
  }
  if (routePath.startsWith(STORE_PREFIX)) {
    return handleStore(httpMethod, routePath, body, deps);
  }

  return null;
}

type BodyResult = { ok: true; text: string } | { ok: false; tooLarge: boolean };

function sendJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function collectRequestBody(req: any, onDone: (result: BodyResult) => void): void {
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
      return;
    }
    onDone({ ok: true, text: Buffer.concat(chunks).toString('utf8') });
  });

  req.on('error', () => {
    onDone({ ok: false, tooLarge: false });
  });
}

export function apiPlugin(deps: ApiDeps): Plugin {
  return {
    name: 'api-routes',
    configureServer(server) {
      server.middlewares.use((req: any, res: any, next: any): void => {
        const rawUrl: string = typeof req.url === 'string' ? req.url : '';
        const queryIndex = rawUrl.indexOf('?');
        const pathname = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
        const method: string = typeof req.method === 'string' ? req.method : '';

        const respond = (body: unknown): void => {
          void handleApi(method, pathname, body, deps)
            .then((result) => {
              if (result === null) {
                next();
                return;
              }
              if (result.status === 204) {
                res.statusCode = 204;
                res.end();
                return;
              }
              sendJson(res, result.status, result.json);
            })
            .catch(() => {
              if (!res.headersSent) {
                sendJson(res, 500, { error: 'INTERNAL' });
              }
            });
        };

        // GET 沒有 body；其餘 method 一律讀取並解析 JSON body。
        if (method === 'GET') {
          respond(undefined);
          return;
        }

        collectRequestBody(req, (bodyResult) => {
          if (!bodyResult.ok) {
            sendJson(res, bodyResult.tooLarge ? 413 : 400, {
              error: bodyResult.tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
            });
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(bodyResult.text) as unknown;
          } catch {
            sendJson(res, 400, { error: 'BAD_REQUEST' });
            return;
          }

          respond(parsed);
        });
      });
    },
  };
}
