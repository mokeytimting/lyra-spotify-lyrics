import type { PublicSettings, SettingsPatch } from './types';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg = (data as { message?: unknown } | null)?.message;
    throw new Error(typeof msg === 'string' ? msg : `設定伺服器錯誤（${res.status}）`);
  }
  return data as T;
}

export const loadSettings = (): Promise<PublicSettings> => request('GET', '/api/settings');

export const saveSettings = (p: SettingsPatch): Promise<PublicSettings> => request('PUT', '/api/settings', p);

export const testTranslation = (
  patch: SettingsPatch,
): Promise<{ ok: true; sample: string } | { ok: false; code: string; message: string }> =>
  request('POST', '/api/translate/test', { patch });

/** 本機 JSON 儲存（真・隨機的洗牌狀態、手動指定的歌詞） */
export async function loadStore<T>(ns: 'shuffle' | 'lyrics-map', id: string): Promise<T | null> {
  const res = await fetch(`/api/store/${ns}/${encodeURIComponent(id)}`);
  if (res.status === 404 || !res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export async function saveStore(ns: 'shuffle' | 'lyrics-map', id: string, data: unknown): Promise<void> {
  await fetch(`/api/store/${ns}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
