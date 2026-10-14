import { afterEach, beforeEach, expect, test } from 'vitest';

import {
  decideStartupMode,
  loadMode,
  pickRemoteDevice,
  saveMode,
} from '../../src/playback/modes';
import { CONFIG } from '../../src/config';
import type { Device, PlaybackState } from '../../src/spotify/types';

const globalAny = globalThis as Record<string, unknown>;

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    const v = this.store.get(key);
    return v === undefined ? null : v;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return index >= 0 && index < keys.length ? (keys[index] ?? null) : null;
  }

  get length(): number {
    return this.store.size;
  }
}

function makeThrowingStorage(): unknown {
  const boom = (): never => {
    throw new Error('localStorage is not available');
  };
  return {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
    length: 0,
  };
}

function installLocalStorage(value: unknown): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value,
    writable: true,
    configurable: true,
  });
}

function uninstallLocalStorage(): void {
  try {
    delete globalAny.localStorage;
  } catch {
    // 忽略：屬性不可刪除時維持原狀
  }
}

let savedLocalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  savedLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  installLocalStorage(new MemoryStorage());
});

afterEach(() => {
  if (savedLocalStorage !== undefined) {
    Object.defineProperty(globalThis, 'localStorage', savedLocalStorage);
  } else {
    uninstallLocalStorage();
  }
});

function makeState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    track: null,
    positionMs: 0,
    isPlaying: false,
    deviceId: null,
    deviceName: null,
    timestamp: 0,
    ...overrides,
  };
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-1',
    name: 'Device 1',
    type: 'Computer',
    isActive: false,
    isRestricted: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// decideStartupMode
// ---------------------------------------------------------------------------

test('decideStartupMode returns "app" when state is playing on a device other than the web player', () => {
  const state = makeState({ isPlaying: true, deviceName: 'Some Phone' });
  expect(decideStartupMode(state, null)).toBe('app');
  expect(decideStartupMode(state, 'web')).toBe('app');
  expect(decideStartupMode(state, 'app')).toBe('app');
});

test('decideStartupMode falls back to lastMode when playback is already on the web player device', () => {
  const state = makeState({ isPlaying: true, deviceName: CONFIG.deviceName });
  expect(decideStartupMode(state, null)).toBe('web');
  expect(decideStartupMode(state, 'app')).toBe('app');
  expect(decideStartupMode(state, 'web')).toBe('web');
});

test('decideStartupMode falls back to lastMode when the state is not playing', () => {
  const state = makeState({ isPlaying: false, deviceName: 'Some Phone' });
  expect(decideStartupMode(state, null)).toBe('web');
  expect(decideStartupMode(state, 'app')).toBe('app');
  expect(decideStartupMode(state, 'web')).toBe('web');
});

test('decideStartupMode falls back to lastMode when there is no state', () => {
  expect(decideStartupMode(null, null)).toBe('web');
  expect(decideStartupMode(null, 'app')).toBe('app');
  expect(decideStartupMode(null, 'web')).toBe('web');
});

test('decideStartupMode treats a null deviceName as a different device', () => {
  const state = makeState({ isPlaying: true, deviceName: null });
  expect(decideStartupMode(state, null)).toBe('app');
  expect(decideStartupMode(state, 'web')).toBe('app');
});

test('decideStartupMode honours an explicit webDeviceName argument', () => {
  const state = makeState({ isPlaying: true, deviceName: 'MyWebName' });
  expect(decideStartupMode(state, null, 'MyWebName')).toBe('web');
  expect(decideStartupMode(state, 'app', 'MyWebName')).toBe('app');
  expect(decideStartupMode(state, null, 'SomethingElse')).toBe('app');
});

// ---------------------------------------------------------------------------
// pickRemoteDevice
// ---------------------------------------------------------------------------

test('pickRemoteDevice returns null for an empty device list', () => {
  expect(pickRemoteDevice([], null)).toBe(null);
  expect(pickRemoteDevice([], 'web-1')).toBe(null);
});

test('pickRemoteDevice excludes the device whose id matches webDeviceId', () => {
  const web = makeDevice({ id: 'web-1', name: 'Some Name', isActive: true });
  const other = makeDevice({ id: 'other-1', name: 'Other', type: 'Smartphone' });
  expect(pickRemoteDevice([web, other], 'web-1')?.id).toBe('other-1');
});

test('pickRemoteDevice excludes the device whose name matches CONFIG.deviceName', () => {
  const web = makeDevice({ id: 'web-1', name: CONFIG.deviceName, isActive: true });
  const other = makeDevice({ id: 'other-1', name: 'Other', type: 'Smartphone' });
  expect(pickRemoteDevice([web, other], null)?.id).toBe('other-1');
});

test('pickRemoteDevice excludes restricted devices', () => {
  const restricted = makeDevice({
    id: 'r-1',
    name: 'Restricted',
    isActive: true,
    isRestricted: true,
  });
  const other = makeDevice({ id: 'o-1', name: 'Other' });
  expect(pickRemoteDevice([restricted, other], null)?.id).toBe('o-1');
});

test('pickRemoteDevice ignores an active device if it is restricted', () => {
  const activeRestricted = makeDevice({
    id: 'ar-1',
    name: 'AR',
    isActive: true,
    isRestricted: true,
    type: 'Smartphone',
  });
  const computer = makeDevice({ id: 'c-1', name: 'C', type: 'Computer' });
  expect(pickRemoteDevice([activeRestricted, computer], null)?.id).toBe('c-1');
});

test('pickRemoteDevice returns null when every device is excluded', () => {
  const webById = makeDevice({ id: 'web-1', name: 'Whatever' });
  const webByName = makeDevice({ id: 'w-2', name: CONFIG.deviceName });
  const restricted = makeDevice({ id: 'r-1', name: 'R', isRestricted: true });
  expect(pickRemoteDevice([webById, webByName, restricted], 'web-1')).toBe(null);
});

test('pickRemoteDevice prefers an active device over a computer device', () => {
  const inactiveComputer = makeDevice({
    id: 'c-1',
    name: 'Computer',
    type: 'Computer',
    isActive: false,
  });
  const activePhone = makeDevice({
    id: 'p-1',
    name: 'Phone',
    type: 'Smartphone',
    isActive: true,
  });
  expect(pickRemoteDevice([inactiveComputer, activePhone], null)?.id).toBe('p-1');
  expect(pickRemoteDevice([activePhone, inactiveComputer], null)?.id).toBe('p-1');
});

test('pickRemoteDevice falls back to a Computer type device when nothing is active', () => {
  const phone = makeDevice({ id: 'p-1', name: 'Phone', type: 'Smartphone' });
  const computer = makeDevice({ id: 'c-1', name: 'Computer', type: 'Computer' });
  expect(pickRemoteDevice([phone, computer], null)?.id).toBe('c-1');
  expect(pickRemoteDevice([computer, phone], null)?.id).toBe('c-1');
});

test('pickRemoteDevice falls back to the first remaining device when nothing is active or a Computer', () => {
  const first = makeDevice({ id: 'f-1', name: 'First', type: 'Smartphone' });
  const second = makeDevice({ id: 's-1', name: 'Second', type: 'Tablet' });
  expect(pickRemoteDevice([first, second], null)?.id).toBe('f-1');
});

test('pickRemoteDevice with a null webDeviceId does not filter anything out by id', () => {
  const device = makeDevice({ id: 'x-1', name: 'X', type: 'Computer' });
  expect(pickRemoteDevice([device], null)?.id).toBe('x-1');
});

test('pickRemoteDevice picks the first active device when several are active', () => {
  const firstActive = makeDevice({
    id: 'a-1',
    name: 'A',
    isActive: true,
    type: 'Smartphone',
  });
  const secondActive = makeDevice({
    id: 'a-2',
    name: 'B',
    isActive: true,
    type: 'Computer',
  });
  const inactive = makeDevice({ id: 'i-1', name: 'I' });
  expect(pickRemoteDevice([inactive, firstActive, secondActive], null)?.id).toBe('a-1');
});

// ---------------------------------------------------------------------------
// saveMode / loadMode
// ---------------------------------------------------------------------------

test('loadMode returns null when nothing has been stored', () => {
  expect(loadMode()).toBe(null);
});

test('saveMode then loadMode round-trips every allowed mode value', () => {
  const modes = ['web', 'app'] as const;
  for (let i = 0; i < 100; i += 1) {
    const m = modes[i % modes.length]!;
    saveMode(m);
    expect(loadMode(), `round-trip failed for "${m}" at iteration ${i}`).toBe(m);
  }
});

test('saveMode stores under the "spl.mode" key', () => {
  saveMode('app');
  expect((globalAny.localStorage as Storage).getItem('spl.mode')).not.toBe(null);
});

test('loadMode reads a valid mode stored directly under "spl.mode"', () => {
  (globalAny.localStorage as Storage).setItem('spl.mode', 'web');
  expect(loadMode()).toBe('web');
  (globalAny.localStorage as Storage).setItem('spl.mode', 'app');
  expect(loadMode()).toBe('app');
});

test('loadMode returns null for an invalid stored value', () => {
  (globalAny.localStorage as Storage).setItem('spl.mode', 'remote');
  expect(loadMode()).toBe(null);

  (globalAny.localStorage as Storage).setItem('spl.mode', '');
  expect(loadMode()).toBe(null);

  (globalAny.localStorage as Storage).setItem('spl.mode', 'WEB');
  expect(loadMode()).toBe(null);

  (globalAny.localStorage as Storage).setItem('spl.mode', '{}');
  expect(loadMode()).toBe(null);
});

test('loadMode returns null when localStorage throws', () => {
  installLocalStorage(makeThrowingStorage());
  expect(loadMode()).toBe(null);
});

test('saveMode does not throw when localStorage throws', () => {
  installLocalStorage(makeThrowingStorage());
  expect(() => {
    saveMode('web');
  }).not.toThrow();
  expect(() => {
    saveMode('app');
  }).not.toThrow();
});

test('loadMode returns null when localStorage is missing entirely', () => {
  uninstallLocalStorage();
  expect(loadMode()).toBe(null);
});
