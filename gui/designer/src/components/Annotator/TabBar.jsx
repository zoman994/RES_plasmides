/**
 * Annotator/TabBar — Sprint M-X.3 follow-up Stage C (05.05.2026).
 *
 * Two-button tab strip that picks the MAP VIEW inside PreviewTab.
 * Was: «Table | Preview» (gone in Stage B). Now: «Linear | Circular»,
 * matching biolog's mental model: «по вкладке можно еще
 * переключиться в окно просмотра кольцевой ерсии плазмиды/
 * фрагмента».
 *
 * Stateless — `activeTab` + `onChange` come from the store via
 * `selectAnnotator(s).activeTab` / `setAnnotatorActiveTab`.
 */

import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

const TABS = [
  { id: 'linear',   label: () => S.tabLinear,   hint: () => S.tabLinearHint },
  { id: 'circular', label: () => S.tabCircular, hint: () => S.tabCircularHint },
];

export default function AnnotatorTabBar({ activeTab = 'linear', onChange }) {
  return (
    <div
      data-testid="annotator-tab-bar"
      style={{
        display: 'flex',
        gap: 0,
        padding: '0 12px',
        borderBottom: '0.5px solid var(--border-default, #d4d4d4)',
        background: 'var(--surface-1, #fff)',
        flexShrink: 0,
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          data-testid={`annotator-tab-${t.id}`}
          data-active={activeTab === t.id ? 'true' : 'false'}
          onClick={() => onChange?.(t.id)}
          title={t.hint()}
          style={{
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: activeTab === t.id ? 500 : 400,
            color: activeTab === t.id ? 'var(--accent-500, #f97316)' : 'var(--text-secondary)',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === t.id
              ? '2px solid var(--accent-500, #f97316)'
              : '2px solid transparent',
            cursor: 'pointer',
            outline: 'none',
            marginBottom: -0.5, // overlap the parent's bottom border
          }}
        >{t.label()}</button>
      ))}
    </div>
  );
}
