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
 *
 * Importer-merge-tabs (04.05.2026): the dedicated «Аннотации» tab was
 * removed — Inspector is now read-only viewer territory (per «не
 * смешивай»: SequenceView vs Annotator separation). The merged
 * «Последовательность» tab embeds the SequenceView at the top with a
 * `LinearFeatureBar` «колбаса» pinned at the bottom; clicking a feature
 * in the strip scrolls the viewer to that feature's start. Annotation
 * editing moves to a dedicated future Annotator module.
 */
// `showOverview` (12.05.2026, Игорь): по умолчанию true для Library /
// Importer (overview categorised summary — фича библиотеки). Skeleton
// editor передаёт false — там заход из canvas, overview не нужен.
//
// `showMutagenesis` (12.05.2026, Игорь): дополнительная вкладка
// в skeleton container editor'е, дублирующая sequence viewer (пока
// функционально идентична Sequence; mutagenesis-specific tooling
// придёт позже). Library/Importer передаёт false по умолчанию.
// `showAnnotations` (18.05.2026, Игорь: «аннотацию стоит включить не в
// виде отдельной вкладки а просто кнопки преобразующей вивер откуда
// угодно»): when false, «Аннотации» leaves the tab strip and becomes a
// right-aligned TOGGLE button (`onToggleAnnotator` + `annotatorActive`)
// that flips the viewer pane into the Annotator in place — same
// affordance on every host that wires it (viewer-sync). Default true
// preserves any caller not yet migrated. The underlying annotations
// render path (gated on activeTab === 'annotations') is unchanged — the
// button is just the new entry point, so V49 lazy-mount still holds.
export default function TabBar({
  activeTab,
  onChange,
  showHistory = false,
  showOverview = true,
  showMutagenesis = false,
  showAnnotations = true,
  annotatorActive = false,
  onToggleAnnotator,
}) {
  const tabs = [];
  if (showOverview) tabs.push({ id: 'overview', label: S.tabOverview });
  tabs.push({ id: 'sequence', label: S.tabSequence });
  if (showAnnotations) tabs.push({ id: 'annotations', label: S.tabAnnotations });
  if (showMutagenesis) tabs.push({ id: 'mutagenesis', label: S.tabMutagenesis || 'Мутагенез' });
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
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          {t.glyph && (
            <span
              aria-hidden
              style={{ fontSize: 11, opacity: activeTab === t.id ? 0.7 : 0.5 }}
            >{t.glyph}</span>
          )}
          {t.label}
        </button>
      ))}
      {typeof onToggleAnnotator === 'function' && (
        <button
          type="button"
          data-testid="importer-annotator-toggle"
          data-active={annotatorActive ? 'true' : 'false'}
          aria-pressed={annotatorActive}
          title={S.tabAnnotations}
          onClick={() => onToggleAnnotator()}
          style={{
            marginLeft: 'auto',
            padding: '6px 14px',
            fontSize: 12,
            background: annotatorActive ? 'var(--accent-wash, rgba(184,92,62,.10))' : 'transparent',
            color: annotatorActive ? 'var(--accent-500)' : 'var(--text-secondary)',
            border: 'none',
            borderLeft: '0.5px solid var(--border-subtle)',
            borderBottom: annotatorActive ? '2px solid var(--accent-500)' : '2px solid transparent',
            fontWeight: annotatorActive ? 500 : 400,
            cursor: 'pointer',
            marginBottom: -1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span aria-hidden style={{ fontSize: 11, opacity: annotatorActive ? 0.85 : 0.55 }}>⌖</span>
          {annotatorActive ? `${S.tabAnnotations} ✕` : S.tabAnnotations}
        </button>
      )}
    </div>
  );
}
