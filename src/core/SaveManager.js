export class SaveManager {
  constructor(storageKey, { version = 2, legacyKeys = [] } = {}) {
    this.storageKey = storageKey;
    this.version = version;
    this.legacyKeys = legacyKeys;
  }

  load() {
    const keys = [this.storageKey, ...this.legacyKeys];
    for (const key of keys) {
      const raw = this.readRaw(key);
      if (!raw) continue;
      const parsed = this.safeParse(raw, key);
      const state = this.normalizeSave(parsed);
      if (state) return state;
    }
    return null;
  }

  readRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('Save read failed. Starting a fresh save.', error);
      return null;
    }
  }

  safeParse(raw, key) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`Save data for ${key} is corrupted. Ignoring it.`, error);
      return null;
    }
  }

  normalizeSave(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version && parsed.state && typeof parsed.state === 'object') return parsed.state;
    if ('credits' in parsed || parsed.ship || parsed.inventory) return parsed;
    return null;
  }

  save(state) {
    const saveData = {
      version: this.version,
      savedAt: new Date().toISOString(),
      state,
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(saveData));
    } catch (error) {
      console.warn('Save write failed.', error);
    }
    return saveData;
  }

  manualSave(state) {
    return this.save(state);
  }

  reset() {
    try {
      localStorage.removeItem(this.storageKey);
      this.legacyKeys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn('Save reset failed.', error);
    }
  }
}
