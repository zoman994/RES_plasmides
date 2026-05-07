import { STRINGS } from '../../../lib/strings';
import InlineEditableTitle from './InlineEditableTitle';
import LibrarySaveActions from './LibrarySaveActions';

const S = STRINGS.importer;

/**
 * LibraryInspectorTitleRow — M-X.6 K0 extract from
 * LibrarySingleInspector (DEC-MX6-01). Wraps the title row JSX:
 *
 *   • InlineEditableTitle for entry rename
 *   • Settings ⚙ button (Sequence tab only) — opens SettingsPopover
 *   • READ-ONLY/EDITABLE pill (Sequence tab only) — DEC-LIB-16 ⚓
 *   • LibrarySaveActions «Перезаписать» / «Сохранить как версию» —
 *     DEC-LIB-13 ⚓ (only on Mine entries with pending edits)
 *   • Live selection counter (bp + aa)
 *   • Length / topology / region-count subtitle
 *
 * Pure presentational component — all state and callbacks come from
 * props. Lets LibrarySingleInspector stay closer to the K0 ≤28 KB
 * landing target by lifting ~140 LOC of JSX out.
 */
export default function LibraryInspectorTitleRow({
  item,
  activeTab,
  length,
  topology,
  regionCount,
  // Inline rename
  onRenameItem,
  // Settings popover trigger (Sequence tab)
  seqSettingsTriggerRef,
  seqSettingsOpen,
  onToggleSeqSettings,
  // Editable pill (Sequence tab)
  editable,
  toggleEditable,
  // Save flow (K7)
  saveFlow,
  // Selection counter
  cursorPos,
  cursorAnchor,
  cursorSelectionMode,
}) {
  const a = (typeof cursorAnchor === 'number' && Number.isFinite(cursorAnchor)) ? cursorAnchor : null;
  const f = (typeof cursorPos === 'number' && Number.isFinite(cursorPos)) ? cursorPos : null;
  const selectionBp = (a != null && f != null && a !== f) ? Math.abs(a - f) : 0;
  const showAa = cursorSelectionMode === 'aa';
  const selectionAa = showAa ? Math.floor(selectionBp / 3) : 0;
  return (
    <div
      data-testid="importer-single-title"
      style={{
        padding: '6px 14px 4px',
        borderBottom: '0.5px solid var(--border-subtle)',
        background: 'var(--surface-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineEditableTitle
            value={item.name || item._fileName || ''}
            onCommit={(name) => onRenameItem?.(name)}
          />
        </div>
        {/* ⚙ + READ-ONLY/EDITABLE pill — only visible while Sequence
            tab is active (Bug-rush #22; M-X.6 K6 toggle DEC-LIB-16 ⚓). */}
        {activeTab === 'sequence' && (
          <>
            <button
              ref={seqSettingsTriggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={seqSettingsOpen ? 'true' : 'false'}
              aria-label={S.sequenceView?.settingsButton || 'Display settings'}
              title={S.sequenceView?.settingsButton || 'Display settings'}
              data-testid="importer-sequence-view-settings-trigger"
              onClick={onToggleSeqSettings}
              style={{
                border: '0.5px solid var(--border-default)',
                background: 'var(--surface-1)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                padding: '2px 6px',
                borderRadius: 'var(--radius-md)',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >⚙</button>
            <button
              type="button"
              data-testid="importer-sequence-readonly-pill"
              data-mode={editable ? 'editable' : 'readonly'}
              onClick={toggleEditable}
              title={editable
                ? 'Кликните чтобы заблокировать (Read-only). Несохранённые правки останутся.'
                : 'Кликните чтобы разрешить ручное редактирование последовательности. Первая правка создаст новую ветку плазмиды (manual edit).'}
              aria-label={editable ? 'Switch to read-only' : 'Switch to editable'}
              style={{
                padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                background: editable
                  ? 'var(--accent-50, color-mix(in srgb, var(--accent-500) 18%, transparent))'
                  : 'var(--surface-2)',
                color: editable
                  ? 'var(--accent-700, #c2410c)'
                  : 'var(--text-secondary)',
                border: editable
                  ? '0.5px solid var(--accent-500)'
                  : '0.5px solid transparent',
                fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4,
                fontWeight: editable ? 600 : 400,
                flexShrink: 0, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {editable && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--accent-700, #c2410c)',
                    animation: 'editable-pulse 1.4s ease-in-out infinite',
                  }}
                />
              )}
              {editable ? (S.sequenceEditable || 'EDITABLE') : S.sequenceReadOnly}
            </button>
          </>
        )}
        {/* M-X.5 K7 Library Save Flow (DEC-LIB-13 ⚓). Mine entries
            with pending edits surface the two explicit Save buttons
            in the title row. Catalog / paste / file imports stay
            transient until biolog explicitly «В библиотеку». */}
        {saveFlow?.visible && (
          <LibrarySaveActions
            libraryEntryId={saveFlow.libraryEntryId}
            hasChanges={saveFlow.hasChanges}
            editedAnnotations={saveFlow.editedAnnotations}
            parentName={saveFlow.parentName}
            onAfterOverwrite={saveFlow.onAfterOverwrite}
            onAfterSaveAsVersion={saveFlow.onAfterSaveAsVersion}
          />
        )}
        {/* Live selection counter — bp always, aa appended in 'aa'
            selection mode (codon-aligned). Only renders for non-empty
            selection so the title row stays clean otherwise. */}
        {selectionBp > 0 && (
          <div
            data-testid="importer-selection-counter"
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-50, rgba(249, 115, 22, 0.12))',
              color: 'var(--accent-700, #c2410c)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {S.selectionCountBp(selectionBp)}{showAa ? ` · ${S.selectionCountAa(selectionAa)}` : ''}
          </div>
        )}
        <div
          style={{
            fontSize: 11, color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)', flexShrink: 0,
          }}
        >
          {length.toLocaleString()} bp · {topology}
          {regionCount > 0 && ` · ${S.summaryRegionCount(regionCount)}`}
        </div>
      </div>
    </div>
  );
}
