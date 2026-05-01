/**
 * STRINGS — Centralized UI text dictionary for BodgeGene.
 *
 * Pattern: a plain JS namespace dictionary. Components import the named
 * `STRINGS` export and reference text via `STRINGS.<namespace>.<key>` instead
 * of inline literals.
 *
 *   import { STRINGS } from '../lib/strings';
 *   <button>{STRINGS.startScreen.newProject}</button>
 *
 * Why this and not i18next? In v0.6 the surface is small and English-only.
 * A dictionary gives us a single source of truth without runtime locale
 * switching, providers, or lazy bundles. When real localization becomes
 * necessary, migration to `react-i18next` is a one-pass swap of accessors
 * (`STRINGS.x.y` → `t('x.y')`) — components do not change shape.
 *
 * Conventions:
 *   - Keys are camelCase, grouped per component or domain.
 *   - Strings with runtime values are functions returning the final text:
 *       projectDeleted: (name) => `Project "${name}" deleted`
 *     This mirrors the `t(key, params)` shape of i18next so the call sites
 *     do not need to change at migration time.
 *   - Dev-only text (throws, console.error/warn) is NOT in STRINGS — it stays
 *     as English literals at the call site. STRINGS is for user-facing UI.
 *
 * @typedef {Object} StartScreenStrings
 * @typedef {Object} TopbarStrings
 * @typedef {Object} ProjectInfoStrings
 * @typedef {Object} SettingsStrings
 * @typedef {Object} ToastStrings
 * @typedef {Object} PwaStrings
 * @typedef {Object} MultiTabLockStrings
 * @typedef {Object} HotkeysStrings
 * @typedef {Object} PlaceholderStrings
 * @typedef {Object} CommonStrings
 *
 * @typedef {{
 *   startScreen: StartScreenStrings,
 *   topbar: TopbarStrings,
 *   projectInfo: ProjectInfoStrings,
 *   settings: SettingsStrings,
 *   toast: ToastStrings,
 *   pwa: PwaStrings,
 *   multiTabLock: MultiTabLockStrings,
 *   hotkeys: HotkeysStrings,
 *   placeholder: PlaceholderStrings,
 *   common: CommonStrings,
 * }} StringsDictionary
 */

/** @type {StringsDictionary} */
export const STRINGS = {
  startScreen: {},
  topbar: {},
  projectInfo: {},
  settings: {},
  toast: {},
  pwa: {},
  multiTabLock: {},
  hotkeys: {},
  placeholder: {},
  common: {},
};
