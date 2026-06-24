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
import { useState, useMemo, useCallback, useRef } from 'react';
import { useResizableSplit } from '../../../../hooks/useResizableSplit';
import ResizeHandle from '../../../common/ResizeHandle';
import { useSkeletonState, useSkeletonActions } from '../../store/skeleton-context';
import { selectPcrPrimers } from '../../store/selectors-pcr';
import { recomputeFromSelection } from '../../lib/operation-pcr-bridge';
import { useHotkey } from '../../../../lib/hotkeys';
import { useSequenceSelection } from '../../../../hooks/useSequenceSelection';
import { Icon } from '../../../icons/Icon';
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
  // Drag-to-resize the template | suggestions split (Игорь — разделители двигаются).
  const splitRef = useRef(null);
  const { size: panelW, separatorProps: splitProps, dragging: splitDragging } = useResizableSplit({
    axis: 'x', side: 'end', initial: 320, min: 240, keepOther: 360,
    storageKey: 'pcr-suggestions-w', containerRef: splitRef,
  });

  const template = useMemo(
    () => (op?.inputs?.[0] ? state.containers.find((c) => c.id === op.inputs[0]) || null : null),
    [op, state.containers],
  );
  const seqLen = template?.sequence?.length || 0;
  const [gateOpen, setGateOpen] = useState(false);

  // Controlled selection via the shared hook (SPEC_VIEWER_UNIFICATION).
  // reBehavior:'off' — PCR template has no RE-pair / cut interaction.
  // Base mechanics (caret, drag-select, drag-grace, AA) come from the
  // hook; primer-writing is layered on top via the tracked selection.
  const sel = useSequenceSelection({ initialCaret: 0, reBehavior: 'off' });
  const { caretPos, caretAnchor } = sel;

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
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="pcr" size={12} /> PCR · {template?.name || '—'} · {seqLen} bp · {template?.topology?.circular ? 'circular' : 'linear'}</span>
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
      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: 'flex' }}>
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
            caretPos={sel.caretPos}
            caretAnchor={sel.caretAnchor}
            selectionMode={sel.selectionMode}
            selectionStrand={sel.selectionStrand}
            onCaretChange={sel.onCaretChange}
            onSelectRange={sel.onSelectRange}
            onWritePrimer={onWritePrimer}
            showSelectionTm
            primers={viewerPrimers}
          />
        </div>
        <ResizeHandle axis="x" dragging={splitDragging} testid="pcr-split-handle" {...splitProps} />
        <PrimerSuggestionsPanel
          width={panelW}
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
