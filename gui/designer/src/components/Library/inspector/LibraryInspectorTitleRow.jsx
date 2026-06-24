import { STRINGS } from '../../../lib/strings';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import InlineEditableTitle from './InlineEditableTitle';
import LibrarySaveActions from './LibrarySaveActions';
import { Icon } from '../../icons/Icon';

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
  // Save flow (version-only «Сохранить версию» + «что изменено»)
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
        {/* ⚙ «Вид» — UX_DIRECTION фаза 3 (настройки): всегда в шапке инспектора
            ради стабильной раскладки + находимости (раньше прыгал — был только
            на вкладке Sequence). Вне «Последовательности» — disabled (настройки
            вида осмысленны только над сиквенсом). Gated → flag off возвращает
            старое поведение (gear только на Sequence). */}
        {(FEATURE_FLAGS.viewGearAlwaysVisible || activeTab === 'sequence') && (
          <button
            ref={seqSettingsTriggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={seqSettingsOpen ? 'true' : 'false'}
            aria-disabled={activeTab === 'sequence' ? undefined : 'true'}
            aria-label="Настройки вида"
            title={activeTab === 'sequence'
              ? 'Настройки вида'
              : 'Настройки вида — на вкладке «Последовательность»'}
            data-testid="importer-sequence-view-settings-trigger"
            data-gear-active={activeTab === 'sequence' ? 'true' : 'false'}
            onClick={activeTab === 'sequence' ? onToggleSeqSettings : undefined}
            style={{
              border: '0.5px solid var(--border-default)',
              background: 'var(--surface-1)',
              color: 'var(--text-secondary)',
              cursor: activeTab === 'sequence' ? 'pointer' : 'default',
              opacity: activeTab === 'sequence' ? 1 : 0.4,
              fontSize: 12,
              padding: '2px 6px',
              borderRadius: 'var(--radius-md)',
              lineHeight: 1,
              flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><Icon name="settings" size={14} /></button>
        )}
        {/* Library Save Flow — version-only «Сохранить версию» + «что
            изменено» (Игорь 17.06.2026, как в выравнивании). Visible on
            library entries once there are unsaved edits. */}
        {saveFlow?.visible && (
          <LibrarySaveActions
            libraryEntryId={saveFlow.libraryEntryId}
            hasChanges={saveFlow.hasChanges}
            editedSequence={saveFlow.editedSequence}
            editedAnnotations={saveFlow.editedAnnotations}
            changesSummary={saveFlow.changesSummary}
            changeText={saveFlow.changeText}
            parentName={saveFlow.parentName}
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
