import { CONFIG } from '../config';
import type { Device, PlaybackState } from '../spotify/types';

export type Mode = 'web' | 'app';

const MODE_STORAGE_KEY = 'spl.mode';

/**
 * 決定啟動時要用的播放模式。
 * - 已有播放中的狀態、且播放裝置不是本播放器 → 'app'（沿用外部裝置，不搶播放）
 * - 否則沿用上次的模式，沒有紀錄時預設 'web'
 */
export function decideStartupMode(
  state: PlaybackState | null,
  lastMode: Mode | null,
  webDeviceName: string = CONFIG.deviceName,
): Mode {
  if (state !== null && state.isPlaying === true && state.deviceName !== webDeviceName) {
    return 'app';
  }
  return lastMode ?? 'web';
}

/**
 * 從裝置清單中挑一個適合遙控的裝置。
 * 排除：本播放器（以 id 或名稱判斷）、受限裝置（isRestricted）。
 * 優先順序：isActive → type === 'Computer' → 第一個。
 */
export function pickRemoteDevice(
  devices: Device[],
  webDeviceId: string | null,
): Device | null {
  if (!Array.isArray(devices)) {
    return null;
  }

  const candidates: Device[] = [];
  for (const device of devices) {
    if (!device) continue;
    if (webDeviceId !== null && device.id === webDeviceId) continue;
    if (device.name === CONFIG.deviceName) continue;
    if (device.isRestricted === true) continue;
    candidates.push(device);
  }

  if (candidates.length === 0) {
    return null;
  }

  for (const device of candidates) {
    if (device.isActive === true) {
      return device;
    }
  }

  for (const device of candidates) {
    if (device.type === 'Computer') {
      return device;
    }
  }

  return candidates[0] ?? null;
}

/**
 * 讀取上次使用的播放模式；沒有紀錄、值不合法或 localStorage 不可用時回傳 null。
 */
export function loadMode(): Mode | null {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (raw === 'web' || raw === 'app') {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 儲存播放模式；localStorage 不可用時靜默失敗。
 */
export function saveMode(m: Mode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, m);
  } catch {
    // 忽略：無法寫入時不影響播放流程
  }
}
