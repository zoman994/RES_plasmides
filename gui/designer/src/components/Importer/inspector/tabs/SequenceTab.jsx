import { useMemo, useState, useEffect, useRef } from 'react';
import SequenceView from '../../../SequenceView';
import SettingsPopover from '../../../SequenceView/SettingsPopover';
import { STRINGS } from '../../../../lib/strings';

const S = STRINGS.importer;

/**
 * SequenceTab — read-only SequenceView wrap (M-B.2 K4).
 *
 * Lazy-mounted: parent SingleInspector renders this only when
 * `activeTab === 'sequence'`. On switch back to overview the entire
 * SequenceView (10K+ DOM nodes for a 5 kb circular plasmid) unmounts
 * — that's the V49 50-sec hang fix (default open never builds the heavy
 * tree).
 *
 * `onAddCustomPrimer` is intentionally omitted (read-only).
 *
 * Sprint M-B.3 K8 — settings popover moved into a ⚙ button in the
 * sticky header.
 *
 * Importer-merge-tabs (04.05.2026): the dedicated «Аннотации» tab was
 * dropped — annotation-editing UI moves to a future Annotator module
 * («не смешивай»).
 *
 * Layout reshuffles (same evening):
 *   - LinearFeatureBar «колбаса» moved UP to the SingleInspector level
 *     (always visible, regardless of active tab). Click on a feature
 *     in the bar lands here as a `pendingScroll` prop — useEffect
 *     calls `sequenceViewRef.scrollToPosition(...)` and clears the
 *     queue back to null via `onPendingScrollHandled`.
 *   - Origin offset control moved BACK to MetaColumn under topology
 *     («эту панель на право, под топологию»). SequenceTab now stays
 *     viewer-only — picking a start point is metadata, sits with the
 *     other meta cards on the right rail.
 */
export default function SequenceTab({
  sequence,
  annotations = [],
  topology,
  name,
  fileKey,
  pendingScroll,
  onPendingScrollHandled,
}) {
  const sequenceViewRef = useRef(null);

  // Pending-scroll effect: SingleInspector queues a `{pos, tick}`
  // when biolog clicks a feature on the top-level LinearFeatureBar
  // («колбаса»). The bar lives at SingleInspector level now — when
  // the click happens from the Overview tab, SingleInspector
  // auto-switches to Sequence first, then this effect runs once
  // SequenceView's ref is ready. `tick` ensures repeat clicks on
  // the same feature still trigger a scroll.
  useEffect(() => {
    if (!pendingScroll) return;
    const ref = sequenceViewRef.current;
    if (!ref || typeof ref.scrollToPosition !== 'function') return;
    ref.scrollToPosition(Number(pendingScroll.pos) || 0);
    onPendingScrollHandled?.();
  }, [pendingScroll, onPendingScrollHandled]);
  const fragment = useMemo(() => ({
    id: 'importer-current',
    name: name || 'imported',
    sequence: sequence || '',
    annotations,
    type: topology === 'circular' ? 'plasmid' : 'misc_feature',
    strand: 1,
  }), [sequence, annotations, topology, name]);
  const length = (sequence || '').length;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef(null);
  useEffect(() => { setSettingsOpen(false); }, [fileKey]);

  return (
    <div data-testid="importer-tab-panel-sequence" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0, position: 'relative' }}>
      {/*
        * Header — sticky to top-left of the scrollable tab content
        * area so the ⚙ Settings button stays visible during scroll
        * (biolog 03.05.2026 evening: «настройки отображения кнопка
        * должна всегда висеть в верхнем левом углу независимо от
        * скрола и панель должна открываться под ней а не в левой
        * части»). Background is surface-1 so the DNA letters that
        * scroll past behind don't bleed through.
        */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--surface-1)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: 'var(--text-tertiary)',
          paddingTop: 4, paddingBottom: 6,
        }}
      >
        <button
          ref={settingsButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen ? 'true' : 'false'}
          aria-label={S.sequenceView?.settingsButton || 'Display settings'}
          title={S.sequenceView?.settingsButton || 'Display settings'}
          data-testid="importer-sequence-view-settings-trigger"
          onClick={() => setSettingsOpen(v => !v)}
          style={{
            border: '0.5px solid var(--border-default)',
            background: 'var(--surface-1)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '2px 6px',
            borderRadius: 'var(--radius-md)',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >⚙</button>
        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{S.tabSequence}</span>
        <span>·</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{length.toLocaleString()} bp</span>
        <span>·</span>
        <span
          style={{
            padding: '2px 6px', borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
          }}
        >{S.sequenceReadOnly}</span>
        {/*
          * Popover lives INSIDE the sticky header so it travels with
          * the button — was a sibling of the header (anchored at
          * `{x:0, y:32}` of the SequenceTab div), which made it
          * appear "in the left part" of the panel and scroll away
          * with the content. Now position:absolute inside the
          * sticky parent → drops down right under the ⚙ button and
          * stays attached during scroll.
          */}
        {settingsOpen && (
          <SettingsPopover
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            anchor={{ x: 0, y: 30 }}
          />
        )}
      </div>

      <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <SequenceView
          ref={sequenceViewRef}
          fragments={[fragment]}
          circular={topology === 'circular'}
          readOnly
        />
      </div>
    </div>
  );
}
