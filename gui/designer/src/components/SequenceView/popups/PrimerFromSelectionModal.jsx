/**
 * PrimerFromSelectionModal — Игорь 18.05.2026: «при нажатии добавить
 * праймер должно открываться окно с возможностью редактирования
 * праймера, его имени и RC».
 *
 * Opened by SequenceView when the user triggers "primer" on a
 * selection (right-click menu). Pre-filled with the selected DNA
 * (RC-oriented for a reverse primer). Editable: name, sequence, and
 * the RC/direction toggle (flipping it reverse-complements the field).
 * Esc / backdrop close (ui-interactions modal contract).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  normalizeDnaFieldInput,
  reverseComplement,
} from "../../../sequence-utils.js";
import { projectPrimerSites } from "../../../lib/primer-site-projection.js";
import {
  resolvePhysicalOligo,
  ANCHORED_OLIGO_OK,
  ANCHORED_OLIGO_CONFLICT,
  ANCHORED_OLIGO_UNSUPPORTED,
} from "../../../lib/primer-identity";
import { tf } from "../../../i18n";
import {
  RE_ENZYMES, effectiveEnzymes, scanAllSites,
} from "../../../restriction-db.js";
import { evaluatePrimerDuplexThermodynamics } from "../../../lib/primer-duplex-thermodynamics";
import { flattenRawOccurrences } from "../lib/feature-map.js";
import { Icon } from "../../icons/Icon";
import PrimerBindingInspector from "./PrimerBindingInspector";
import PrimerTmReadout, { primerTmReadoutText } from "./PrimerTmReadout";

// K13 — quick-add helper sets (SPEC §3 шаг 3 PrimerFromSelectionModal
// extension). Tags are local built-ins; classic restriction sites always come
// from the canonical RE database so their sequence and cut geometry cannot
// drift apart here.
const HELPER_SNIPPETS = [
  ['6xHis', 'CATCATCATCATCATCAT'],
  ['FLAG', 'GATTACAAGGATGACGATGACAAG'],
  ['Kozak-ATG', 'GCCACCATG'],
];
const HELPER_RE_NAMES = ['EcoRI', 'NotI', 'BamHI'];

function cleanDna(s) {
  const normalized = normalizeDnaFieldInput(String(s ?? ''));
  return normalized.accepted ? normalized.value : '';
}

function rejectedSelectionPosition(previousValue, proposedValue, position) {
  if (!Number.isSafeInteger(position)) return null;
  let prefix = 0;
  while (prefix < previousValue.length && prefix < proposedValue.length
    && previousValue[prefix] === proposedValue[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < previousValue.length - prefix && suffix < proposedValue.length - prefix
    && previousValue[previousValue.length - 1 - suffix]
      === proposedValue[proposedValue.length - 1 - suffix]) suffix += 1;
  const previousChangeEnd = previousValue.length - suffix;
  const proposedChangeEnd = proposedValue.length - suffix;
  if (position <= prefix) return position;
  if (position >= proposedChangeEnd) {
    return position - (proposedChangeEnd - prefix) + (previousChangeEnd - prefix);
  }
  return previousChangeEnd;
}

function restoreFieldSelection(field, start, end) {
  if (!field || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || typeof field.setSelectionRange !== 'function') return;
  const boundedStart = Math.max(0, Math.min(start, field.value.length));
  const boundedEnd = Math.max(boundedStart, Math.min(end, field.value.length));
  field.setSelectionRange(boundedStart, boundedEnd);
}

function acceptDnaField(event, currentValue, setter) {
  const field = event.currentTarget;
  const proposedValue = field.value;
  const selectionStart = field.selectionStart;
  const selectionEnd = field.selectionEnd;
  const normalized = normalizeDnaFieldInput(proposedValue);
  if (!normalized.accepted) {
    field.value = currentValue;
    restoreFieldSelection(
      field,
      rejectedSelectionPosition(currentValue, proposedValue, selectionStart),
      rejectedSelectionPosition(currentValue, proposedValue, selectionEnd),
    );
    return;
  }
  field.value = normalized.value;
  setter(normalized.value);
  restoreFieldSelection(field, selectionStart, selectionEnd);
}

// P4 — scan the ENTIRE final oligo (tail + binding) with the effective classic
// RE catalog, so helper-added, manually typed, and tail/binding-boundary motifs
// all surface as future-PCR-product sites. Uses the same raw-occurrence adapter
// the template context uses; positions are oligo-relative. GG_ENZYMES are never
// consulted here — scanAllSites walks RE_ENZYMES only.
function occurrenceTouchesPrimerDifference(occurrence, tailLength, alignment) {
  if (occurrence.start < tailLength) return true;
  if (!alignment?.runs?.length) return false;
  const queryStart = occurrence.start - tailLength;
  const queryEnd = queryStart + occurrence.length;
  return alignment.runs.some((run) => {
    if (run.op === 'X' || run.op === 'I') {
      return run.queryStart < queryEnd && run.queryEnd > queryStart;
    }
    // A deletion has no primer base of its own. It changes the PCR product
    // only for a motif that spans the newly joined bases on both sides.
    return run.op === 'D'
      && queryStart < run.queryStart
      && run.queryStart < queryEnd;
  });
}

function scanPcrContext(cleanFullSeq, tailLength, alignment) {
  if (!cleanFullSeq) return { occurrences: [], trackSites: [] };
  const scan = scanAllSites(cleanFullSeq, { circular: false, minSiteLen: 6 });
  const occurrences = flattenRawOccurrences(scan, { mode: 'all' })
    .sort((a, b) => a.start - b.start || a.enzyme.localeCompare(b.enzyme));
  const enzymeCatalog = effectiveEnzymes();
  const seen = new Set();
  const trackSites = occurrences
    // The product-only row explains every site introduced by the primer: in
    // the 5′ tail, across its boundary, or by X/I/D inside the binding region.
    .filter((occurrence) => (
      occurrenceTouchesPrimerDifference(occurrence, tailLength, alignment)
    ))
    .map((occurrence) => ({
      enzyme: occurrence.enzyme,
      position: occurrence.start + (enzymeCatalog[occurrence.enzyme]?.cut?.[0] || 0),
    }))
    .filter((site) => {
      const key = `${site.enzyme}:${site.position}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    occurrences,
    trackSites,
  };
}

export default function PrimerFromSelectionModal({
  draft, onCreate, onClose,
  // PRIMER-LIVE-1B — the landing this oligo is anchored to, plus the molecule
  // it landed on. Display context only: the dialog never writes them back, so
  // an ordinary edit still leaves the anchor exactly where it was.
  anchorSites = null, template = "", topology = "linear",
  entryId = null, documentHash = null,
  // P4 — absolute, already-built molecule features (never raw fragment-local
  // annotations) plus the exact RE track data/settings used by the host
  // Sequence Viewer. The landing preview renders the same SequenceLine stack.
  features = [], templateReSites = [], viewSettings = {},
}) {
  // Capture during render: React applies `autoFocus` during commit, before a
  // passive effect runs. Capturing inside the effect therefore remembers the
  // dialog input itself and has nothing live to restore on unmount.
  const returnFocusRef = useRef(
    typeof document !== "undefined" ? document.activeElement : null,
  );
  useEffect(() => {
    return () => {
      try { returnFocusRef.current?.focus({ preventScroll: true }); } catch { /* detached */ }
    };
  }, []);
  // `draft.name` seeds the field when opened from an EXISTING primer
  // (double-click); empty for the create-from-selection path.
  const [name, setName] = useState(draft.name || "");
  const draftBinding = draft.binding ?? draft.sequence ?? "";
  // The two fields only seed authoring UI. The confirmed-site alignment below
  // owns the biological split; this opening value must not chase later renders.
  const [opening] = useState(() => resolvePhysicalOligo(
    {
      tail: draft.tail,
      bindingSequence: draftBinding,
      sequence: draft.sequence,
      bindingModel: draft.bindingModel,
    },
    { anchor: anchorSites?.[0]?.annealedSequence },
  ));
  const split = opening.status === ANCHORED_OLIGO_OK;
  const [tail, setTail] = useState(split ? opening.tail : (draft.tail || ""));
  const [binding, setBinding] = useState(
    split ? opening.binding : draftBinding,
  );
  const [direction, setDirection] = useState(draft.direction || "forward");
  const [activeRestrictionKey, setActiveRestrictionKey] = useState(null);
  const openingDirection = draft.direction === "reverse" ? "reverse" : "forward";
  const activeAnchorSites = Array.isArray(anchorSites) && direction !== openingDirection
    ? anchorSites.map((site) => ({
      ...site,
      strand: site?.strand === -1 ? 1 : -1,
      annealedSequence: reverseComplement(cleanDna(site?.annealedSequence || "")),
    }))
    : anchorSites;

  // Focus can remain on an assembly/library opener while this portal mounts.
  // The document-wide modal marker makes App's resolver back off; this local
  // capture listener then owns Escape regardless of where focus happened to be.
  useEffect(() => {
    const onWindowKeyDownCapture = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onClose();
    };
    window.addEventListener("keydown", onWindowKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onWindowKeyDownCapture, true);
  }, [onClose]);

  // The App resolver runs on window in capture phase. The backdrop's
  // `data-block-global-hotkeys` is therefore the first boundary; this React
  // handler owns the local close and contains every later bubble-phase handler.
  const onModalKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    e.stopPropagation();
  };

  const toggleRc = () => {
    const normalizedTail = normalizeDnaFieldInput(tail);
    const normalizedBinding = normalizeDnaFieldInput(binding);
    if (!normalizedTail.accepted || !normalizedBinding.accepted) return;
    const next = direction === "reverse" ? "forward" : "reverse";
    setDirection(next);
    // K13 — RC affects the BINDING (anneals to template) only. The tail
    // is a 5' overhang regardless of which strand we prime from, so it
    // stays. Re-orient the binding so it always reads 5'→3' on the
    // chosen strand.
    setBinding(reverseComplement(normalizedBinding.value));
  };

  const cleanTail = cleanDna(tail);
  const cleanBinding = cleanDna(binding);
  const fullSeq = cleanTail + cleanBinding;
  // The opening split protects an unreadable stored record. Once an anchored
  // record opened cleanly, validate the fields again on every render: shortening
  // the binding is an unsupported re-anchor even when it happened after mount.
  // An unanchored create draft has no fixed landing length and keeps its old flow.
  const live = activeAnchorSites?.[0]?.annealedSequence
    ? resolvePhysicalOligo(
      {
        tail: cleanTail,
        bindingSequence: cleanBinding,
        sequence: fullSeq,
        // Once a legacy record opened into an unambiguous canonical split, the
        // editing session opts into M/X/I/D. A legacy record that was already
        // unreadable stays blocked by `opening.status` below.
        bindingModel: opening.status === ANCHORED_OLIGO_OK
          ? 'aligned-v1'
          : draft.bindingModel,
      },
      { anchor: activeAnchorSites[0].annealedSequence },
    )
    : { status: ANCHORED_OLIGO_OK };
  const oligoStatus = opening.status === ANCHORED_OLIGO_OK
    ? live.status
    : opening.status;
  const blockedKey = oligoStatus === ANCHORED_OLIGO_CONFLICT
    ? "pcr.product.blocked.tail-binding-conflict"
    : (oligoStatus === ANCHORED_OLIGO_UNSUPPORTED
      ? "pcr.product.blocked.indel-unsupported"
      : null);
  const currentRecord = {
    id: draft.primerId || null,
    name: name.trim() || draft.name || tf("primer.modal.binding-preview-primer"),
    direction,
    tail: cleanTail,
    sequence: fullSeq,
    bindingSequence: cleanBinding,
    bindingModel: opening.status === ANCHORED_OLIGO_OK
      ? 'aligned-v1'
      : draft.bindingModel,
    sites: activeAnchorSites,
  };
  // The snapshot is enough to split a legacy oligo, but never enough to judge
  // complementarity. Read the shared projected occurrence so status, preview,
  // PCR and the value saved to the record all describe the CURRENT molecule.
  const activeSite = activeAnchorSites?.[0] || null;
  const projectedOccurrence = oligoStatus === ANCHORED_OLIGO_OK && activeSite && template
    ? projectPrimerSites(currentRecord, {
      template, topology, entryId, documentHash,
    }).find((occurrence) => occurrence.siteId === activeSite.id) || null
    : null;
  const alignment = projectedOccurrence?.alignment || null;
  const effectiveTailLength = projectedOccurrence?.unpairedPrefixLength
    ?? cleanTail.length;
  const alignmentQueryOffset = cleanTail.length - effectiveTailLength;
  const effectiveTailSequence = fullSeq.slice(0, effectiveTailLength);
  const effectiveBindingSequence = fullSeq.slice(effectiveTailLength);
  const thermodynamics = evaluatePrimerDuplexThermodynamics({ alignment });
  // Future-PCR-product restriction occurrences over the whole oligo. The same
  // shared track now includes sites introduced by a mutagenic binding region,
  // not only those whose first base happens to be in the 5′ tail.
  const { occurrences: pcrOccurrences, trackSites: pcrReSites } = scanPcrContext(
    fullSeq, effectiveTailLength, alignment,
  );
  // The flanking-protection warning is about a site the biolog is building in the
  // 5′ tail. Prefer the helper-clicked site; otherwise fall back to the rightmost
  // site that actually sits inside the tail, never an incidental binding motif.
  const tailOccurrences = pcrOccurrences.filter(
    (occurrence) => occurrence.start + occurrence.length <= effectiveTailLength,
  );
  const activeRestriction = pcrOccurrences.find(
    (occurrence) => `re:${occurrence.enzyme}:${occurrence.start}` === activeRestrictionKey,
  ) || tailOccurrences.at(-1) || null;
  const activeRestrictionInfo = activeRestriction
    ? effectiveEnzymes()[activeRestriction.enzyme]
    : null;
  const restrictionFlankingWarningText = activeRestriction && activeRestrictionInfo
    && activeRestriction.start < (activeRestrictionInfo.minFlanking || 0)
    ? tf('primer.modal.re-flanking-warning', {
      name: activeRestriction.enzyme,
      available: activeRestriction.start,
      required: activeRestrictionInfo.minFlanking,
    })
    : '';
  const restrictionDescriptionIds = restrictionFlankingWarningText
    ? 'primer-modal-re-flanking-warning'
    : undefined;
  const modalStatusText = [
    restrictionFlankingWarningText,
    primerTmReadoutText(thermodynamics),
  ]
    .filter(Boolean)
    .join(' · ');

  const submit = () => {
    const normalizedTail = normalizeDnaFieldInput(tail);
    const normalizedBinding = normalizeDnaFieldInput(binding);
    if (!normalizedTail.accepted || !normalizedBinding.accepted) return;
    const normalizedSequence = normalizedTail.value + normalizedBinding.value;
    // Persist the full-alignment split, not the authoring-field boundary.
    const savedTail = projectedOccurrence
      ? effectiveTailSequence
      : normalizedTail.value;
    const savedBinding = projectedOccurrence
      ? effectiveBindingSequence
      : normalizedBinding.value;
    const payload = {
      name: name.trim(),
      sequence: normalizedSequence,
      direction,
      tail: savedTail,
      binding: savedBinding,
      bindingModel: 'aligned-v1',
      // A direction flip is an explicit re-anchor of the same genomic
      // footprint onto the opposite strand. A plain edit still omits sites.
      sites: direction !== openingDirection ? activeAnchorSites : undefined,
    };
    const currentTm = thermodynamics.fullDuplex.status === 'calculated'
      ? thermodynamics.fullDuplex.tmC
      : null;
    payload.tm = Number.isFinite(currentTm) ? currentTm : null;
    onCreate(payload);
  };

  const appendTail = (snippet) => setTail((current) => {
    const normalized = normalizeDnaFieldInput(current);
    return normalized.accepted ? normalized.value + snippet : current;
  });
  const appendRestrictionSite = (name) => {
    const info = RE_ENZYMES[name];
    if (!info?.site) return;
    const normalizedTail = normalizeDnaFieldInput(tail);
    if (!normalizedTail.accepted) return;
    const start = normalizedTail.value.length;
    setTail(`${normalizedTail.value}${info.site}`);
    setActiveRestrictionKey(`re:${name}:${start}`);
  };

  // Игорь 18.05.2026: «модалка "прозрачная" для клика, кнопки не
  // жмутся». Тот же корень, что и у keydown: React распускает события
  // по дереву компонентов, не по DOM — pointerdown/up/click из портала
  // всплывают в `<div onPointerDown={onRootPointerDown}>` корня
  // SequenceView, тот стартует drag-select / pointer-capture и
  // «крадёт» взаимодействие, click по кнопке не завершается. Гасим
  // pointer/contextmenu в пределах модала (click для backdrop-close
  // на самом backdrop остаётся — это отдельное событие на нём же).
  const stopPtr = (e) => e.stopPropagation();

  // Игорь 18.05.2026: модалка появлялась «в центре последовательности
  // и до неё надо скролить», ввод имени был неактивен — корень: рендер
  // внутри scroll/pointer-контекста SequenceView с position:absolute.
  // Фикс — портал в document.body + position:fixed: настоящий
  // viewport-центрированный модал вне stacking/user-select вьювера.
  if (typeof document === "undefined") return null;
  const dialogTitle = draft.name
    ? tf('primer.modal.dialog-existing', { name: draft.name })
    : tf('primer.modal.dialog-new');
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="primer-modal-title"
      data-testid="primer-from-selection-modal"
      data-block-global-hotkeys="true"
      data-modal-open=""
      onClick={onClose}
      onPointerDown={stopPtr}
      onPointerUp={stopPtr}
      onPointerMove={stopPtr}
      onContextMenu={stopPtr}
      // PRIMER-LIVE-1B — paste needs containing too, and for the same reason
      // keydown did: React routes portal events through the COMPONENT tree, so
      // Ctrl+V in a dialog field reached SequenceView's root `onPaste`, which
      // preventDefault()s and applies a sequence edit — the plasmid behind the
      // dialog was rewritten and the field got nothing. `stopPtr` only stops
      // propagation; cancelling the event would break the field's own paste.
      onPaste={stopPtr}
      onCut={stopPtr}
      onCopy={stopPtr}
      // Игорь 18.05.2026: «имя так же не печатается». React распускает
      // события по ДЕРЕВУ КОМПОНЕНТОВ, не по DOM — портал в body НЕ
      // выводит keydown из-под `<div onKeyDown>` SequenceView'а
      // (useSequenceKeyboard в editable-режиме делает preventDefault на
      // каждую IUPAC-букву A/C/G/T/N/… → инпут их не получает). Гасим
      // распространение keydown в пределах модала: ввод работает,
      // sequence-edit вьювера не срабатывает. Escape закрывает только
      // этот dialog; capture-phase App resolver отсекается data-атрибутом выше.
      onKeyDown={onModalKeyDown}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(28,25,23,0.32)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 24px)",
          display: "flex", flexDirection: "column",
          background: "var(--surface-1)", color: "var(--text-primary)",
          border: "1px solid var(--border-subtle)", borderRadius: 8,
          boxShadow: "0 8px 28px rgba(28,25,23,0.24)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
          <strong id="primer-modal-title" style={{ fontSize: 12.5, flex: 1 }}>
            {dialogTitle}
          </strong>
          <button
            type="button"
            aria-label={tf('primer.modal.close')}
            data-testid="primer-modal-cancel-x"
            onClick={onClose}
            style={ghostBtn}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div style={{
          padding: 12, display: "flex", flexDirection: "column", gap: 10,
          minHeight: 0, overflowY: "auto",
        }}>
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={screenReaderOnly}
          >
            {modalStatusText}
          </div>
          <label style={lbl}>
            Имя (необязательно)
            <input
              data-testid="primer-modal-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="авто-имя если пусто"
              style={inp}
            />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Направление</span>
            <button
              type="button"
              data-testid="primer-modal-rc"
              onClick={toggleRc}
              title="Reverse-complement"
              style={{
                ...ghostBtn,
                fontWeight: 600,
                color: direction === "reverse" ? "var(--viz-primer-rev)" : "var(--viz-primer-fwd)",
                borderColor: direction === "reverse" ? "var(--viz-primer-rev)" : "var(--viz-primer-fwd)",
              }}
            >
              {direction === "reverse" ? "◀ Reverse (RC)" : "▶ Forward"}
            </button>
          </div>

          {/* K13 — separate 5'-tail field (overhang, not bound on template)
              + binding region (5'→3' on chosen strand). The full primer
              sequence is tail + binding, shown in the split viz. */}
          <label style={lbl}>
            {tf('primer.modal.tail-label')}
            <textarea
              data-testid="primer-modal-tail"
              value={tail}
              onChange={(event) => acceptDnaField(event, tail, setTail)}
              rows={2}
              placeholder={tf('primer.modal.tail-placeholder')}
              style={{
                width: "100%", marginTop: 4, fontFamily: "var(--font-mono, monospace)",
                fontSize: 12, padding: 8,
                border: "1px solid var(--accent-500)",
                borderRadius: 4, background: "var(--accent-wash)",
                color: "var(--text-primary)", resize: "vertical",
              }}
            />
          </label>

          <div
            role="group"
            aria-label={tf('primer.modal.helper-sequences')}
            style={helperGroup}
          >
            <span style={helperLabel}>{tf('primer.modal.helper-sequences')}:</span>
            {HELPER_SNIPPETS.map(([n, s]) => (
              <button
                key={n}
                type="button"
                data-testid={`primer-modal-helper-snippet-${n}`}
                aria-label={tf('primer.modal.helper-add-sequence', { name: n })}
                onClick={() => appendTail(s)}
                style={helperBtn}
              >+ {n}</button>
            ))}
          </div>

          <div
            role="group"
            aria-label={tf('primer.modal.helper-restriction-sites')}
            style={helperGroup}
          >
            <span style={helperLabel}>{tf('primer.modal.helper-restriction-sites')}:</span>
            {HELPER_RE_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                data-testid={`primer-modal-helper-re-${name}`}
                aria-label={tf('primer.modal.helper-add-restriction-site', {
                  name,
                  site: RE_ENZYMES[name].site,
                })}
                aria-describedby={activeRestriction?.enzyme === name
                  ? restrictionDescriptionIds
                  : undefined}
                onClick={() => appendRestrictionSite(name)}
                style={helperBtn}
              >+ {name}</button>
            ))}
          </div>

          {restrictionFlankingWarningText && (
            <div
              id="primer-modal-re-flanking-warning"
              data-testid="primer-modal-re-flanking-warning"
              style={restrictionWarningStyle}
            >
              {restrictionFlankingWarningText}
            </div>
          )}

          <PrimerBindingInspector
            value={binding}
            onChange={(event) => acceptDnaField(event, binding, setBinding)}
            alignment={alignment}
            queryOffset={alignmentQueryOffset}
            template={template}
            topology={topology}
            primer={currentRecord}
            occurrence={projectedOccurrence}
            features={features}
            templateReSites={templateReSites}
            productSequence={fullSeq}
            productReSites={pcrReSites}
            entryId={entryId}
            documentHash={documentHash}
            viewSettings={viewSettings}
          />

          <PrimerTmReadout result={thermodynamics} />

          <label style={lbl}>
            {tf('primer.modal.final-sequence')}
            <output
              data-testid="primer-modal-final-sequence"
              role="group"
              aria-live="off"
              aria-label={tf('primer.modal.final-sequence')}
              style={{
                display: "block", boxSizing: "border-box", width: "100%", marginTop: 4,
                padding: 8, border: "1px solid var(--border-default)", borderRadius: 4,
                background: "var(--surface-2)", color: "var(--text-primary)",
                fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6,
                userSelect: "text", wordBreak: "break-all",
              }}
            >
              {effectiveTailSequence && (
                <span
                  data-testid="primer-modal-final-tail"
                  title={tf('primer.modal.final-tail')}
                  style={{ background: "var(--accent-100)", color: "var(--accent-text)" }}
                >
                  {effectiveTailSequence}
                </span>
              )}
              <span
                data-testid="primer-modal-final-binding"
                title={tf('primer.modal.final-binding')}
              >
                {effectiveBindingSequence}
              </span>
            </output>
          </label>
          {blockedKey && (
            <div data-testid="primer-modal-blocked" role="alert" style={warnRow}>
              {tf(blockedKey)}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", flexShrink: 0, gap: 8, padding: "8px 12px",
          borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)",
        }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="primer-modal-cancel" onClick={onClose} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="primer-modal-create"
            onClick={submit}
            disabled={Boolean(blockedKey)}
            style={blockedKey ? { ...primaryBtn, cursor: "not-allowed", opacity: 0.6 } : primaryBtn}
          >{tf(draft.primerId ? "primer.modal.save" : "primer.modal.create")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const lbl = { display: "flex", flexDirection: "column", fontSize: 11, color: "var(--text-secondary)" };
const screenReaderOnly = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0,
};
// Same token pair PrimerSelectionActions uses for its warning row, so one
// oligo does not get two different-looking warnings on two screens.
const warnRow = { fontSize: 11, color: "var(--warning-fg)" };
const inp = {
  marginTop: 4, fontSize: 12, padding: "5px 8px", border: "1px solid var(--border-subtle)",
  borderRadius: 4, background: "var(--surface-2)", color: "var(--text-primary)",
};
const ghostBtn = {
  fontSize: 11, padding: "4px 10px", background: "transparent",
  border: "1px solid var(--border-subtle)", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)",
};
const helperBtn = {
  fontSize: 10, padding: "2px 8px", background: "var(--surface-2)",
  border: "1px solid var(--border-subtle)", borderRadius: 999,
  cursor: "pointer", color: "var(--text-secondary)",
};
const helperGroup = {
  display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap",
};
const helperLabel = {
  fontSize: 10, color: "var(--text-tertiary)", marginRight: 4,
};
const restrictionWarningStyle = {
  marginTop: 3, padding: "3px 6px", borderLeft: "3px solid var(--warning-fg)",
  background: "var(--warning-bg)", color: "var(--warning-fg)", fontSize: 10,
};
const primaryBtn = {
  fontSize: 11.5, padding: "5px 16px", background: "var(--accent-500)",
  color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600,
};
