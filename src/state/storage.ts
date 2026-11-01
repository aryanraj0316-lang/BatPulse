import { Platform } from 'react-native';

/**
 * Tiny persistent key → JSON store.
 *  - Web: localStorage.
 *  - Phones: one JSON file per key in the app's document folder (expo-file-system).
 * Reads are synchronous (the stores load once at startup); writes are fire-and-forget.
 */

type FileLike = { exists: boolean; textSync(): string; write(s: string): unknown; create(): void };
let makeFile: ((key: string) => FileLike) | null = null;
if (Platform.OS !== 'web') {
  try {
    const fs = require('expo-file-system');
    makeFile = (key: string) => new fs.File(fs.Paths.document, `${key}.json`);
  } catch {
    makeFile = null; // no file system available: progress lives for this session only
  }
}

export function loadJSON<T = any>(key: string): T | null {
  try {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const s = window.localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : null;
    }
    if (!makeFile) return null;
    const f = makeFile(key);
    if (!f.exists) return null;
    const s = f.textSync();
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    const s = JSON.stringify(value);
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key, s);
      return;
    }
    if (!makeFile) return;
    const f = makeFile(key);
    if (!f.exists) f.create();
    Promise.resolve(f.write(s)).catch(() => {});
  } catch {
    // saving is best-effort; never crash the game over it
  }
}
