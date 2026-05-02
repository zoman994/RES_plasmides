import { STRINGS } from '../../../../lib/strings';

const S = STRINGS.importer;

/**
 * TabBar primitive — Inspector tabs (M-B.2 K3).
 *
 * Active tab visualised by accent border + bumped background. «История»
 * tab is conditional: parent passes `showHistory` (true only when the
 * parsedItem already carries `commits.length > 0`, which never happens
 * in the file-import flow shipped in M-B.2; the slot is in place for M-D
 * cross-project / Container Window imports).
 */
export default function TabBar({ activeTab, onChange, showHistory = false }) {
  const tabs = [
    { id: 'overview', label: S.tabOverview },
    { id: 'sequence', label: S.tabSequence },
    { id: 'annotations', label: S.tabAnnotations },
  ];
  if (showHistory) tabs.push({ id: 'history', label: S.tabHistory });

  return (
    <div
      data-testid="importer-tab-bar"
      role="tablist"
      style={{
        display: 'flex', gap: 0,
        borderBottom: '0.5px solid var(--border-subtle)',
        background: 'var(--surface-2, #f5f5f4)',
      }}
    >
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={activeTab === t.id}
          data-testid={`importer-tab-${t.id}`}
          data-active={activeTab === t.id ? 'true' : 'false'}
          onClick={() => onChange?.(t.id)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            background: activeTab === t.id ? 'var(--surface-1)' : 'transparent',
            color: activeTab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: 'none',
            borderRight: '0.5px solid var(--border-subtle)',
            borderBottom: activeTab === t.id ? '2px solid var(--accent-500)' : '2px solid transparent',
            fontWeight: activeTab === t.id ? 500 : 400,
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >{t.label}</button>
      ))}
    </div>
  );
}
