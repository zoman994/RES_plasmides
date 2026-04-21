import { FEATURE_COLORS, isMarker } from '../../theme';

// Standard palette from design system
export const BASE_PALETTE = [
  '#56B4E9', '#009E73', '#D55E00', '#E69F00', '#F0E442',
  '#CC79A7', '#0072B2', '#999999', '#661100', '#AA4499',
  '#6929c4', '#1192e8', '#005d5d', '#9f1853', '#fa4d56',
  '#198038', '#002d9c', '#b28600',
];

export const USER_COLORS_KEY = 'pvcs-user-palette';

export function loadUserColors() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_COLORS_KEY) || '[]');
    return raw.filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
  } catch { return []; }
}

export function saveUserColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const c = hex.toUpperCase();
  if (BASE_PALETTE.some(p => p.toUpperCase() === c)) return;
  const arr = loadUserColors();
  if (arr.some(p => p.toUpperCase() === c)) return;
  arr.push(hex);
  if (arr.length > 12) arr.shift();
  localStorage.setItem(USER_COLORS_KEY, JSON.stringify(arr));
}

export function replaceUserColor(idx, hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const arr = loadUserColors();
  if (idx < 0 || idx >= arr.length) return;
  arr[idx] = hex;
  localStorage.setItem(USER_COLORS_KEY, JSON.stringify(arr));
}

export function getFragColorDefault(frag) {
  return isMarker(frag.name) ? '#F0E442' : (FEATURE_COLORS[frag.type] || '#56B4E9');
}
