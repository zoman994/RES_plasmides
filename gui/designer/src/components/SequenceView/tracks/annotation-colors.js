/**
 * AnnotationTrack colour helpers — extracted from AnnotationTrack.jsx
 * (decomp P1, size-budget; bodies byte-for-byte unchanged).
 */

export function ensureColor(color) {
  if (typeof color === "string" && color.startsWith("#")) return color;
  return "#9ca3af"; // misc_feature fallback
}

/**
 * Darken a `#rrggbb` colour by mixing it toward black at `ratio`
 * (0 = unchanged, 1 = black). Used on the annotation rect so feature
 * colours read as muted "tonal cards" against the dark-theme
 * background instead of glaring saturated bars. Biolog visual review
 * 03.05.2026 evening: исходные цвета палитры (выбраны под светлую
 * тему) на тёмной теме выглядели слишком светлыми; первая попытка
 * lighten(+30 %) сделала их ещё светлее — биолог: «давай мы сделаем
 * так чтобы сами фичи были на пол тона тон темнее, они слишком
 * светлые для темной темы». Текущее значение 0.25 = ~четверть тона
 * к чёрному.
 */
export function darkenColor(hex, ratio) {
  if (typeof hex !== "string" || hex.length !== 7 || hex[0] !== "#") return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  const dr = Math.round(r * (1 - ratio));
  const dg = Math.round(g * (1 - ratio));
  const db = Math.round(b * (1 - ratio));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}
