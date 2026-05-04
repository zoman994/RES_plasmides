/**
 * Annotator/TabBar — Sprint M-X.3 K3.
 *
 * Two-button tab strip that sits above the Annotator body. Switches
 * between «Table» (the existing `ResultsPane` with accept/reject
 * rows) and «Preview» (the K4 `PreviewTab` that mounts SequenceView
 * with ghost-rendered predicted regions).
 *
 * Stateless — receives `activeTab` + `onChange` from the parent
 * (which reads `state.annotator.activeTab` from the store).
 */

import { STRINGS } from '../../lib/strings';

const S = STRINGS.importer.annotator;

const TABS = [
  { id: 'table',   label: () => S.tabTable,   hint: () => S.tabTableHint },
  { id: 'preview', label: () => S.tabPreview, hint: () => S.tabPreviewHint },
];

export default function AnnotatorTabBar({ activeTab = 'table', onChange }) {
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
