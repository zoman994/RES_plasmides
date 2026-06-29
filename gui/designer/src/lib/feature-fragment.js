/**
 * feature-fragment.js (UX-4) — is an annotation an INCOMPLETE feature (a
 * fragment of its reference)? Renderers use this to draw it pLannotate-style
 * (white fill + coloured outline) so a truncated AmpR doesn't look like a whole
 * gene. Pure, signal-only.
 *
 * Signals (any → fragment):
 *   • explicit `fragment` / `partial` flag
 *   • a `_part_<a>-<b>` suffix in the name (the project's partial convention —
 *     see annotation-edit.basePartName / reconcileConfirmedWithPartials)
 *   • a numeric `coverage` < 0.95 (fraction of the reference feature covered)
 */
const PART_RE = /_part_\d+-\d+/;

export function isFragmentFeature(region) {
  if (!region) return false;
  if (region.fragment === true || region.partial === true) return true;
  if (typeof region.coverage === 'number' && region.coverage < 0.95) return true;
  return typeof region.name === 'string' && PART_RE.test(region.name);
}
