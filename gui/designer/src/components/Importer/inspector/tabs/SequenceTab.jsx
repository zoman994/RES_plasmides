import { useMemo } from 'react';
import SequenceMapView from '../../../SequenceMapView';
import { STRINGS } from '../../../../lib/strings';

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
 * `onAddCustomPrimer` is intentionally omitted (read-only).
 */
export default function SequenceTab({
  sequence,
  annotations = [],
  topology,
  name,
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

  return (
    <div data-testid="importer-tab-panel-sequence" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minWidth: 0 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: 'var(--text-tertiary)',
        }}
      >
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
      </div>
      <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <SequenceMapView
          fragments={[fragment]}
          circular={topology === 'circular'}
          readOnly
        />
      </div>
    </div>
  );
}
