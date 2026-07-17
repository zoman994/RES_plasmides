/**
 * SourceTiles — Sprint M-X.7a v2 K6.
 *
 * 4 tiles per spec §3 IN #8: Файл · Paste · Каталог · Из другого .bodge.
 * Each tile dispatches `onPick(sourceId)`; AddModal then either
 * delegates to LibraryWorkspace (file/paste/catalog)
 * or surfaces CrossProjectStub (cross-project, M-X.9 stub).
 */
import { memo } from 'react';

const TILES = [
  {
    id: 'file',
    label: 'Файл',
    icon: '⤓',
    sub: '.dna · .gb · .fasta',
  },
  {
    id: 'paste',
    label: 'Вставить',
    icon: '⌘V',
    sub: 'GenBank / FASTA / sequence',
  },
  {
    id: 'catalog',
    label: 'Каталог SnapGene',
    icon: '📚',
    sub: '2800+ плазмид · в разработке',
    inDev: true,
  },
  {
    id: 'cross-project',
    label: 'Из другого .bodge',
    icon: '🔗',
    sub: 'M-X.9 — заглушка',
    stub: true,
  },
];

export const SourceTiles = memo(function SourceTiles({ onPick, picked }) {
  return (
    <div
      data-testid="add-modal-source-tiles"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
      }}
    >
      {TILES.map((t) => {
        const isPicked = picked === t.id;
        return (
          <button
            type="button"
            key={t.id}
            data-testid={`add-modal-source-${t.id}`}
            data-stub={t.stub ? 'true' : 'false'}
            data-picked={isPicked ? 'true' : 'false'}
            onClick={() => onPick?.(t.id)}
            style={{
              padding: '14px 12px',
              background: isPicked ? 'var(--accent-50)' : 'var(--surface-2)',
              color: 'var(--text-primary)',
              border: `1px solid ${isPicked ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-md, 6px)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              alignItems: 'flex-start',
              textAlign: 'left',
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontWeight: 500, fontSize: 13 }}>{t.label}</span>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
              {t.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default SourceTiles;
