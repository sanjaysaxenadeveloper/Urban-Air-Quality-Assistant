export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly mode: 'localStorage' | 'memory';
}

export function createSafeStorage(backend?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): StorageAdapter {
  const memoryFallback = new Map<string, string>();
  let storageAvailable = false;

  const target =
    backend !== undefined
      ? backend
      : typeof window !== 'undefined'
        ? (() => {
            try {
              return window.localStorage;
            } catch {
              return null;
            }
          })()
        : null;

  if (target) {
    try {
      const probeKey = '__uaqa_storage_probe__';
      target.setItem(probeKey, '1');
      target.removeItem(probeKey);
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }

  return {
    get mode() {
      return storageAvailable ? 'localStorage' : 'memory';
    },
    getItem(key: string): string | null {
      if (storageAvailable && target) {
        try {
          return target.getItem(key);
        } catch {
          storageAvailable = false;
        }
      }
      return memoryFallback.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (storageAvailable && target) {
        try {
          target.setItem(key, value);
          return;
        } catch {
          storageAvailable = false;
        }
      }
      memoryFallback.set(key, value);
    },
    removeItem(key: string): void {
      if (storageAvailable && target) {
        try {
          target.removeItem(key);
        } catch {
          storageAvailable = false;
        }
      }
      memoryFallback.delete(key);
    },
  };
}

export const safeStorage = createSafeStorage();
