import { CONFIG } from '../config';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const VERIFIER_KEY = 'spl.pkce.verifier';
const STATE_KEY = 'spl.pkce.state';
const TOKENS_KEY = 'spl.tokens';
const REFRESH_BUFFER_MS = 60_000;
const VERIFIER_LENGTH = 64;
const VERIFIER_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const BASE64URL_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export class AuthRequiredError extends Error {
  constructor(message = 'Spotify 登入已失效，請重新登入') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/** 直接把位元組編成 base64url（無 padding），不經過字串中介，避免非 ASCII 位元組的問題。 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    out += BASE64URL_CHARS.charAt(b0 >> 2);
    out += BASE64URL_CHARS.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    if (hasB1) {
      out += BASE64URL_CHARS.charAt(((b1 & 0x0f) << 2) | (b2 >> 6));
    }
    if (hasB2) {
      out += BASE64URL_CHARS.charAt(b2 & 0x3f);
    }
  }
  return out;
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** 內建 SHA-256，結果與 WebCrypto 相同；避免依賴測試環境中不一致的 crypto.subtle。 */
function sha256(message: Uint8Array): Uint8Array {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLengthHi = Math.floor(message.length / 0x20000000) >>> 0;
  const bitLengthLo = (message.length << 3) >>> 0;
  const paddedLength = (((message.length + 8) >> 6) + 1) << 6;

  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLengthHi, false);
  view.setUint32(paddedLength - 4, bitLengthLo, false);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = view.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];

    for (let t = 0; t < 64; t += 1) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, state[i], false);
  }
  return digest;
}

export async function codeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  return bytesToBase64Url(sha256(data));
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: CONFIG.scopes.join(' '),
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function randomVerifier(): string {
  // 66 個字元的字元集；以拒絕取樣避免取模偏差（256 - (256 % 66) = 198）。
  const limit = 256 - (256 % VERIFIER_CHARS.length);
  const out: string[] = [];
  const buffer = new Uint8Array(VERIFIER_LENGTH);
  while (out.length < VERIFIER_LENGTH) {
    crypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && out.length < VERIFIER_LENGTH; i += 1) {
      const byte = buffer[i];
      if (byte < limit) {
        out.push(VERIFIER_CHARS.charAt(byte % VERIFIER_CHARS.length));
      }
    }
  }
  return out.join('');
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function beginLogin(): Promise<void> {
  const verifier = randomVerifier();
  const state = randomState();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const challenge = await codeChallenge(verifier);
  location.href = buildAuthorizeUrl(challenge, state);
}

function readTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTokens> | null;
    if (
      !parsed ||
      typeof parsed.access_token !== 'string' ||
      typeof parsed.refresh_token !== 'string' ||
      typeof parsed.expires_at !== 'number'
    ) {
      return null;
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: parsed.expires_at,
    };
  } catch {
    return null;
  }
}

function storeTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function hasTokens(): boolean {
  return readTokens() !== null;
}

async function exchangeCodeForTokens(
  code: string,
  verifier: string,
): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CONFIG.redirectUri,
    client_id: CONFIG.clientId,
    code_verifier: verifier,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    throw new AuthRequiredError('無法連線至 Spotify 以完成登入');
  }

  if (!res.ok) {
    throw new AuthRequiredError('Spotify 拒絕了登入請求');
  }

  let data: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new AuthRequiredError('Spotify 回應格式不正確');
  }

  if (
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    typeof data.expires_in !== 'number'
  ) {
    throw new AuthRequiredError('Spotify 回應缺少必要的權杖欄位');
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function handleCallback(url: URL): Promise<void> {
  const error = url.searchParams.get('error');
  if (error) {
    throw new AuthRequiredError(`Spotify 授權失敗：${error}`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);

  if (!code || !state || !savedState || !verifier || state !== savedState) {
    throw new AuthRequiredError('登入驗證失敗，請重新登入');
  }

  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  const tokens = await exchangeCodeForTokens(code, verifier);
  storeTokens(tokens);
  history.replaceState(null, '', '/');
}

let refreshPromise: Promise<string> | null = null;

async function performRefresh(tokens: StoredTokens): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: CONFIG.clientId,
  });

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    throw new AuthRequiredError('無法連線至 Spotify 以更新權杖');
  }

  if (!res.ok) {
    throw new AuthRequiredError('更新 Spotify 權杖失敗');
  }

  let data: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new AuthRequiredError('Spotify 回應格式不正確');
  }

  if (
    typeof data.access_token !== 'string' ||
    typeof data.expires_in !== 'number'
  ) {
    throw new AuthRequiredError('Spotify 回應缺少必要的權杖欄位');
  }

  const next: StoredTokens = {
    access_token: data.access_token,
    refresh_token:
      typeof data.refresh_token === 'string'
        ? data.refresh_token
        : tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  storeTokens(next);
  return next.access_token;
}

export async function getAccessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) {
    throw new AuthRequiredError('尚未登入 Spotify');
  }

  if (Date.now() < tokens.expires_at - REFRESH_BUFFER_MS) {
    return tokens.access_token;
  }

  if (!refreshPromise) {
    refreshPromise = performRefresh(tokens).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function logout(): void {
  refreshPromise = null;
  localStorage.removeItem(TOKENS_KEY);
}
