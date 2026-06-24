/**
 * Icon — the BodgeGene icon library (adopted from the Claude Designer
 * «BodgeGene Design System» package, 19.06.2026). Two families on one 24px
 * grid, 1.5px stroke, currentColor, round caps/joins:
 *   • chrome  — app-UI glyphs in the lucide visual language (no CDN dependency).
 *   • domain  — purpose-drawn genomics glyphs lucide doesn't cover (plasmid
 *               topology, DNA ends/overhangs, assembly operations, strands).
 *
 * Replaces scattered emoji/unicode glyphs in UI chrome (DESIGN_SYSTEM: «no emoji
 * in chrome — buttons/menus/labels use lucide icons»). `currentColor` means the
 * glyph inherits the surrounding text colour (amber on primary/active items).
 *
 * Usage: <Icon name="home" size={16} /> — unknown name renders nothing.
 */

export const ICON_GROUPS = {
  chrome: [
    'home', 'library', 'primer-pool', 'settings', 'search', 'filter', 'plus',
    'import', 'export', 'save', 'chevron-left', 'chevron-right', 'chevron-down',
    'panel-right', 'kebab', 'close', 'check', 'history', 'copy', 'trash',
    'edit', 'tag', 'eye', 'sun', 'moon', 'zoom-in', 'zoom-out', 'info', 'warning', 'star',
    // Extensions beyond the design-system package (lucide gaps the app needs):
    // folder = a .bodge PROJECT (distinct from `library` = the parts Библиотека);
    // bell = notifications.
    'folder', 'bell',
    // Emoji-sweep additions (recurring chrome glyphs with no design-system match):
    // container = a Container entity (📦); list = drafts/assemblies panel (📋);
    // swap = change-type / convert (🔄); lock = locked/manual (🔒); note = memo (📝);
    // link = stitch/join (🔗); hourglass = pending (⏳); circular/linear = topology
    // toggle shapes (◯/▭, distinct from domain `plasmid`/`fragment-linear`);
    // sort = reorder up/down (⇅).
    'container', 'list', 'swap', 'lock', 'note', 'link', 'hourglass', 'circular', 'linear', 'sort',
  ],
  domain: [
    'plasmid', 'fragment-linear', 'end-blunt', 'end-5overhang', 'end-3overhang',
    'dna', 'sequence', 'annotation', 'primer', 'restriction', 'mix', 'digest',
    'pcr', 'ligate', 'mutagenesis', 'commit', 'branch', 'strand-fwd', 'strand-rev',
  ],
};

const P = {
  // ── chrome ──
  home: <><path d="M3 10.2 12 3l9 7.2" /><path d="M5.5 9.2V20h13V9.2" /><path d="M10 20v-6h4v6" /></>,
  library: <><path d="M5 4v16" /><path d="M9.5 4v16" /><path d="m13.5 5 4.8 14.2" /><path d="M5 4h4.5" /><path d="M9.5 4h2.6" /></>,
  'primer-pool': <><path d="M9.5 3h5" /><path d="M10.5 3v6.2L5.7 18a1.6 1.6 0 0 0 1.4 2.4h9.8A1.6 1.6 0 0 0 18.3 18l-4.8-8.8V3" /><path d="M7.6 14h8.8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.1-2.9H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.1-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  filter: <path d="M4 5h16l-6.4 7.6V19l-3.2 1.6v-8L4 5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  import: <><path d="M12 3v11" /><path d="m7.5 10 4.5 4 4.5-4" /><path d="M5 20h14" /></>,
  export: <><path d="M12 14V3" /><path d="m7.5 7 4.5-4 4.5 4" /><path d="M5 20h14" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4" /><path d="M8 20v-6h8v6" /></>,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'panel-right': <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  kebab: <><circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8" /><path d="M3.5 4v4h4" /><path d="M12 8v4.5l3 1.8" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  edit: <><path d="M14 5.5 18.5 10 8 20.5 3.5 21 4 16.5 14 5.5Z" /><path d="M12.5 7 17 11.5" /></>,
  tag: <><path d="M3 11V4h7l10 10-7 7L3 11Z" /><circle cx="7.5" cy="7.5" r="1.4" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M4 12H1.5M22.5 12H20M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  'zoom-in': <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8.5v5M8.5 11h5" /></>,
  'zoom-out': <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8.5 11h5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r="0.6" fill="currentColor" stroke="none" /></>,
  warning: <><path d="M12 3 22 20H2L12 3Z" /><path d="M12 9v5" /><circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.65l5.9-.85z" />,
  // folder = a .bodge PROJECT (lucide folder; distinct from `library`).
  folder: <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.4a1.5 1.5 0 0 1 1.06.44L11 7.5a1.5 1.5 0 0 0 1.06.44h6.44A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />,
  // bell = notifications (lucide bell).
  bell: <><path d="M6 8.5a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 14.5 6 8.5Z" /><path d="M10.2 20a2 2 0 0 0 3.6 0" /></>,
  // container = a Container entity (lucide package / box).
  container: <><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>,
  // list = drafts / assemblies panel (lucide list).
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  // swap = change-type / convert (lucide repeat).
  swap: <><path d="M4 11a8 8 0 0 1 13.7-5.6L20 8" /><path d="M20 4v4h-4" /><path d="M20 13a8 8 0 0 1-13.7 5.6L4 16" /><path d="M4 20v-4h4" /></>,
  // lock = locked / manual (lucide lock).
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  // note = memo / note (lucide file-text).
  note: <><path d="M6 3h9l4 4v14H6Z" /><path d="M15 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  // link = stitch / join (lucide link).
  link: <><path d="M9.5 14.5 14.5 9.5" /><path d="M11 6.5 12.5 5a4 4 0 0 1 5.7 5.7l-1.5 1.5" /><path d="M13 17.5 11.5 19a4 4 0 0 1-5.7-5.7l1.5-1.5" /></>,
  // hourglass = pending (lucide hourglass).
  hourglass: <><path d="M7 3h10M7 21h10" /><path d="M7 3c0 4 4 5 5 8.5C13 8 17 7 17 3" /><path d="M7 21c0-4 4-5 5-8.5C13 16 17 17 17 21" /></>,
  // circular = circular-topology toggle shape (plain ring; cf. domain `plasmid`).
  circular: <circle cx="12" cy="12" r="8.5" />,
  // linear = linear-topology toggle shape (plain rounded bar).
  linear: <rect x="3" y="9" width="18" height="6" rx="2" />,
  // sort = reorder up/down (lucide arrow-up-down).
  sort: <><path d="M8 4v16" /><path d="m5 7 3-3 3 3" /><path d="M16 20V4" /><path d="m13 17 3 3 3-3" /></>,

  // ── domain (genomics) ──
  // plasmid: circular construct — ring with an origin tick + clockwise arrow.
  plasmid: <><circle cx="12" cy="12" r="8.2" /><path d="M12 3.8v3" /><path d="M18.6 8.4a8.2 8.2 0 0 1 1 4.3" /><path d="m17.8 6.6 1 1.9 2-0.6" /></>,
  // fragment-linear: a strand with two explicit ends.
  'fragment-linear': <><path d="M4 12h16" /><path d="M4 8.5v7" /><path d="M20 8.5v7" /></>,
  // end-blunt: two strands paired to a flush vertical edge (blunt cut).
  'end-blunt': <><path d="M4 9.5h11" /><path d="M4 14.5h11" /><path d="M15 8.5v7" /><path d="M7 9.5v5M11 9.5v5" /></>,
  // end-5overhang: paired region (rungs) + single-stranded TOP overhang (5').
  'end-5overhang': <><path d="M4 9.5h15" /><path d="M4 14.5h9" /><path d="M7 9.5v5M10 9.5v5" /></>,
  // end-3overhang: paired region (rungs) + single-stranded BOTTOM overhang (3').
  'end-3overhang': <><path d="M4 9.5h9" /><path d="M4 14.5h15" /><path d="M7 9.5v5M10 9.5v5" /></>,
  // dna: double helix — two crossing rails with rungs.
  dna: <><path d="M7 3c0 4.5 10 5 10 9s-10 4.5-10 9" /><path d="M17 3c0 4.5-10 5-10 9s10 4.5 10 9" /><path d="M8.8 6h6.4M8 9h8M8 15h8M8.8 18h6.4" /></>,
  // sequence: stacked rows of base ticks (mono reading).
  sequence: <><path d="M4 7.5h7M14 7.5h6" /><path d="M4 12h5M12 12h8" /><path d="M4 16.5h9M16 16.5h4" /></>,
  // annotation: a feature bar pinned over the strand.
  annotation: <><path d="M3 17h18" /><rect x="6" y="6" width="9" height="5" rx="1" /><path d="M10.5 11v6" /></>,
  // primer: short oligo with a 3' arrowhead and a tail.
  primer: <><path d="M4 12h11" /><path d="m12 8.5 4 3.5-4 3.5" /><path d="M4 9.5v5" /></>,
  // restriction: a cut between two strands (scissors mark + site).
  restriction: <><path d="M4 9h16M4 15h16" /><path d="M12 4v5M12 15v5" /><path d="m10.5 5.5 3 3M13.5 5.5l-3 3" /></>,
  // mix / assembly: two inputs combine into one (combine).
  mix: <><rect x="2.5" y="3" width="8" height="8" rx="1.5" /><path d="M14 10V6a2 2 0 0 0-2-2h-1.5" /><circle cx="17.5" cy="17.5" r="4" /><path d="M14 21h-1.5a2 2 0 0 1-2-2v-1.5" /></>,
  // digest: scissors.
  digest: <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M20 4 8.2 15.8M14.5 12.5 20 20M8.2 8.2 11.8 11.8" /></>,
  // pcr: exponential amplify — two paired arrows.
  pcr: <><path d="M4 9h11" /><path d="m12 6 3 3-3 3" /><path d="M20 15H9" /><path d="m12 12-3 3 3 3" /></>,
  // ligate: two ends joined at a seam by converging arrows.
  ligate: <><path d="M12 5v14" /><path d="m6 9 3.5 3L6 15" /><path d="m18 9-3.5 3 3.5 3" /></>,
  // mutagenesis (KLD): circular edit — refresh arrows with an edit dot.
  mutagenesis: <><path d="M19 9A8 8 0 1 0 20 14" /><path d="M20 4v5h-5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  // commit: a node on the history line.
  commit: <><circle cx="12" cy="12" r="3.2" /><path d="M3 12h5.8M15.2 12H21" /></>,
  // branch: variant branching (git-branch).
  branch: <><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="6" r="2.4" /><path d="M6 8.4v7.2" /><path d="M15.6 6.2A9 9 0 0 1 7.6 17" /></>,
  // strand-fwd / strand-rev: directional reading arrows.
  'strand-fwd': <><path d="M4 12h13" /><path d="m13 8 4 4-4 4" /></>,
  'strand-rev': <><path d="M20 12H7" /><path d="m11 8-4 4 4 4" /></>,
};

// Filled silhouettes for active/selected states (active nav item, pinned star,
// selected construct). Rendered with fill=currentColor, stroke=none. Names not
// present here fall back to the outline glyph when `filled` is requested.
const PF = {
  home: <path d="M12 2.6 3.3 9.6A1.6 1.6 0 0 0 3 10.6V19a2 2 0 0 0 2 2h4v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6h4a2 2 0 0 0 2-2v-8.4a1.6 1.6 0 0 0-.6-1.2z" />,
  library: <path d="M4.5 4h2.6v16H4.5zM8.2 4h2.6v16H8.2zM12.4 4.6l2.5-.7 4.3 15.5-2.5.7z" />,
  'primer-pool': <path d="M9 3h6v1.4h-1.2v4.4l4.8 8.8A1.8 1.8 0 0 1 17 20.4H7A1.8 1.8 0 0 1 5.4 17.6l4.8-8.8V4.4H9z" />,
  tag: <path d="M3 11.4V4a1 1 0 0 1 1-1h7.4l9.3 9.3a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0L3 11.4zM7.3 6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.65l5.9-.85z" />,
  plasmid: <path d="M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zm0 4.4a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z" />,
  eye: <path d="M12 5.5C6 5.5 2.5 12 2.5 12S6 18.5 12 18.5 21.5 12 21.5 12 18 5.5 12 5.5zm0 3.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />,
  check: <path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm4.7 6.6-5.7 5.7a1 1 0 0 1-1.4 0l-2.8-2.8 1.4-1.4 2.1 2.1 5-5z" />,
};

export function Icon({
  name, size = 16, strokeWidth = 1.5, filled = false, style = {}, title, ...rest
}) {
  const useFill = filled && PF[name];
  const body = useFill ? PF[name] : P[name];
  if (!body) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={useFill ? 'currentColor' : 'none'}
      stroke={useFill ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flex: 'none', ...style }}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}

export default Icon;
