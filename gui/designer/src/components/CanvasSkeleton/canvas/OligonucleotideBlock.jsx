/**
 * OligonucleotideBlock — узкий rectangle с двумя sequence lanes
 * (forward / reverse) + Tm/GC pills.
 *
 * Sprint M-CANVAS-OPS K10 (12.05.2026 — DEC-OPS-09). Drag-source для
 * OpPopup primer-input select.
 *
 * Payload shape:
 *   {
 *     sequences: [{name, sequence, Tm, GC}, ...],
 *     purpose: 'pcr_primer' | 'kld_primer' | 'sequencing' | 'cloning',
 *     concentration_uM, stock_volume_ul
 *   }
 */
import { memo } from 'react';
import { BLOCK_LINEAR_W, BLOCK_LINEAR_H } from './canvas-layout';
import { Icon } from '../../icons/Icon';

function OligonucleotideBlock({ container, highlighted, onClick, onDoubleClick }) {
  const seqs = container?.payload?.sequences
    || (Array.isArray(container?.sequences) ? container.sequences : []);
  const fallback = container?.sequence
    ? [{ name: container.name || 'oligo', sequence: container.sequence }]
    : [];
  const lanes = seqs.length > 0 ? seqs : fallback;

  return (
    <div
      data-testid={`skeleton-block-${container.id}`}
      data-kind="oligonucleotide"
      data-highlighted={highlighted ? 'true' : 'false'}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'relative',
        width: BLOCK_LINEAR_W,
        height: BLOCK_LINEAR_H,
        padding: '6px 10px',
        background: '#fef3c7', // amber-100
        border: '2px solid ' + (highlighted ? 'var(--accent-500, #d97706)' : '#fbbf24'),
        borderRadius: 6,
        boxShadow: highlighted
          ? '0 0 0 4px rgba(217,119,6,0.18)'
          : '0 1px 2px rgba(0,0,0,0.06)',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
      title={`${container.name || 'oligo'} · ${lanes.length} sequence(s)`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="primer" size={14} aria-hidden="true" />
        <span
          data-testid={`skeleton-block-${container.id}-name`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >{container.name || 'oligo'}</span>
        <span
          data-testid={`skeleton-block-${container.id}-purpose`}
          style={{ fontSize: 10, color: 'var(--text-secondary)' }}
        >{container?.payload?.purpose || 'primer'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lanes.slice(0, 2).map((s, idx) => (
          <div
            key={idx}
            data-testid={`skeleton-block-${container.id}-lane-${idx}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'monospace',
              fontSize: 10,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: '#a16207', minWidth: 30 }}>{idx === 0 ? "5'→3'" : "3'←5'"}</span>
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                background: 'rgba(255,255,255,0.55)',
                padding: '0 4px',
                borderRadius: 2,
              }}
            >{(s.sequence || '').slice(0, 24)}{(s.sequence || '').length > 24 ? '…' : ''}</span>
            {typeof s.Tm === 'number' && (
              <span data-testid={`skeleton-block-${container.id}-tm-${idx}`} style={pillStyle}>
                Tm {s.Tm.toFixed(0)}°
              </span>
            )}
            {typeof s.GC === 'number' && (
              <span data-testid={`skeleton-block-${container.id}-gc-${idx}`} style={pillStyle}>
                GC {s.GC.toFixed(0)}%
              </span>
            )}
          </div>
        ))}
        {lanes.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Нет sequences.
          </div>
        )}
      </div>
    </div>
  );
}

const pillStyle = {
  fontSize: 9,
  padding: '0 4px',
  borderRadius: 8,
  background: '#fef9c3',
  color: '#854d0e',
};

export default memo(OligonucleotideBlock);
