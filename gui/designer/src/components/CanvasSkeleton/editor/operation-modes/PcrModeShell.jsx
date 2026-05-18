/**
 * PcrModeShell — PCR operation-mode content inside the F1 editor window.
 *
 *   PcrModeHeader (Default/Tweak/Pro level switcher)
 *   ├ flex row
 *   │  ├ SequenceTab  (the SHARED Library SequenceView — template +
 *   │  │               selection-driven primer writing + primer track)
 *   │  └ PrimerSuggestionsPanel (right, 320)
 *   └ PcrModeFooter ("Заказать N олигов" → OrderOligosConfirmGate)
 *
 * V71 (15.05.2026 — reverses the F3 DEC-CANVAS-PCR-05/06 deviation):
 * the template panel is NO LONGER a bespoke monospace <pre> +
 * PrimerDragHandles. It reuses the Library SequenceTab/SequenceView
 * (the same viewer ContainerEditorSkeleton uses). "Primer writing" is a
 * capability added INTO that shared viewer: a region selected there
 * (onSelectRange) is re-derived into the user primer pair
 * (recomputeFromSelection → opSetUserPrimers), and the designed pair is
 * rendered back ON the sequence via SequenceView's `primers` prop.
 * Template = op.inputs[0] (V69 — canonical across selectors/adapters).
 */
import { useState, useMemo, useCallback } from 'react';
import { useSkeletonState, useSkeletonActions } from '../../store/skeleton-context';
import { selectPcrPrimers } from '../../store/selectors-pcr';
import { recomputeFromSelection } from '../../lib/operation-pcr-bridge';
import { useHotkey } from '../../../../lib/hotkeys';
import SequenceTab from '../../../Library/inspector/tabs/SequenceTab';
import PrimerSuggestionsPanel from './PrimerSuggestionsPanel';
import OrderOligosConfirmGate from './OrderOligosConfirmGate';

const LEVELS = [
  { id: 'default', label: 'Default' },
  { id: 'tweak', label: 'Tweak' },
  { id: 'pro', label: 'Pro' },
];

export default function PcrModeShell({ op }) {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const level = state.pcrModeUserLevel || 'default';

  const template = useMemo(
    () => (op?.inputs?.[0] ? state.containers.find((c) => c.id === op.inputs[0]) || null : null),
    [op, state.containers],
  );
  const seqLen = template?.sequence?.length || 0;
  const [gateOpen, setGateOpen] = useState(false);

  // Controlled selection for the shared SequenceView (mirrors the
  // pattern in ContainerEditorSkeleton — no bespoke handles).
  const [caretPos, setCaretPos] = useState(0);
  const [caretAnchor, setCaretAnchor] = useState(0);
  const [selectionMode, setSelectionMode] = useState('dna');
  const [selectionStrand, setSelectionStrand] = useState(1);

  const result = useMemo(() => selectPcrPrimers(state, op?.id), [state, op]);
  const pairs = result.pairs || [];

  // The designed pair, mapped to the SequenceView primer-track shape
  // (PrimerTrack places by sequence/indexOf match — same contract the
  // Library/container editor use). Renders the primers ON the template.
  const viewerPrimers = useMemo(() => {
    const p = pairs[0];
    if (!p) return [];
    const out = [];
    if (p.forward) {
      out.push({
        name: p.fwdName || 'PCR-F',
        sequence: p.forward,
        bindingSequence: p.fwdBinding || p.forward,
        direction: 'forward',
        tmBinding: p.fwdTm,
      });
    }
    if (p.reverse) {
      out.push({
        name: p.revName || 'PCR-R',
        sequence: p.reverse,
        bindingSequence: p.revBinding || p.reverse,
        direction: 'reverse',
        tmBinding: p.revTm,
      });
    }
    return out;
  }, [pairs]);

  // V72 — selection is DECOUPLED from writing. Selecting a region in
  // the shared viewer only tracks the selection; the primer is written
  // explicitly per strand via Ctrl+R (forward) / Ctrl+Alt+R (reverse).
  const onSelectRangeFromView = useCallback((start, end, mode, strand) => {
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    if (end <= start) return;
    setCaretAnchor(start);
    setCaretPos(end);
    setSelectionMode(mode === 'aa' ? 'aa' : 'dna');
    setSelectionStrand(strand === -1 ? -1 : 1);
  }, []);

  // V72 — write ONE strand of the pair from the current selection.
  // Reuses the bio-validated recomputeFromSelection (v0.5
  // designPrimersLocal core). Merges into the existing user pair so the
  // opposite strand is preserved (forward then reverse accumulate).
  const writePrimerForRange = useCallback((direction, lo, hi) => {
    if (!op) return;
    if (!template || !(hi - lo >= 1)) {
      actions.showToast({ kind: 'info', message: 'Выдели участок ДНК на последовательности' });
      return;
    }
    const pair = recomputeFromSelection(template, lo, hi, null);
    const strandSeq = pair && (direction === 'forward' ? pair.forward : pair.reverse);
    if (!strandSeq) {
      // bio-invariants Rule 6 — too short for a real primer; warn, not silent.
      actions.showToast({ kind: 'warning', message: 'Участок слишком короткий для праймера (нужно ≥ ~18 bp)' });
      return;
    }
    const prev = (op.params?.userPrimers && op.params.userPrimers[0]) || {};
    const merged = direction === 'forward'
      ? { ...prev, forward: pair.forward, fwdBinding: pair.fwdBinding, fwdTm: pair.fwdTm, fwdName: pair.fwdName }
      : { ...prev, reverse: pair.reverse, revBinding: pair.revBinding, revTm: pair.revTm, revName: pair.revName };
    actions.opSetUserPrimers(op.id, [{ ...merged, source: 'edited' }]);
  }, [op, template, actions]);

  // Hotkey path — range derived from the tracked selection.
  const writePrimerStrand = useCallback((direction) => {
    writePrimerForRange(direction, Math.min(caretAnchor, caretPos), Math.max(caretAnchor, caretPos));
  }, [writePrimerForRange, caretAnchor, caretPos]);

  // V74 — right-click context-menu path. The shared SequenceView passes
  // the exact selected range, so this works without a prior hotkey.
  const onWritePrimer = useCallback(({ direction, start, end }) => {
    writePrimerForRange(direction === 'reverse' ? 'reverse' : 'forward',
      Math.min(start, end), Math.max(start, end));
  }, [writePrimerForRange]);

  const writeForward = useCallback(() => writePrimerStrand('forward'), [writePrimerStrand]);
  const writeReverse = useCallback(() => writePrimerStrand('reverse'), [writePrimerStrand]);
  useHotkey('pcr-primer-forward', writeForward);
  useHotkey('pcr-primer-reverse', writeReverse);

  const onCaretChange = useCallback((pos, opts) => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return;
    setCaretPos(pos);
    // V80 — collapse the selection anchor onto a plain caret click
    // (mirrors ContainerEditorSkeleton.onCaretChangeFromView). Without
    // this, caretAnchor stayed at its initial 0, so every drag-select
    // ran from the first nucleotide («выделяется всё с первого
    // нуклеотида»). `extendSelection` (shift-drag) keeps the anchor.
    if (!opts || !opts.extendSelection) {
      setCaretAnchor(pos);
      setSelectionMode('dna');
    }
  }, []);

  const onReuse = useCallback((primer) => {
    if (!op) return;
    const cur = pairs[0] || {};
    actions.opSetUserPrimers(op.id, [{
      forward: primer.forward || primer.sequence || cur.forward,
      reverse: primer.reverse || cur.reverse,
      fwdTm: primer.fwdTm ?? primer.tm ?? cur.fwdTm ?? 0,
      revTm: primer.revTm ?? cur.revTm ?? 0,
      source: 'reused',
    }]);
  }, [op, pairs, actions]);

  const onRemove = useCallback(() => {
    if (op) actions.opSetUserPrimers(op.id, []);
  }, [op, actions]);

  const onConfirmOrder = useCallback(() => {
    if (op) actions.opConfirmOrder(op.id);
    setGateOpen(false);
  }, [op, actions]);

  return (
    <div
      data-testid="pcr-mode-shell"
      data-op-id={op ? op.id : ''}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
    >
      {/* Header — level switcher */}
      <div
        data-testid="pcr-mode-header"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)', flexShrink: 0 }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🔬 PCR · {template?.name || '—'} · {seqLen} bp · {template?.topology?.circular ? 'circular' : 'linear'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
          {LEVELS.map((lv) => (
            <button
              key={lv.id}
              type="button"
              data-testid={`pcr-level-${lv.id}`}
              data-active={level === lv.id ? 'true' : 'false'}
              onClick={() => actions.setPcrModeUserLevel(lv.id)}
              style={{
                fontSize: 11, padding: '4px 12px', border: 'none', cursor: 'pointer',
                background: level === lv.id ? 'var(--accent-500, #b85c3e)' : 'var(--surface-1)',
                color: level === lv.id ? '#fff' : 'var(--text-secondary)',
                fontWeight: level === lv.id ? 600 : 400,
              }}
            >{lv.label}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          data-testid="pcr-template-view"
          style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column' }}
        >
          {/* SHARED Library sequence viewer — template + primer track +
              region selection (the primer-writing surface). */}
          <SequenceTab
            sequence={template?.sequence || ''}
            annotations={template?.annotations || []}
            topology={template?.topology?.circular ? 'circular' : 'linear'}
            name={template?.name}
            editable={false}
            isReadOnlyZone={false}
            caretPos={caretPos}
            caretAnchor={caretAnchor}
            selectionMode={selectionMode}
            selectionStrand={selectionStrand}
            onCaretChange={onCaretChange}
            onSelectRange={onSelectRangeFromView}
            onWritePrimer={onWritePrimer}
            showSelectionTm
            primers={viewerPrimers}
          />
        </div>
        <PrimerSuggestionsPanel
          pairs={pairs}
          level={level}
          onReuse={onReuse}
          onRemove={onRemove}
        />
      </div>

      {/* Footer */}
      <div
        data-testid="pcr-mode-footer"
        style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)', flexShrink: 0 }}
      >
        <button
          type="button"
          data-testid="pcr-order-button"
          disabled={pairs.length === 0}
          onClick={() => setGateOpen(true)}
          style={{
            fontSize: 12, padding: '6px 16px', borderRadius: 4, fontWeight: 600,
            border: '1px solid var(--accent-500, #b85c3e)',
            background: pairs.length ? 'var(--accent-500, #b85c3e)' : 'transparent',
            color: pairs.length ? '#fff' : 'var(--text-tertiary)',
            cursor: pairs.length ? 'pointer' : 'not-allowed',
          }}
        >Заказать {pairs.length} олиг.</button>
      </div>

      {gateOpen && (
        <OrderOligosConfirmGate
          pairs={pairs}
          onConfirm={onConfirmOrder}
          onCancel={() => setGateOpen(false)}
        />
      )}
    </div>
  );
}
