/**
 * RangePickerModal — M-CANVAS-WORKFLOW-UX K5 (SPEC §3.1.A step 2).
 *
 * After a plasmid is picked (inline EmptyAssemblyLibrary OR drag from
 * sidebar) the biolog confirms the slice on a near-fullscreen
 * SequenceTab. Игорь 20.05.2026: «все сиквенс виверы должны быть
 * идентичными по функционалу» — this modal embeds the SAME SequenceTab
 * the Library inspector and Container editor use, with the SAME
 * controlled selection state (caretPos / caretAnchor / strand / mode)
 * and the SAME restriction-site visibility (showReSites store flag).
 *
 * Cursor selection: SequenceView treats caretPos / caretAnchor as
 * fully controlled — without them the SelectionOverlay can't render
 * the highlight rect. Click on annotation / drag-select / Shift-click
 * all route through onCaretChange + onSelectRange below.
 *
 * RE sites: show whenever the global `showReSites` flag is on (default
 * for skeleton-editor mode). Clicking a site here SNAPS start/end onto
 * the recognition coordinates instead of opening the full cut popover
 * (the user wants to USE that range as a fragment, not to actually cut
 * the source plasmid).
 *
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useMemo, useState } from 'react';
import SequenceTab from '../../../Library/inspector/tabs/SequenceTab';
import { useStore } from '../../../../store';
import { selectAllEnzymeSets, selectMergedREEnzymes } from '../../../../store/customEnzymesSlice';
import { resolveEnzymeSet } from '../../../../lib/custom-enzymes';
import { RE_ENZYMES, scanAllSites } from '../../../../restriction-db';
import { useSequenceSelection } from '../../../../hooks/useSequenceSelection';
import { toUiCoords, fromUiCoords } from '../../../../lib/annotation-edit';
import { stickyEndExtent, segmentOverhangs } from '../../lib/segment-overhangs';
import { auditReSites } from '../../lib/re-site-audit';
import { suggestEnzymesForNextFragment } from '../../lib/restriction-cloning';
import { fragmentRanges } from '../../lib/digest-fragments';
import DigestFragmentPicker from './DigestFragmentPicker';
import PlasmidMapV2 from '../../../PlasmidMapV2';
import LinearMapV2 from '../../../LinearMapV2';

// WT-UX-14 — Tm readout is meaningful only for primer-sized oligos. Above
// this length the selection is a fragment, and a «Tm 77°» on it misleads
// (biolog may read it as «anneals fine»). Gate the Tm prop by selection len.
const PRIMER_MAX_LEN = 60;

// WT-UX-15 — name the way the range was SELECTED, not «метод» (which reads as
// the acquisition method: PCR / restriction). The acquisition method itself
// stays deferred (correct model); only the label was confusing.
const SELECTION_METHOD_LABELS = {
  cursor: 'курсором',
  feature: 'по фиче',
  numeric: 'по координатам',
  restriction: 'по RE-сайтам',
};

function featureLabel(a, idx) {
  const base = a && (a.label || a.name || a.type) ? (a.label || a.name || a.type) : `feature ${idx + 1}`;
  const s = Number.isFinite(a && a.start) ? a.start : 0;
  const e = Number.isFinite(a && a.end) ? a.end : 0;
  // V127 — 1-based inclusive display (⚓ DEC-ANN-10): coords are stored
  // 0-based half-open; biolog reads start+1..end.
  const { uiStart, uiEnd } = toUiCoords(s, e);
  return `${base} (${uiStart}-${uiEnd})`;
}

export default function RangePickerModal({ source, onConfirm, onCancel, priorEnzymes = [] }) {
  const seq = (source && source.sequence) || '';
  const annotations = (source && source.annotations) || [];
  const [rc, setRc] = useState(false);
  // #2 (invert) — take the COMPLEMENT arc of a circular source (the backbone).
  const [invert, setInvert] = useState(false);
  // #5 — digest «gel» fragment picker (open when >2 cut sites).
  const [digestOpen, setDigestOpen] = useState(false);
  // #3 — switch the picker between the sequence editor and a visual map.
  const [viewMode, setViewMode] = useState('sequence');
  // RS-LIN3 (Игорь 22.06: «линейная — когда сам входной фрагмент линейный … хотя
  // линейная колбаска тоже неплохо в добавок») — circular vs linear map shape. A
  // linear source defaults to (and stays) linear (a circle would misrepresent it);
  // a circular source defaults to circular but can toggle to the linear «колбаска».
  const sourceCircular = !!(source && source.circular);
  const [mapShape, setMapShape] = useState(sourceCircular ? 'circular' : 'linear');
  // Визуал tab — the feature picked by clicking its arc on the map (highlights it).
  const [visualRegionId, setVisualRegionId] = useState(null);
  const [reHighlightKey, setReHighlightKey] = useState(null);
  // V89-extra — feature/numeric override the hook's cursor/restriction
  // acquisitionMethod label (cosmetic in the hint; downstream branches
  // only on 'restriction'). null → use hook's value.
  const [methodOverride, setMethodOverride] = useState(null);
  // V157 — RE-pair enzymes/cut sites, fed into the piece's acquisitionParams
  // on confirm so the 'restriction' piece passes the non-empty-params invariant.
  const [reParams, setReParams] = useState(null);
  // RS-A1 — enzymes chosen from the dropdown (independent of clicking sites). When
  // non-empty these DRIVE the digest: the primary action routes to the gel so the
  // biolog picks a band. Sourced from enzyme sets + the merged enzyme dict (custom
  // enzymes RS-C1/C2 included).
  const [pickedEnzymes, setPickedEnzymes] = useState([]);
  // RS-A1-fix (Игорь 22.06): picking a SET must VISUALISE its enzymes' sites — NOT
  // digest with all 172 at once (that yields a 1078-fragment «простыня»). A набор
  // sets `visSet` (a map visibility filter, one chip); only INDIVIDUAL enzymes go
  // into `pickedEnzymes` (the real 1–2-enzyme digest). { id, name, enzymes } | null.
  const [visSet, setVisSet] = useState(null);
  // RS-PICK2 — type-to-add enzyme search (Игорь 22.06: «написал BamHI — выбираю»).
  const [enzymeSearch, setEnzymeSearch] = useState('');
  // Focusing the empty search drops the unique-cutters list straight away (Игорь
  // 22.06: «сразу должен выпадать список уникальных сайтов для ЭТОЙ последовательности»).
  const [searchFocused, setSearchFocused] = useState(false);
  // Subscribe to the raw slices (stable refs) and derive in useMemo — calling the
  // array-returning selectAllEnzymeSets directly through useStore would loop.
  const customSets = useStore((s) => s.customEnzymes && s.customEnzymes.sets);
  const customById = useStore((s) => s.customEnzymes && s.customEnzymes.byId);
  const mergedEnzymes = useMemo(
    () => selectMergedREEnzymes({ customEnzymes: { byId: customById || {} } }),
    [customById],
  );
  const enzymeSets = useMemo(
    () => selectAllEnzymeSets({ customEnzymes: { sets: customSets || {} } }),
    [customSets],
  );
  const enzymeNames = useMemo(() => Object.keys(mergedEnzymes).sort((a, b) => a.localeCompare(b)), [mergedEnzymes]);
  // RS-PICK1 (Игорь 22.06: «базово — уникальные сайты»): the enzymes that cut the
  // plasmid EXACTLY ONCE — the cloning-useful ones, WITH their cut position so the
  // search can list them along the molecule. The map shows these by default
  // (instead of all 461 → каша), a набор narrows to its unique cutters, and an
  // individual digest enzyme shows all its sites. One scan, derived two ways.
  const uniqueSites = useMemo(() => {
    if (!seq) return [];
    return scanAllSites(seq, { circular: !!(source && source.circular) })
      .filter((s) => s.isUnique)
      .map((s) => ({ enzyme: s.enzyme, site: s.site, pos: (s.positions && s.positions[0] && s.positions[0].position) || 0 }))
      .sort((a, b) => a.pos - b.pos);
  }, [seq, source]);
  const uniqueEnzymes = useMemo(() => uniqueSites.map((u) => u.enzyme), [uniqueSites]);

  // SPEC_VIEWER_UNIFICATION — controlled selection + V88 RE pair-select
  // + drag-grace all come from the shared hook now. start/end derive
  // from the hook's selStart/selEnd.
  const sel = useSequenceSelection({
    initialCaret: 0,
    reBehavior: 'pair-select',
    reEnzymes: RE_ENZYMES,
    onPairCommit: ({
      firstEnzyme, firstPosition, secondEnzyme, secondPosition,
    }) => {
      setReHighlightKey(`${firstEnzyme}-${firstPosition}|${secondEnzyme}-${secondPosition}`);
      setReParams({
        enzymes: [firstEnzyme, secondEnzyme],
        cutSites: [{ position: firstPosition }, { position: secondPosition }],
      });
      setMethodOverride(null); // hook sets acquisitionMethod='restriction'
    },
    // A NEW selection/caret resets the backbone-invert toggle — you select the
    // next piece fresh, then press «Инвертировать» again (Игорь 23.06).
    onAfterSelect: () => { setReHighlightKey(null); setReParams(null); setMethodOverride(null); setInvert(false); },
    onAfterCaret: () => { setReHighlightKey(null); setReParams(null); setMethodOverride(null); setInvert(false); },
  });
  const { firstRESite } = sel;
  // Picker semantics: anchor = start, pos = end (every selection path
  // sets anchor ≤ pos; numeric inputs may set anchor > pos transiently,
  // so read RAW, not min/max — preserves the biolog's typed intent).
  const start = Number.isFinite(sel.caretAnchor) ? sel.caretAnchor : 0;
  const end = Number.isFinite(sel.caretPos) ? sel.caretPos : seq.length;
  const acquisitionMethod = methodOverride || sel.acquisitionMethod;

  // V159 — for an RE-pair, the protruding-strand overhang (5′ right / 3′ left)
  // sits just past a top cut, so the out-of-range mask would dim it («в тени»)
  // even though it is the fragment's sticky end. Extend the MASK to the duplex
  // extent so the overhang reads as part of the fragment. The CONFIRMED range
  // (below) stays at the top cuts — that convention keeps each shared overhang
  // counted once when adjacent RE fragments concatenate (extending the slice
  // would duplicate the overhang at every ligation junction).
  const reAcquisition = acquisitionMethod === 'restriction' && reParams;
  const maskRange = reAcquisition
    ? stickyEndExtent({ start, end, acquisitionParams: reParams, reEnzymes: RE_ENZYMES, seqLen: seq.length })
    // Forward [lo,hi] so the mask renders for a bottom-up (anchor>pos) drag too.
    : { start: Math.min(Number(start), Number(end)), end: Math.max(Number(start), Number(end)) };
  const reInfo = reAcquisition
    ? segmentOverhangs({ acquisitionMethod: 'restriction', acquisitionParams: reParams }, RE_ENZYMES)
    : null;
  // #3 (visual-acceptance) — uniqueness check: do the chosen RE(s) cut only at
  // the fragment ends, or elsewhere in the plasmid too? Extra sites → the
  // digest yields >2 pieces and the fragment is ambiguous.
  const reAudit = reAcquisition
    ? auditReSites(seq, reParams.enzymes, !!(source && source.circular))
    : null;
  // #5 — offer the digest «gel» fragment picker when the fragment is ambiguous.
  // RS-A1 — enzymes chosen from the dropdown take precedence over a click pair /
  // single click as the digest definition.
  const pickedActive = pickedEnzymes.length > 0;
  const digestEnzymes = pickedActive
    ? pickedEnzymes
    : (reParams ? reParams.enzymes : (firstRESite ? [firstRESite.enzyme] : null));
  const digestAudit = digestEnzymes
    ? auditReSites(seq, digestEnzymes, !!(source && source.circular)) : null;
  const cutCount = digestAudit ? digestAudit.total : 0;
  // A single clicked RE site is only directly usable when that enzyme is a
  // UNIQUE cutter (1 cut → linearize the whole plasmid). If it cuts ≥2× the
  // molecule breaks into ≥2 pieces, so a single click is ambiguous — the biolog
  // MUST pick the band off the gel (Игорь 21.06: «режется только по 1 сайту,
  // а их там три — игнорирует»). Linearizing a multi-cutter is biologically wrong.
  const singleEnzymePending = !!(firstRESite && !reParams && !pickedActive);
  const singleLinearizable = singleEnzymePending && cutCount === 1;
  const singleNeedsGel = singleEnzymePending && cutCount >= 2;
  // A pair excision is ambiguous when a chosen enzyme also cuts elsewhere (>2 total).
  const pairAmbiguous = !pickedActive && !!reParams && cutCount > 2;
  // RS-A1 — dropdown-picked enzymes: the biolog hasn't said WHICH fragment, so the
  // primary action always opens the gel (≥1 cut) to pick a band.
  const pickedNeedsGel = pickedActive && cutCount >= 1;
  const offerDigest = singleNeedsGel || pairAmbiguous || pickedNeedsGel;

  // The набор's UNIQUE cutters on this plasmid (its visualisation contribution).
  const visSetUnique = useMemo(() => {
    if (!visSet) return [];
    const uniq = new Set(uniqueEnzymes);
    return visSet.enzymes.filter((n) => uniq.has(n));
  }, [visSet, uniqueEnzymes]);
  // RS-PICK1 — which enzymes' sites the Визуал map + Сиквенс show (and make
  // clickable). A набор (visualisation) and picked enzymes (digest) COEXIST (Игорь
  // 22.06: «набор сбрасывается после выбора рестриктаз из поиска» — не должен), so
  // the filter is their UNION: набор's unique cutters + each picked enzyme's sites.
  //   default (neither) → all UNIQUE cutters («базово уникальные сайты»).
  const mapEnzymeFilter = useMemo(() => {
    const out = new Set(visSetUnique);
    if (pickedActive) digestEnzymes.forEach((n) => out.add(n));
    if (!visSet && !pickedActive) uniqueEnzymes.forEach((n) => out.add(n));
    return [...out];
  }, [pickedActive, digestEnzymes, visSet, visSetUnique, uniqueEnzymes]);

  // Default selection = whole source [0, seq.length] so a confirm with
  // no manual selection inserts the full-length fragment (hook inits
  // caret to 0; we extend pos to the end on mount / source change).
  useEffect(() => {
    sel.setCaretAnchor(0);
    sel.setCaretPos(seq.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq.length]);

  // Ensure RE sites are visible inside the modal (the Container editor
  // does the same on mount). Don't restore on unmount — biolog toggle
  // через panel должен переживать close.
  useEffect(() => {
    const st = useStore.getState();
    if (st.showReSites === undefined || st.showReSites === false) {
      useStore.setState({ showReSites: true });
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const onPickFeature = (e) => {
    const v = e.target.value;
    if (v === '') return;
    const a = annotations[Number(v)];
    if (!a) return;
    const s = Number(a.start) || 0;
    const en = Number(a.end) || 0;
    sel.setCaretAnchor(s);
    sel.setCaretPos(en);
    sel.setSelectionMode('dna');
    setReHighlightKey(null);
    sel.clearFirstRESite?.(); // A30 — a feature pick cancels a pending first-RE click
    setReParams(null);
    setMethodOverride('feature');
  };

  // RS-A1 — add enzyme(s) to the dropdown-picked digest set (de-duped). Picking
  // from the dropdown supersedes a pending click selection (A30).
  const addEnzymesToPick = (names) => {
    setPickedEnzymes((prev) => {
      const merged = new Set(prev);
      for (const n of names) if (mergedEnzymes[n]) merged.add(n);
      return Array.from(merged);
    });
    sel.clearFirstRESite?.();
    setReParams(null);
    setReHighlightKey(null);
    setMethodOverride(null);
  };
  const removePickedEnzyme = (name) => setPickedEnzymes((prev) => prev.filter((n) => n !== name));
  const removeVisSet = () => setVisSet(null);

  // RS-PICK2 + live-фидбек (Игорь 22.06). Search-as-you-type over ENZYMES ONLY
  // (наборы live in their own selector now — «он не должен быть в поиске»):
  //   • empty query (field focused) → the UNIQUE cutters for THIS sequence, along
  //     the molecule («сразу должен выпадать список уникальных сайтов»);
  //   • typed query → ANY enzyme by name (even a multi-cutter you want to add).
  const suggestions = useMemo(() => {
    const q = enzymeSearch.trim().toUpperCase();
    // Picked enzymes are NOT excluded — they stay in the list with a checked box
    // so you can tick several at once (Игорь 22.06 «сразу галки ставить»).
    if (!q) {
      return uniqueSites
        .slice(0, 30)
        .map((u) => ({ key: `enz:${u.enzyme}`, type: 'enz', name: u.enzyme, label: `${u.enzyme} · ${u.site} · ${u.pos + 1} (уникальный)` }));
    }
    const out = [];
    for (const n of enzymeNames) {
      if (out.length >= 20) break;
      if (n.toUpperCase().includes(q)) {
        out.push({ key: `enz:${n}`, type: 'enz', name: n, label: `${n} · ${mergedEnzymes[n].site}` });
      }
    }
    return out;
  }, [enzymeSearch, uniqueSites, enzymeNames, mergedEnzymes]);
  // Checkbox toggle — multi-select without closing the dropdown. Ticking an enzyme
  // adds it to the digest; unticking removes it. The набор (visualisation) is left
  // UNTOUCHED — they coexist (Игорь 22.06).
  const toggleEnzyme = (name) => {
    if (pickedEnzymes.includes(name)) {
      removePickedEnzyme(name);
    } else {
      addEnzymesToPick([name]);
    }
  };
  // Enter on a TYPED query commits the first match + clears the box (набор kept).
  const onPickSuggestion = (s) => {
    addEnzymesToPick([s.name]);
    setEnzymeSearch('');
  };

  // The separate «набор (визуализация)» selector — a набор is VISUALISATION (its
  // sites on the map/sequence), never a 172-enzyme digest. Picked digest enzymes
  // are kept (they coexist with the набор — Игорь 22.06).
  const onPickVisSet = (e) => {
    const id = e.target.value;
    if (!id) { setVisSet(null); return; }
    const s = enzymeSets.find((x) => x.id === id);
    if (!s) return;
    setVisSet({ id: s.id, name: s.name, enzymes: resolveEnzymeSet(s, mergedEnzymes) });
  };

  // Визуал tab — clicking a feature ARC sets the range to that feature (same as
  // the dropdown, but directly on the map). Игорь 21.06: «выбор фичи не работает
  // на визуальном отображении».
  const onPickFeatureFromMap = (f) => {
    if (!f || !Number.isFinite(f.start) || !Number.isFinite(f.end)) return;
    sel.setCaretAnchor(f.start);
    sel.setCaretPos(f.end);
    sel.setSelectionMode('dna');
    setReHighlightKey(null);
    sel.clearFirstRESite?.();
    setReParams(null);
    setMethodOverride('feature');
    setVisualRegionId(f.id != null ? f.id : null);
  };

  // Визуал tab — clicking an RE site on the map marks the CUT (same as clicking it
  // in the sequence): a first click stores the site, a second commits the pair.
  // The marker carries the RECOGNITION position; the top-strand cut is recog+cut[0]
  // (V155 convention), so convert before feeding the hook (Игорь 22.06).
  const onPickReSiteFromMap = (marker) => {
    if (!marker || !marker.enzyme) return;
    const recog = (marker.positions && marker.positions[0]) || 0;
    const e = RE_ENZYMES[marker.enzyme];
    const cut0 = e && Array.isArray(e.cut) ? e.cut[0] : 0;
    const len = seq.length || 1;
    const pos = ((recog + cut0) % len + len) % len;
    sel.onRestrictionClick({ enzyme: marker.enzyme, position: pos });
  };

  // First-click RE snap highlights the single site; the pair commit
  // (onPairCommit) sets the dual key. firstRESite drives the single.
  const reHighlight = firstRESite
    ? `${firstRESite.enzyme}-${firstRESite.position}`
    : reHighlightKey;

  // V88 — test escape hatch. SequenceView's RE-click goes through deep
  // SVG markers that are hard to simulate in unit tests; this window
  // event drives the hook's onRestrictionClick directly.
  useEffect(() => {
    const onEv = (e) => {
      if (e && e.detail) sel.onRestrictionClick(e.detail);
    };
    window.addEventListener('__v88_re_click__', onEv);
    return () => window.removeEventListener('__v88_re_click__', onEv);
  });

  const confirm = () => {
    const lo = Math.min(Number(start), Number(end));
    const hi = Math.max(Number(start), Number(end));
    const circular = !!(source && source.circular);
    // The selection is the PIECE [lo,hi] regardless of drag DIRECTION — a bottom-up
    // (anchor > pos) drag is the same piece, not a wrap (Игорь 23.06). The ONLY way
    // to take the remainder is the «Инвертировать» button: it confirms the COMPLEMENT
    // as two wrapped ranges [hi..len] + [0..lo] (a single start>=end span is rejected
    // by the piece-invariant — «кусок переходит через 0»).
    const inverted = invert && circular && hasPiece;
    // A NUMERIC start>end is an explicit origin-wrap (not a backward cursor drag).
    const numWrap = !inverted && circular && Number(start) > Number(end) && acquisitionMethod === 'numeric';
    const splitWrap = (a, b) => {
      const out = [];
      if (a < seq.length) out.push({ start: a, end: seq.length, orientation: rc ? 'reverse' : 'forward' });
      if (b > 0) out.push({ start: 0, end: b, orientation: rc ? 'reverse' : 'forward' });
      return out;
    };
    const ranges = inverted ? splitWrap(hi, lo)
      : numWrap ? splitWrap(Number(start), Number(end))
        : undefined;
    const cStart = ranges ? (ranges[0] ? ranges[0].start : 0) : lo;
    const cEnd = ranges ? (ranges[0] ? ranges[0].end : seq.length) : hi;
    onConfirm({
      start: cStart,
      end: cEnd,
      rc: !!rc,
      acquisitionMethod,
      // V157 — only restriction pieces need (and carry) enzyme params.
      acquisitionParams: acquisitionMethod === 'restriction' ? reParams : undefined,
      ranges,
    });
  };

  // #4 — commit a single RE site as a plain CUT (linearize, remove nothing):
  // the whole plasmid with that enzyme's overhang on BOTH ends.
  const confirmSingleCut = () => {
    if (!firstRESite) return;
    onConfirm({
      start: 0,
      end: seq.length,
      rc: !!rc,
      acquisitionMethod: 'restriction',
      acquisitionParams: {
        enzymes: [firstRESite.enzyme],
        cutSites: [{ position: firstRESite.position }],
        single: true,
      },
    });
  };

  // #5 — a band was picked from the digest «gel» → confirm it as the fragment,
  // recording the digest (enzymes + chosen band) as provenance CONTEXT.
  const onPickFragment = (fragment) => {
    setDigestOpen(false);
    if (!fragment) return;
    const ranges = fragmentRanges(fragment, seq.length, rc ? 'reverse' : 'forward');
    const ends = [fragment.leftEnzyme, fragment.rightEnzyme].filter(Boolean);
    onConfirm({
      start: fragment.start,
      end: fragment.wraps ? seq.length : fragment.end,
      rc: !!rc,
      acquisitionMethod: 'restriction',
      acquisitionParams: {
        enzymes: ends,
        cutSites: [{ position: fragment.start }, { position: fragment.end }],
        // Context: this band came from a restriction digest → gel → extraction.
        digest: { enzymes: digestEnzymes, selectedIndex: fragment.index, gelExtracted: true },
        ...(ends.length === 1 ? { single: true } : {}),
      },
      ranges: ranges.length > 1 ? ranges : undefined,
    });
  };

  // Primary action routes by RE-cut context so it can't silently mis-pick: when
  // the digest is AMBIGUOUS (>2 fragments — a single multi-cutter OR a pair whose
  // enzymes also cut elsewhere) the biolog MUST pick the band off the gel, never
  // an auto-confirmed fragment (Игорь 22.06: «после „использовать как фрагмент“
  // фрагмент выбирается без перекидывания на модалку, а там >2 фрагментов»). A
  // single UNIQUE cutter → linearize; otherwise confirm the selected range.
  const onPrimaryConfirm = () => {
    if (offerDigest) { setDigestOpen(true); return; }
    if (singleLinearizable) { confirmSingleCut(); return; }
    confirm();
  };

  // The selection is the PIECE [selLo, selHi] regardless of drag direction (Игорь
  // 23.06: «при выделении снизу вверх … нужный кусок»). `hasPiece` is true for any
  // non-empty selection (forward OR backward); the button + invert key off it.
  const selLo = Math.min(Number(start), Number(end));
  const selHi = Math.max(Number(start), Number(end));
  const hasPiece = selHi > selLo;
  // Backbone invert is only meaningful for a circular source with a piece to
  // complement. Drives the SelectionOverlay's complement highlight.
  const invertActive = invert && !!(source && source.circular) && hasPiece;
  // EXPLICIT origin-wrap: typing start>end in the NUMERIC inputs means «the piece
  // that crosses 0» → split into [start..len] + [0..end] (Игорь 22.06). A cursor
  // bottom-up drag (anchor>pos) is NOT this — it's the plain piece [lo,hi] (Игорь
  // 23.06); the complement is reached via «Инвертировать», not a backward drag.
  const numericWrap = !!(source && source.circular)
    && Number(start) > Number(end) && acquisitionMethod === 'numeric';
  const wrapBp = numericWrap ? (seq.length - Number(start) + Number(end)) : 0;

  // RC-A2 (Игорь 24.06) — «продолжить теми же рестриктазами». When the PREVIOUS
  // fragment of this assembly was RE-cut, suggest reusing the same (or a
  // compatible-overhang) enzyme on THIS fragment, or — if neither cuts here —
  // adding the site via a primer tail. Pure derivation (restriction-cloning).
  const continuity = useMemo(
    () => suggestEnzymesForNextFragment({ prevEnzymes: priorEnzymes, nextSeq: seq, circular: sourceCircular }),
    [priorEnzymes, seq, sourceCircular],
  );
  const continuityUsable = useMemo(
    () => [...continuity.sameUsable.map((s) => s.enzyme), ...continuity.compatibleUsable.map((c) => c.enzyme)],
    [continuity],
  );

  return (
    <>
    <div
      role="dialog"
      data-testid="range-picker-modal"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="range-picker-panel"
        style={{
          width: '95vw', height: '92vh', maxWidth: '95vw', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 16px 48px rgba(28,25,23,0.32)', overflow: 'hidden',
        }}
      >
        <div style={hdr}>
          <strong style={{ fontSize: 13 }}>
            Выбор фрагмента{source && source.name ? ` · ${source.name}` : ''}
          </strong>
          <div style={{ display: 'flex', gap: 4, marginLeft: 12, flex: 1 }}>
            <button type="button" data-testid="range-picker-tab-sequence" onClick={() => setViewMode('sequence')} style={viewMode === 'sequence' ? tabActive : tabInactive}>Сиквенс</button>
            <button type="button" data-testid="range-picker-tab-visual" onClick={() => setViewMode('visual')} style={viewMode === 'visual' ? tabActive : tabInactive}>Визуал</button>
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginRight: 8 }}>
            Курсор / RE-сайт / фича → «Использовать как фрагмент»
          </span>
          <button type="button" data-testid="range-picker-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        {/* RC-A2 — enzyme-continuity banner. Shows only while building ON TOP of an
            RE-cut fragment: «предыдущий фрагмент вырезан BamHI+EcoRI» + per-enzyme
            verdict on THIS source, with one-click «использовать те же». */}
        {continuity.hasAnyPrev && (
          <div data-testid="range-picker-continuity" style={continuityBar}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Предыдущий фрагмент: {priorEnzymes.join(' + ')}
            </span>
            {continuity.sameUsable.map((s) => (
              <span key={`s-${s.enzyme}`} data-enzyme={s.enzyme} style={contChipOk}>
                {s.enzyme} режет ×{s.cutCount}{s.isUnique ? ', уник.' : ''}
              </span>
            ))}
            {continuity.compatibleUsable.map((c) => (
              <span
                key={`c-${c.enzyme}`}
                data-enzyme={c.enzyme}
                style={contChipOk}
                /* RC-BIO honesty caveats: a hybrid sticky junction is permanently
                   non-re-cuttable (scar); a blunt join is non-directional + low-yield. */
                title={c.end === 'blunt'
                  ? 'Тупой конец: лигирование ненаправленное (вставка в любой ориентации) и менее эффективно — дефосфорилируйте вектор, скрининг ориентации'
                  : `Гибридный шов ${c.enzyme}×${c.compatibleWith}: после лигирования не режется ни одной из ферментов (scar)`}
              >
                {c.enzyme} — совместим с {c.compatibleWith} ×{c.cutCount}
              </span>
            ))}
            {(continuity.sameMultiCut || []).map((m) => (
              <span key={`m-${m.enzyme}`} data-testid="range-picker-continuity-multicut" data-enzyme={m.enzyme} style={contChipMulti}>
                {m.enzyme} режет ×{m.cutCount} — неуник., нужен гель
              </span>
            ))}
            {continuity.absent.map((a) => (
              <span key={`a-${a.enzyme}`} data-testid="range-picker-continuity-primer" data-enzyme={a.enzyme} style={contChipWarn}>
                {a.enzyme} — сайта нет → добавить праймером на стыке
              </span>
            ))}
            {continuityUsable.length > 0 && (
              <button type="button" data-testid="range-picker-continuity-use" onClick={() => addEnzymesToPick(continuityUsable)} style={contUseBtn}>
                Использовать те же →
              </button>
            )}
            {/* RC-BIO-1 — directional cloning: a directional prior pair whose second
                end is absent here would force a single-enzyme digest → same overhang
                both ends → non-directional + vector self-ligation. Warn explicitly so
                «Использовать те же» can't silently green-light it. */}
            {continuity.directionalRisk && (
              <span data-testid="range-picker-continuity-directional" style={contWarnLine}>
                ⚠ Направленность: из пары {priorEnzymes.join(' + ')} здесь нет
                {' '}{continuity.uncovered.join(', ')}. Одним ферментом → одинаковые концы с обеих
                сторон → ненаправленно, вектор самолигируется (дефосфорилируйте) — либо добавьте
                недостающий сайт праймером / возьмите другой вектор.
              </span>
            )}
          </div>
        )}

        <div data-testid="range-picker-viewer" style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4, margin: 10,
        }}>
          {viewMode === 'visual' ? (
            <div data-testid="range-picker-visual" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 12, gap: 8 }}>
              {/* RS-LIN3 — кольцо/линия toggle, only for a circular source (a linear
                  source has no meaningful circular view; it stays a «колбаска»). */}
              {sourceCircular && (
                <div style={{ display: 'flex', gap: 4 }} data-testid="range-picker-map-shape">
                  <button type="button" data-testid="range-picker-map-circular" onClick={() => setMapShape('circular')} style={mapShape === 'circular' ? tabActive : tabInactive}>● Кольцо</button>
                  <button type="button" data-testid="range-picker-map-linear" onClick={() => setMapShape('linear')} style={mapShape === 'linear' ? tabActive : tabInactive}>▬ Линия</button>
                </div>
              )}
              {/* Constrained box so the map isn't bulky (Игорь 22.06). Linear =
                  wide+short; circular = square. Shared map props (RS-A2/PICK1:
                  digest enzymes → all their sites; набор → its UNIQUE cutters;
                  default → all UNIQUE cutters «базово уникальные»). */}
              {mapShape === 'linear' ? (
                <div style={{ width: 'min(900px, 94%)', height: 'min(320px, 46vh)' }}>
                  <LinearMapV2
                    fragments={[{ sequence: seq, annotations, length: seq.length }]}
                    constructName={(source && source.name) || ''}
                    totalBp={seq.length}
                    topology={sourceCircular ? 'circular' : 'linear'}
                    onFeatureClick={onPickFeatureFromMap}
                    onReSiteClick={onPickReSiteFromMap}
                    selectedRegionId={visualRegionId}
                    reEnzymesFilter={mapEnzymeFilter}
                  />
                </div>
              ) : (
                <div style={{ width: 'min(560px, 70vh)', height: 'min(560px, 70vh)' }}>
                  <PlasmidMapV2
                    fragments={[{ sequence: seq, annotations, length: seq.length }]}
                    constructName={(source && source.name) || ''}
                    totalBp={seq.length}
                    topology="circular"
                    onFeatureClick={onPickFeatureFromMap}
                    onReSiteClick={onPickReSiteFromMap}
                    selectedRegionId={visualRegionId}
                    reEnzymesFilter={mapEnzymeFilter}
                  />
                </div>
              )}
            </div>
          ) : (
          <SequenceTab
            sequence={seq}
            annotations={annotations}
            topology={source && source.circular ? 'circular' : 'linear'}
            name={(source && source.name) || ''}
            editable={false}
            isReadOnlyZone={false}
            caretPos={sel.caretPos}
            caretAnchor={sel.caretAnchor}
            selectionMode={sel.selectionMode}
            selectionStrand={sel.selectionStrand}
            onCaretChange={sel.onCaretChange}
            onSelectRange={sel.onSelectRange}
            onRestrictionClick={sel.onRestrictionClick}
            restrictionHighlightKey={reHighlight}
            /* RS-PICK4 — same enzyme filter as the Визуал map drives the sequence
               RE sites: набор / picked / default-unique → «выбор набора меняет
               кол-во сайтов на последовательности» (Игорь 22.06). */
            reEnzymesFilter={mapEnzymeFilter}
            showSelectionTm={(end - start) <= PRIMER_MAX_LEN}
            /* Backbone invert — highlight the COMPLEMENT (the wrap-around backbone)
               so the biolog SEES what they're taking (Игорь 22.06: «должно чётко
               показывать выделение … выбрал-нажал-инвертировалось»). When inverted
               the dimming mask is dropped (it would shade the highlighted backbone). */
            inverted={invertActive}
            /* V87 — dim everything outside the picked range so the fragment
               reads as the foreground (character-granular, like wrap-block
               dimming). V159 — for an RE-pair the range is widened to the
               sticky-end duplex extent so the overhang is not left in shadow. */
            outOfRangeMask={hasPiece && !invertActive ? maskRange : null}
          />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <label style={lbl}>
            start
            <input
              data-testid="range-picker-start"
              type="number"
              /* V127 — 1-based display (⚓ DEC-ANN-10): show start+1, store v-1.
                 end passes through (0-based exclusive == 1-based inclusive). */
              value={toUiCoords(start, end).uiStart}
              onChange={(e) => {
                const v = fromUiCoords(Number(e.target.value), end).start;
                sel.setCaretAnchor(Math.max(0, v));
                setReHighlightKey(null);
                sel.clearFirstRESite?.(); // A30
                setMethodOverride('numeric');
                setInvert(false); // a new range → re-select, then invert again
              }}
              style={numInput}
            />
          </label>
          <label style={lbl}>
            end
            <input
              data-testid="range-picker-end"
              type="number"
              value={end}
              onChange={(e) => {
                const v = Number(e.target.value);
                sel.setCaretPos(v);
                setReHighlightKey(null);
                sel.clearFirstRESite?.(); // A30
                setMethodOverride('numeric');
                setInvert(false); // a new range → re-select, then invert again
              }}
              style={numInput}
            />
          </label>
          <label style={{ ...lbl, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <input
              data-testid="range-picker-rc"
              type="checkbox"
              checked={rc}
              onChange={() => { setRc((v) => !v); sel.clearFirstRESite?.(); }}
            />
            RC
          </label>
          {source && source.circular && (
            // Action button, not a checkbox (Игорь 22.06: «должно быть кнопкой —
            // выбрал, нажал, инвертировалось, и я вижу выделение»). Pressing flips
            // the highlight to the complement (the wrap-around backbone) live.
            <button
              type="button"
              data-testid="range-picker-invert"
              onClick={() => setInvert((v) => !v)}
              disabled={!hasPiece}
              aria-pressed={invertActive}
              title="Взять остаток (бэкбон): выдели участок → нажми → выделится комплемент по кольцу"
              style={{
                ...ghostBtn,
                ...(invertActive
                  ? { background: 'var(--accent-500, #f59e0b)', color: '#fff', borderColor: 'var(--accent-600, #d97706)', fontWeight: 600 }
                  : {}),
                ...(!hasPiece ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
              }}
            >
              {invertActive ? '⮌ Бэкбон (инвертировано)' : '⮌ Инвертировать (бэкбон)'}
            </button>
          )}
          {annotations.length > 0 && (
            <label style={lbl} title="Подставить диапазон существующей фичи (промотор / CDS / терминатор)">
              Диапазон по фиче
              <select
                data-testid="range-picker-feature"
                defaultValue=""
                onChange={onPickFeature}
                style={{ ...numInput, width: 220 }}
              >
                <option value="">— выбрать фичу —</option>
                {annotations.map((a, i) => (
                  <option key={i} value={String(i)}>{featureLabel(a, i)}</option>
                ))}
              </select>
            </label>
          )}
          {/* RS-PICK2 + live-фидбек — search-as-you-type over ENZYMES. Focus the
              empty box → the UNIQUE cutters for THIS sequence drop down at once;
              type → any enzyme by name. Наборы have their OWN selector (right). */}
          <label style={{ ...lbl, position: 'relative' }} title="Поиск рестриктазы по имени; пусто + фокус → уникальные сайты этой последовательности">
            Рестриктазы (поиск)
            <input
              data-testid="range-picker-enzyme-search"
              value={enzymeSearch}
              placeholder="фокус → уникальные; или BamHI…"
              onChange={(e) => setEnzymeSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              // Enter commits the first match ONLY for a typed query — on the
              // empty-focus preview it must do nothing (else Enter silently digests
              // the first unique cutter; review wvv2x0oxz).
              onKeyDown={(e) => { if (e.key === 'Enter' && enzymeSearch.trim() && suggestions[0]) { onPickSuggestion(suggestions[0]); e.preventDefault(); } }}
              style={{ ...numInput, width: 200 }}
            />
            {(searchFocused || enzymeSearch.trim()) && (
              // Opens UPWARD (the search sits in the bottom controls row, so a
              // top:100% list spilled past the modal's hidden overflow — Игорь
              // 22.06 «выпадающий список обрезан размером окна»). Checkbox rows
              // let you tick several at once. Always opens when focused/typed so a
              // dead-end query shows a «нет совпадений» row, not a silent void.
              <div data-testid="range-picker-enzyme-suggest" style={{
                position: 'absolute', bottom: '100%', left: 0, zIndex: 30, minWidth: 240, maxHeight: '46vh', overflow: 'auto',
                background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 4,
                boxShadow: '0 -6px 18px rgba(28,25,23,0.18)', marginBottom: 4,
              }}>
                {!enzymeSearch.trim() && suggestions.length > 0 && (
                  <div style={{ fontSize: 9.5, padding: '3px 8px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                    Уникальные сайты этой последовательности · отметьте галками
                  </div>
                )}
                {suggestions.length === 0 && (
                  <div data-testid="range-picker-enzyme-empty" style={{ fontSize: 10.5, padding: '6px 8px', color: 'var(--text-tertiary)' }}>
                    {enzymeSearch.trim()
                      ? 'нет совпадений — проверьте имя рестриктазы'
                      : 'нет уникальных сайтов — введите имя рестриктазы'}
                  </div>
                )}
                {suggestions.map((s) => {
                  const checked = pickedEnzymes.includes(s.name);
                  return (
                    <button key={s.key} type="button" data-testid="range-picker-enzyme-suggest-item"
                      data-kind={s.type} data-enzyme={s.name} data-checked={checked ? 'true' : 'false'}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleEnzyme(s.name)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', fontSize: 11, padding: '4px 8px',
                        background: checked ? 'var(--accent-50, #fffbeb)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)',
                        cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)',
                      }}>
                      <span aria-hidden style={{ fontSize: 12, color: checked ? 'var(--accent-700, #b45309)' : 'var(--text-tertiary)' }}>{checked ? '☑' : '☐'}</span>
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </label>
          {/* Separate «набор (визуализация)» selector — Игорь 22.06: «выбор набора
              для визуализации не должен быть в поиске». A набор = sites on the map,
              never a 172-enzyme digest. */}
          {enzymeSets.length > 0 && (
            <label style={lbl} title="Показать сайты набора рестриктаз на «Визуал» (визуализация, не дайджест)">
              Набор (визуализация)
              <select
                data-testid="range-picker-visset-select"
                value={visSet ? visSet.id : ''}
                onChange={onPickVisSet}
                style={{ ...numInput, width: 200 }}
              >
                <option value="">— без набора —</option>
                {enzymeSets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({(s.enzymes || []).length})</option>
                ))}
              </select>
            </label>
          )}
          {pickedEnzymes.length > 0 && (
            <div data-testid="range-picker-enzyme-chips" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {pickedEnzymes.map((n) => (
                <span key={n} data-testid="range-picker-enzyme-chip" data-enzyme={n} style={enzymeChip}>
                  {n}
                  <button
                    type="button"
                    data-testid="range-picker-enzyme-chip-remove"
                    aria-label={`убрать ${n}`}
                    onClick={() => removePickedEnzyme(n)}
                    style={enzymeChipX}
                  >×</button>
                </span>
              ))}
              <button type="button" data-testid="range-picker-enzyme-clear" onClick={() => setPickedEnzymes([])} style={ghostBtn}>Сбросить</button>
            </div>
          )}
          {visSet && (
            <div data-testid="range-picker-visset" data-set-id={visSet.id} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...enzymeChip, fontFamily: 'inherit' }}>
                набор: {visSet.name} · {visSetUnique.length} уникальных из {visSet.enzymes.length} (показаны)
                <button type="button" data-testid="range-picker-visset-remove" aria-label="убрать набор"
                  onClick={removeVisSet} style={enzymeChipX}>×</button>
              </span>
            </div>
          )}
          <span style={{ flex: 1, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            {invertActive
              ? `Бэкбон: ${seq.length - (end - start)} bp — выделенный фрагмент затенён, берётся остаток (комплемент по кольцу)`
              : pickedActive
              ? (cutCount >= 1
                ? `${digestEnzymes.join(' + ')} · ${cutCount} разрез(ов) — «Использовать как фрагмент» откроет гель`
                : `${digestEnzymes.join(' + ')} — не режет эту последовательность`)
              : visSet
                ? `Набор «${visSet.name}» — ${visSetUnique.length} уникальных сайтов на «Визуал» (кликабельны); кликни 2, чтобы вырезать, или добавь 1–2 фермента в поиске для дайджеста`
                : firstRESite
              ? (singleNeedsGel
                ? `«${firstRESite.enzyme}» режет ${cutCount}× — выбери полосу в «геле» (или кликни второй сайт для пары)`
                : `RE-сайт «${firstRESite.enzyme}» уникален — «Использовать как фрагмент» линеаризует, либо кликни второй RE для вырезания`)
              : numericWrap
                ? `${wrapBp} bp · выделено через 0 (обёртка по кольцу)`
                : hasPiece
                ? `${selHi - selLo} bp · выделено: ${SELECTION_METHOD_LABELS[acquisitionMethod] || SELECTION_METHOD_LABELS.cursor}`
                  + (reInfo ? ` · липкие концы: ${reInfo.left ? reInfo.left.label : '—'} | ${reInfo.right ? reInfo.right.label : '—'}` : '')
                : 'ничего не выделено'}
          </span>
          {reAudit && reAudit.ambiguous && (
            <span
              data-testid="range-picker-re-warning"
              style={{ flexBasis: '100%', fontSize: 10.5, color: 'var(--danger, #dc2626)' }}
            >
              {`⚠ ${reAudit.offenders.map((o) => `${o.enzyme}×${o.count}`).join(', ')} — режет не только по концам: дайджест не уникален (получится > 2 фрагментов)`}
            </span>
          )}
          {offerDigest && (
            <button type="button" data-testid="range-picker-open-digest" onClick={() => setDigestOpen(true)} style={ghostBtn}>
              ▦ Показать все фрагменты (гель)
            </button>
          )}
          {singleLinearizable && (
            <button type="button" data-testid="range-picker-single-cut" onClick={confirmSingleCut} style={ghostBtn}>
              ✂ Разрезать здесь (линеаризовать)
            </button>
          )}
          <button type="button" data-testid="range-picker-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button type="button" data-testid="range-picker-confirm" onClick={onPrimaryConfirm} style={primaryBtn}>
            Использовать как фрагмент →
          </button>
        </div>
      </div>
    </div>
    {digestOpen && (
      <DigestFragmentPicker
        source={source}
        enzymes={digestEnzymes || []}
        onPick={onPickFragment}
        onCancel={() => setDigestOpen(false)}
      />
    )}
    </>
  );
}

const hdr = {
  display: 'flex', alignItems: 'center', padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)',
};
const ghostBtn = {
  fontSize: 11, padding: '4px 10px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 11.5, padding: '5px 16px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const numInput = {
  fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-1)', color: 'var(--text-primary)', width: 80, marginTop: 2,
};
const lbl = { display: 'flex', flexDirection: 'column', fontSize: 10.5, color: 'var(--text-secondary)' };
const enzymeChip = {
  display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, lineHeight: '16px',
  padding: '1px 4px 1px 7px', borderRadius: 10, fontFamily: 'var(--font-mono, monospace)',
  background: 'var(--surface-1)', border: '1px solid var(--border-default, #d6d3d1)', color: 'var(--text-secondary)',
};
const enzymeChipX = {
  fontSize: 12, lineHeight: '12px', padding: 0, width: 14, height: 14, borderRadius: '50%',
  background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
};
const tabActive = {
  fontSize: 11, padding: '3px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
  background: 'var(--surface-1)', color: 'var(--text-primary)',
  border: '1px solid var(--border-secondary, var(--border-subtle))',
};
const tabInactive = {
  fontSize: 11, padding: '3px 12px', borderRadius: 4, cursor: 'pointer',
  background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)',
};
const continuityBar = {
  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  padding: '6px 12px', fontSize: 10.5, color: 'var(--text-secondary)',
  background: 'var(--accent-50, #fffbeb)', borderBottom: '1px solid var(--border-subtle)',
};
const contChipOk = {
  fontSize: 10, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-mono, monospace)',
  background: 'var(--surface-1)', border: '1px solid var(--success, #16a34a)', color: 'var(--success, #16a34a)',
};
const contChipWarn = {
  fontSize: 10, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-mono, monospace)',
  background: 'var(--surface-1)', border: '1px solid var(--danger, #dc2626)', color: 'var(--danger, #dc2626)',
};
// Multi-cutter of the same/compatible enzyme — usable only via a gel band, not a
// clean continuation (amber, not error-red). RC-A1 review.
const contChipMulti = {
  fontSize: 10, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--font-mono, monospace)',
  background: 'var(--surface-1)', border: '1px solid var(--amber, #b8860b)', color: 'var(--amber, #b8860b)',
};
const contUseBtn = {
  fontSize: 10.5, padding: '3px 12px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const contWarnLine = {
  flexBasis: '100%', width: '100%', fontSize: 10, lineHeight: '14px',
  color: 'var(--danger, #dc2626)', fontWeight: 600,
};
