import { useMemo, useState, useEffect, useRef } from 'react';
import SequenceView from '../../../SequenceView';
import SettingsPopover from '../../../SequenceView/SettingsPopover';
import { STRINGS } from '../../../../lib/strings';
import { rotateOriginToPosition } from '../../../../rotate-origin';
import { computeIntergenicHints } from '../lib/intergenic-hints';

const S = STRINGS.importer;

/**
 * SequenceTab — read-only SequenceMapView wrap (M-B.2 K4).
 *
 * Lazy-mounted: parent SingleInspector renders this only when
 * `activeTab === 'sequence'`. On switch back to overview the entire
 * SequenceMapView (10K+ DOM nodes for a 5 kb circular plasmid) unmounts
 * — that's the V49 50-sec hang fix (default open never builds the heavy
 * tree).
 *
 * Origin control (was in MetaColumn до v0.7.x): biolog wants to pick
 * the start position with nucleotide numbers visible — exactly what
 * SequenceMapView shows. Number input + apply button + intergenic hints
 * sit above the sequence; rotation goes through `onUpdateEdits` keyed by
 * the current parsed file (mirrors the v0.5 contract).
 *
 * `onAddCustomPrimer` is intentionally omitted (read-only).
 *
 * Sprint M-B.3 K8 — switched from SequenceMapView to the new SequenceView
 * (display-only, settings-driven). A ⚙ Settings popover sits in the
 * header, opening a SnapGene-style 5-control panel:
 *   - Bottom strand visibility
 *   - AA frames mode (Auto / Single / All) + threshold slider
 *   - Primer style (Filled / Outline)
 *   - RE labels orientation (Vertical / Horizontal)
 *   - Reset to defaults
 * Settings persist under localStorage key `bodgegene-ui-sequenceview`.
 */
export default function SequenceTab({
  sequence,
  annotations = [],
  topology,
  name,
  fileKey,
  onUpdateEdits,
}) {
  const fragment = useMemo(() => ({
    id: 'importer-current',
    name: name || 'imported',
    sequence: sequence || '',
    annotations,
    type: topology === 'circular' ? 'plasmid' : 'misc_feature',
    strand: 1,
  }), [sequence, annotations, topology, name]);
  const length = (sequence || '').length;
  const isCircular = topology === 'circular';

  const [originOffset, setOriginOffset] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef(null);
  // Reset the input when biolog switches between parsed files.
  useEffect(() => { setOriginOffset(1); setSettingsOpen(false); }, [fileKey]);

  const hints = useMemo(
    () => computeIntergenicHints({ sequence, annotations, topology, length }),
    [sequence, annotations, topology, length],
  );

  const canApply = isCircular
    && !!sequence
    && originOffset > 1
    && originOffset <= length
    && typeof onUpdateEdits === 'function';
  const onApplyOrigin = () => {
    if (!canApply) return;
    const out = rotateOriginToPosition(sequence, annotations, originOffset, { topology: 'circular' });
    onUpdateEdits({
      editedSequence: out.sequence,
      editedAnnotations: out.annotations,
    });
    setOriginOffset(1);
  };

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

      {isCircular && (
        <div
          data-testid="importer-sequence-origin"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '6px 8px',
            background: 'var(--surface-2)',
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontSize: 11,
          }}
        >
          <span style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
            color: 'var(--text-secondary)', fontWeight: 600,
          }}>{S.metaOrigin}</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, length)}
            value={originOffset}
            data-testid="importer-sequence-origin-input"
            onChange={(e) => setOriginOffset(Number(e.target.value) || 1)}
            style={{
              width: 90, fontSize: 12, fontFamily: 'var(--font-mono)',
              padding: '3px 6px', textAlign: 'right',
              background: 'var(--surface-1)', color: 'var(--text-primary)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)', outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={onApplyOrigin}
            disabled={!canApply}
            data-testid="importer-sequence-origin-apply"
            style={{
              fontSize: 11,
              padding: '4px 10px',
              background: 'var(--accent-500)',
              color: 'var(--surface-1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: canApply ? 'pointer' : 'not-allowed',
              opacity: canApply ? 1 : 0.4,
            }}
          >{S.metaOriginApply}</button>
          {hints && (
            <span
              data-testid="importer-sequence-origin-hints"
              style={{ fontSize: 11, color: 'var(--text-secondary)', flexBasis: '100%' }}
            >
              <span style={{
                fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
                color: 'var(--text-tertiary)', fontWeight: 500, marginRight: 6,
              }}>{S.metaOriginHintLabel}:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{hints}</span>
            </span>
          )}
        </div>
      )}

      <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <SequenceView
          fragments={[fragment]}
          circular={topology === 'circular'}
          readOnly
        />
      </div>
    </div>
  );
}
