/**
 * searchUiContract — K1.0 shared contract for the Search UI primitives
 * (SearchField / SearchResultsListbox / useSearchComboboxNavigation /
 * SearchCombobox / SearchFilterChips).
 *
 * UI-ONLY. This module — and every file under components/Search — imports
 * nothing from the store, the query parser, search profiles, the search
 * facade, workers, document adapters, or biological databases. It is pure
 * presentation plumbing; the surface controller (K4+) wires it to data.
 *
 * Ownership (fixed here so K1.1–K1.5 don't each re-derive it):
 *   • the common combobox owns TRANSIENT UI state only — `open`, `activeKey`,
 *     `isComposing`, keyboard/focus.
 *   • the surface controller owns `query` / `QueryPlan` / filters / chips /
 *     `SearchSession`.
 *
 * The active result is tracked by a STABLE entity key (`getOptionKey(item)`),
 * never by array index: a partial→final result swap may reorder items, and an
 * index would then point at the wrong entity — or dangle when the entity leaves
 * the list. `resolveActiveIndex` derives the render index from the key on every
 * render, so the active entity is preserved and `aria-activedescendant` never
 * references a missing option.
 *
 * @typedef {Object} SearchOptionState
 * @property {boolean} active   — this option is the active (aria-selected) one.
 * @property {number}  index    — its current render index.
 *
 * @callback RenderOption
 * @param {*} item                    — one item from the items array.
 * @param {SearchOptionState} state   — { active, index }.
 * @returns {import('react').ReactNode} NON-interactive content only (no
 *          button/a/input/nested role="option"); the listbox owns the option.
 *
 * @callback GetOptionKey
 * @param {*} item
 * @param {number} index
 * @returns {string} a stable identity for the item across reorders.
 */

/**
 * The DOM id for the option with stable key `optionKey` within listbox
 * `listboxId`. This is the SINGLE shared formula: SearchResultsListbox stamps it
 * onto each `<li id>` (from its option key), and SearchCombobox uses it to
 * compute `aria-activedescendant` (from the ACTIVE key) — so the two can never
 * disagree. Keyed by the stable entity key, NOT the array index: the id follows
 * the entity through a partial→final reorder, so aria-activedescendant never
 * dangles or silently points at a different row after results churn.
 *
 * The key is INJECTIVELY encoded (encodeURIComponent): distinct keys always
 * yield distinct ids — `"My Enzyme"` and `"My_Enzyme"` do NOT collide, and the
 * result never contains whitespace (invalid in a DOM id). getElementById /
 * attribute equality match the encoded string exactly.
 *
 * @param {string} listboxId
 * @param {string|number} optionKey
 * @returns {string}
 */
export function optionDomId(listboxId, optionKey) {
  return `${listboxId}-opt-${encodeURIComponent(String(optionKey))}`;
}

/**
 * Default key extractor: require an explicit stable identity that is
 * KIND-QUALIFIED whenever the item carries a kind. Order:
 *   1. `entityKey` (already `<kind>:<id>`),
 *   2. `${kind}:${id}` derived when both are present — so a bare `id` shared
 *      across kinds (entry `5` vs primer `5`) never collapses to one key,
 *   3. `key`,
 *   4. bare `id` (only for kind-less items, e.g. a mode option).
 * FAIL-CLOSED: throws when none is present — it never falls back to the array
 * index, because a positional key would silently re-target selection to a
 * different entity after a partial→final reorder.
 *
 * @type {GetOptionKey}
 */
export function defaultGetOptionKey(item) {
  if (item != null) {
    if (item.entityKey != null) return item.entityKey;
    if (item.kind != null && item.id != null) return `${item.kind}:${item.id}`;
    if (item.key != null) return item.key;
    if (item.id != null) return item.id;
  }
  throw new Error(
    'SearchResults: every item requires a stable identity (entityKey, kind+id, '
    + 'key, or id). No positional fallback — it would mis-target selection after '
    + 'a reorder.',
  );
}

/**
 * Fail-closed uniqueness guard: throws if two items resolve to the same key.
 * This catches an ambiguous result set (e.g. two kind-less items sharing a bare
 * id) BEFORE it can give two entities the same React key / DOM id / activeKey —
 * which would make keyboard navigation unable to tell them apart.
 *
 * @param {Array} items
 * @param {GetOptionKey} [getOptionKey]
 */
export function assertUniqueOptionKeys(items, getOptionKey = defaultGetOptionKey) {
  const seen = new Set();
  (items || []).forEach((item, i) => {
    const key = getOptionKey(item, i);
    if (seen.has(key)) {
      throw new Error(
        `SearchResults: duplicate option key "${key}" — result identities must be `
        + 'unique. Supply a kind-qualified entityKey (<kind>:<id>).',
      );
    }
    seen.add(key);
  });
}

/**
 * True only for a string with non-whitespace content. Used to fail closed on
 * accessible labels: a whitespace-only aria-label is effectively no label.
 *
 * @param {*} s
 * @returns {boolean}
 */
export function hasText(s) {
  return typeof s === 'string' && s.trim() !== '';
}

/**
 * Resolve the array index of the currently-active entity by its stable key.
 * Returns -1 when there is no active key, when `items` is not an array, or when
 * the active entity has left the list (removed, or dropped by a partial→final
 * swap). Callers emit `aria-activedescendant` only for index >= 0, so a stale
 * key never produces a dangling reference.
 *
 * @param {Array} items
 * @param {?string} activeKey
 * @param {GetOptionKey} [getOptionKey]
 * @returns {number}
 */
export function resolveActiveIndex(items, activeKey, getOptionKey = defaultGetOptionKey) {
  if (activeKey == null || !Array.isArray(items)) return -1;
  for (let i = 0; i < items.length; i += 1) {
    if (getOptionKey(items[i], i) === activeKey) return i;
  }
  return -1;
}
