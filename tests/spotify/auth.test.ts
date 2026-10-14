import { beforeEach, expect, test, vi } from 'vitest';

import {
  AuthRequiredError,
  beginLogin,
  buildAuthorizeUrl,
  codeChallenge,
  getAccessToken,
  handleCallback,
  hasTokens,
  logout,
} from '../../src/spotify/auth';
import { CONFIG } from '../../src/config';

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/* ------------------------------------------------------------------ */
/* 測試替身（不連網）                                                  */
/* ------------------------------------------------------------------ */

let lastRedirect: string | null = null;
let historyArgs: unknown[][] = [];
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];
let fetchResponder: (url: string, init: RequestInit) => Promise<Response> | Response = () =>
  jsonResponse(200, {});

const locationStub = {
  get href(): string {
    return lastRedirect ?? '';
  },
  set href(value: string) {
    lastRedirect = value;
  },
  assign(value: string): void {
    lastRedirect = value;
  },
  replace(value: string): void {
    lastRedirect = value;
  },
  origin: 'http://127.0.0.1:5180',
  protocol: 'http:',
  host: '127.0.0.1:5180',
  hostname: '127.0.0.1',
  port: '5180',
  pathname: '/',
  search: '',
  hash: '',
};

const historyStub = {
  replaceState(...args: unknown[]): void {
    historyArgs.push(args);
  },
  pushState(...args: unknown[]): void {
    historyArgs.push(args);
  },
  back(): void {},
  forward(): void {},
  go(): void {},
};

function setGlobal(name: string, value: unknown): void {
  try {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  } catch {
    (globalThis as unknown as Record<string, unknown>)[name] = value;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  const maybe = input as { url?: string } | null;
  if (maybe && typeof maybe.url === 'string') {
    return maybe.url;
  }
  return String(input);
}

function tokenRequestBody(index = 0): URLSearchParams {
  const call = fetchCalls[index];
  expect(call).toBeTruthy();
  return new URLSearchParams(String(call.init.body ?? ''));
}

function setTokens(tokens: StoredTokens): void {
  localStorage.setItem('spl.tokens', JSON.stringify(tokens));
}

beforeEach(() => {
  lastRedirect = null;
  historyArgs = [];
  fetchCalls = [];
  fetchResponder = () => jsonResponse(200, {});
  localStorage.clear();
  sessionStorage.clear();

  setGlobal('location', locationStub);
  setGlobal('history', historyStub);

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const requestInit: RequestInit = init ?? {};
    fetchCalls.push({ url, init: requestInit });
    return fetchResponder(url, requestInit);
  });
  vi.stubGlobal('fetch', fetchMock);
});

/* ------------------------------------------------------------------ */
/* codeChallenge                                                       */
/* ------------------------------------------------------------------ */

test('codeChallenge 對 RFC 7636 附錄 B 的 verifier 產生正確的 base64url S256 challenge', async () => {
  const challenge = await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('codeChallenge 產生 43 字元的 base64url 字串（無 padding）', async () => {
  const challenge = await codeChallenge('verifier-value');
  expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

/* ------------------------------------------------------------------ */
/* buildAuthorizeUrl                                                   */
/* ------------------------------------------------------------------ */

test('buildAuthorizeUrl 指向 Spotify authorize 並帶齊 PKCE 參數、redirect_uri 與空白連接的 scopes', () => {
  const url = new URL(buildAuthorizeUrl('CHALLENGE-VALUE', 'STATE-VALUE'));

  expect(`${url.origin}${url.pathname}`).toBe('https://accounts.spotify.com/authorize');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
  expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE-VALUE');
  expect(url.searchParams.get('state')).toBe('STATE-VALUE');
  expect(url.searchParams.get('scope')).toBe(CONFIG.scopes.join(' '));
});

/* ------------------------------------------------------------------ */
/* beginLogin                                                          */
/* ------------------------------------------------------------------ */

test('beginLogin 把 64 字元 verifier 與 state 存進 sessionStorage，並跳轉到對應的 authorize URL', async () => {
  await beginLogin();

  const verifier = sessionStorage.getItem('spl.pkce.verifier');
  const state = sessionStorage.getItem('spl.pkce.state');

  expect(verifier).toBeTruthy();
  expect(verifier as string).toMatch(/^[A-Za-z0-9._~-]{64}$/);
  expect(state).toBeTruthy();

  expect(lastRedirect).toBeTruthy();
  const url = new URL(lastRedirect as string);
  expect(`${url.origin}${url.pathname}`).toBe('https://accounts.spotify.com/authorize');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
  expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toBe(await codeChallenge(verifier as string));
  expect(url.searchParams.get('state')).toBe(state);
});

/* ------------------------------------------------------------------ */
/* handleCallback                                                      */
/* ------------------------------------------------------------------ */

test('handleCallback 在 state 不符時拒絕，且不呼叫 token endpoint', async () => {
  sessionStorage.setItem('spl.pkce.verifier', 'verifier-value');
  sessionStorage.setItem('spl.pkce.state', 'expected-state');

  const callbackUrl = new URL(
    'http://127.0.0.1:5180/callback?code=the-code&state=wrong-state',
  );

  await expect(handleCallback(callbackUrl)).rejects.toBeInstanceOf(AuthRequiredError);
  expect(fetchCalls.length).toBe(0);
});

test('handleCallback 在 sessionStorage 沒有 state 時拒絕，且不呼叫 token endpoint', async () => {
  const callbackUrl = new URL(
    'http://127.0.0.1:5180/callback?code=the-code&state=state-value',
  );

  await expect(handleCallback(callbackUrl)).rejects.toBeInstanceOf(AuthRequiredError);
  expect(fetchCalls.length).toBe(0);
});

test('handleCallback 驗證 state 後用 verifier 換 token，寫入 spl.tokens 並以 replaceState 回到 /', async () => {
  sessionStorage.setItem('spl.pkce.verifier', 'verifier-value');
  sessionStorage.setItem('spl.pkce.state', 'state-value');
  fetchResponder = () =>
    jsonResponse(200, {
      access_token: 'ACCESS-1',
      refresh_token: 'REFRESH-1',
      expires_in: 3600,
    });

  const before = Date.now();
  await handleCallback(
    new URL('http://127.0.0.1:5180/callback?code=the-code&state=state-value'),
  );
  const after = Date.now();

  expect(fetchCalls.length).toBe(1);
  expect(fetchCalls[0].url).toBe('https://accounts.spotify.com/api/token');

  const body = tokenRequestBody();
  expect(body.get('grant_type')).toBe('authorization_code');
  expect(body.get('code')).toBe('the-code');
  expect(body.get('code_verifier')).toBe('verifier-value');
  expect(body.get('client_id')).toBe(CONFIG.clientId);

  const raw = localStorage.getItem('spl.tokens');
  expect(raw).toBeTruthy();
  const stored = JSON.parse(raw as string) as StoredTokens;
  expect(stored.access_token).toBe('ACCESS-1');
  expect(stored.refresh_token).toBe('REFRESH-1');
  expect(stored.expires_at).toBeGreaterThanOrEqual(before + 3600 * 1000);
  expect(stored.expires_at).toBeLessThanOrEqual(after + 3600 * 1000);

  expect(sessionStorage.getItem('spl.pkce.state')).toBeNull();
  expect(sessionStorage.getItem('spl.pkce.verifier')).toBeNull();

  expect(historyArgs.some((args) => args[2] === '/')).toBe(true);
});

test('handleCallback 在 token endpoint 失敗時丟出 AuthRequiredError，且不寫入 spl.tokens', async () => {
  sessionStorage.setItem('spl.pkce.verifier', 'verifier-value');
  sessionStorage.setItem('spl.pkce.state', 'state-value');
  fetchResponder = () => jsonResponse(400, { error: 'invalid_grant' });

  await expect(
    handleCallback(new URL('http://127.0.0.1:5180/callback?code=the-code&state=state-value')),
  ).rejects.toBeInstanceOf(AuthRequiredError);

  expect(localStorage.getItem('spl.tokens')).toBeNull();
});

/* ------------------------------------------------------------------ */
/* getAccessToken                                                      */
/* ------------------------------------------------------------------ */

test('getAccessToken 在沒有 token 時丟出 AuthRequiredError', async () => {
  await expect(getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
});

test('getAccessToken 在 token 尚未進入過期前 60 秒時直接回傳，不呼叫 fetch', async () => {
  setTokens({
    access_token: 'CURRENT',
    refresh_token: 'REFRESH-OLD',
    expires_at: Date.now() + 3_600_000,
  });

  const token = await getAccessToken();

  expect(token).toBe('CURRENT');
  expect(fetchCalls.length).toBe(0);
});

test('getAccessToken 在過期前 60 秒內自動 refresh，並在回應沒有 refresh_token 時保留舊的', async () => {
  setTokens({
    access_token: 'OLD',
    refresh_token: 'REFRESH-OLD',
    expires_at: Date.now() + 30_000,
  });
  fetchResponder = () => jsonResponse(200, { access_token: 'NEW', expires_in: 3600 });

  const before = Date.now();
  const token = await getAccessToken();
  const after = Date.now();

  expect(token).toBe('NEW');
  expect(fetchCalls.length).toBe(1);
  expect(fetchCalls[0].url).toBe('https://accounts.spotify.com/api/token');

  const body = tokenRequestBody();
  expect(body.get('grant_type')).toBe('refresh_token');
  expect(body.get('refresh_token')).toBe('REFRESH-OLD');
  expect(body.get('client_id')).toBe(CONFIG.clientId);

  const stored = JSON.parse(localStorage.getItem('spl.tokens') as string) as StoredTokens;
  expect(stored.access_token).toBe('NEW');
  expect(stored.refresh_token).toBe('REFRESH-OLD');
  expect(stored.expires_at).toBeGreaterThanOrEqual(before + 3600 * 1000);
  expect(stored.expires_at).toBeLessThanOrEqual(after + 3600 * 1000);
});

test('getAccessToken 在 refresh 回應帶新 refresh_token 時更新儲存的 refresh_token', async () => {
  setTokens({
    access_token: 'OLD',
    refresh_token: 'REFRESH-OLD',
    expires_at: Date.now() + 1_000,
  });
  fetchResponder = () =>
    jsonResponse(200, {
      access_token: 'NEW',
      refresh_token: 'REFRESH-NEW',
      expires_in: 3600,
    });

  const token = await getAccessToken();

  expect(token).toBe('NEW');
  const stored = JSON.parse(localStorage.getItem('spl.tokens') as string) as StoredTokens;
  expect(stored.access_token).toBe('NEW');
  expect(stored.refresh_token).toBe('REFRESH-NEW');
});

test('getAccessToken 在 refresh 失敗時丟出 AuthRequiredError', async () => {
  setTokens({
    access_token: 'OLD',
    refresh_token: 'REFRESH-OLD',
    expires_at: Date.now() + 1_000,
  });
  fetchResponder = () => jsonResponse(400, { error: 'invalid_grant' });

  await expect(getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
});

test('getAccessToken 在 refresh 連線失敗時丟出 AuthRequiredError', async () => {
  setTokens({
    access_token: 'OLD',
    refresh_token: 'REFRESH-OLD',
    expires_at: Date.now() + 1_000,
  });
  fetchResponder = () => {
    throw new Error('network down');
  };

  await expect(getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
});

test('多個同時的 getAccessToken 只送出一次 refresh', async () => {
  setTokens({
    access_token: 'OLD',
    refresh_token: 'REFRESH-OLD',
    expires_at: Date.now() + 1_000,
  });
  fetchResponder = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return jsonResponse(200, { access_token: 'NEW', expires_in: 3600 });
  };

  const results = await Promise.all([
    getAccessToken(),
    getAccessToken(),
    getAccessToken(),
  ]);

  expect(results).toEqual(['NEW', 'NEW', 'NEW']);
  expect(fetchCalls.length).toBe(1);
});

/* ------------------------------------------------------------------ */
/* hasTokens / logout                                                  */
/* ------------------------------------------------------------------ */

test('hasTokens 在沒有 token 時為 false，有 token 時為 true', () => {
  expect(hasTokens()).toBe(false);

  setTokens({
    access_token: 'A',
    refresh_token: 'R',
    expires_at: Date.now() + 3_600_000,
  });

  expect(hasTokens()).toBe(true);
});

test('logout 清掉 spl.tokens，之後 getAccessToken 丟出 AuthRequiredError', async () => {
  setTokens({
    access_token: 'A',
    refresh_token: 'R',
    expires_at: Date.now() + 3_600_000,
  });

  logout();

  expect(localStorage.getItem('spl.tokens')).toBeNull();
  expect(hasTokens()).toBe(false);

  await expect(getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
});
