/**
 * SourceTiles — Sprint M-X.7a v2 K6.
 *
 * 4 tiles per spec §3 IN #8: Файл · Paste · Каталог · Из другого .bodge.
 * Each tile dispatches `onPick(sourceId)`; AddModal owns the catalog picker,
 * delegates file/paste to LibraryWorkspace, and keeps cross-project isolated.
 */
import { memo } from 'react';
import { t as translate, tf as format } from '../../../i18n';
import { Icon } from '../../icons/Icon';
import { SNAPGENE_EXPECTED_TOTAL } from './snapgene-catalog';

const TILES = [
  {
    id: 'file',
    label: 'Файл',
    icon: 'import',
    sub: '.dna · .gb · .fasta',
  },
  {
    id: 'paste',
    label: 'Вставить',
    icon: 'copy',
    sub: 'GenBank / FASTA / sequence',
  },
  {
    id: 'catalog',
    labelKey: 'catalog.sourceLabel',
    icon: 'library',
    subKey: 'catalog.sourceSub',
    subParams: { count: SNAPGENE_EXPECTED_TOTAL },
  },
  {
    id: 'cross-project',
    labelKey: 'crossProject.sourceLabel',
    icon: 'link',
    subKey: 'crossProject.sourceSub',
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
            aria-pressed={isPicked}
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
              <Icon name={t.icon} size={16} />
              <span style={{ fontWeight: 500, fontSize: 13 }}>
                {t.labelKey ? translate(t.labelKey) : t.label}
              </span>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
              {t.subKey
                ? (t.subParams ? format(t.subKey, t.subParams) : translate(t.subKey))
                : t.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default SourceTiles;
