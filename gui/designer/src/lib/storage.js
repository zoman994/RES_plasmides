const _memoryStore = new Map();

function _hasLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return false;
    const probe = '__bodgegene_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

let _useFallback = !_hasLocalStorage();

export function isUsingFallback() {
  return _useFallback;
}

export function _setFallbackForTests(value) {
  _useFallback = !!value;
}

export function _resetMemoryStore() {
  _memoryStore.clear();
}

export function getItem(key) {
  if (_useFallback) {
    return _memoryStore.has(key) ? _memoryStore.get(key) : null;
  }
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    _useFallback = true;
    return _memoryStore.has(key) ? _memoryStore.get(key) : null;
  }
}

export function setItem(key, value) {
  if (_useFallback) {
    _memoryStore.set(key, String(value));
    return;
  }
  try {
    globalThis.localStorage.setItem(key, String(value));
  } catch {
    _useFallback = true;
    _memoryStore.set(key, String(value));
  }
}

export function removeItem(key) {
  if (_useFallback) {
    _memoryStore.delete(key);
    return;
  }
  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    _useFallback = true;
    _memoryStore.delete(key);
  }
}

export function getJSON(key, fallback = null) {
  const raw = getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJSON(key, value) {
  setItem(key, JSON.stringify(value));
}
