import { getRegions } from '../../annotation-model';
import MetaColumn from './MetaColumn';
import ActionsBar from './ActionsBar';
import SessionSummary from './SessionSummary';
import FileSummaryCard from './FileSummaryCard';
import { InlineEditableTitle } from './InlineEditableTitle';

/**
 * SingleInspector — right-pane inspector when one file/plasmid is selected.
 *
 * Layout (Sprint IS-Final K1):
 *   ┌─ title row (full width) ─────────────────────── ↻ замена ─┐
 *   │ name (inline-editable)                                    │
 *   │ subtitle: bp · topology · regions · sanitize summary      │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ [SessionSummary]                                         │
 *   │ ┌────────── grid [1fr_200px] ─────────┬─────────────────┐ │
 *   │ │ FileSummaryCard                     │ MetaColumn      │ │
 *   │ │                                     │  mini-map 160px │ │
 *   │ │                                     │  topology       │ │
 *   │ │                                     │  origin         │ │
 *   │ └─────────────────────────────────────┴─────────────────┘ │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ ActionsBar                                               │
 *   └──────────────────────────────────────────────────────────┘
 */
export default function SingleInspector({
  parsedItem,
  topology,
  onTopologyChange,
  originOffset,
  onOriginOffsetChange,
  onApplyOrigin,
  originHints,
  name,
  onNameChange,
  sanitizeReport,
  lastActionStatus,
  addedItems,
  onAction,
  onReplaceFile,
  onOpenCanvas,
  exportEnabled,
  hasParsedItem,
}) {
  if (!parsedItem) return null;

  const removed = sanitizeReport?.removed;
  const removedSummary = removed
    ? [
        removed.digits && `${removed.digits} цифр`,
        removed.whitespace && `${removed.whitespace} пробелов`,
        removed.punctuation && `${removed.punctuation} знаков`,
        removed.bom && `${removed.bom} BOM`,
        removed.other && `${removed.other} прочих`,
      ].filter(Boolean).join(', ')
    : '';

  const regionCount = parsedItem.annotations?.length
    ? getRegions(parsedItem.annotations).length
    : 0;
  const length = parsedItem.length || parsedItem.sequence?.length || 0;

  return (
    <div className="flex flex-col h-full" data-testid="single-inspector">
      {/* title row */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-3" data-testid="single-title-row">
        <div className="flex-1 min-w-0">
          <InlineEditableTitle
            value={name}
            onCommit={(next) => onNameChange?.(next)}
            placeholder="(без имени)"
          />
          <div className="text-xs text-gray-600 mt-0.5">
            {length.toLocaleString()} п.н. · {topology}
            {regionCount > 0 && <> · {regionCount} регионов</>}
          </div>
          {removedSummary && (
            <div className="text-[10px] italic text-gray-400" data-testid="single-sanitize-summary">
              убрано: {removedSummary}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onReplaceFile}
          className="self-start text-[11px] text-gray-400 hover:text-emerald-700 underline-offset-2 hover:underline cursor-pointer"
          data-testid="replace-file-link"
        >
          ↻ замена файла
        </button>
      </div>

      {/* main body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        <SessionSummary
          addedItems={addedItems}
          onOpenCanvas={onOpenCanvas}
        />
        <div className="grid grid-cols-[1fr_200px] gap-3 items-start">
          <FileSummaryCard parsedItem={parsedItem} />
          <MetaColumn
            length={length}
            topology={topology}
            onTopologyChange={onTopologyChange}
            originOffset={originOffset}
            onOriginOffsetChange={onOriginOffsetChange}
            onApplyOrigin={onApplyOrigin}
            originHints={originHints}
            annotations={parsedItem?.annotations || []}
            hasIUPAC={!!sanitizeReport?.hasIUPAC}
            iupacChars={sanitizeReport?.iupacChars || []}
            fromFileFeatures={parsedItem?._fromFileCount || 0}
            enrichedFeatures={parsedItem?._enrichedCount || 0}
            lastActionStatus={lastActionStatus}
            miniMapSize={160}
            miniMapMode="inline"
            miniMapName={parsedItem?.name || name}
          />
        </div>
      </div>

      {/* footer */}
      <div className="border-t border-gray-200 bg-white px-4">
        <ActionsBar
          mode="single"
          onAction={onAction}
          count={1}
          hasParsedItem={hasParsedItem}
          exportEnabled={exportEnabled}
        />
      </div>
    </div>
  );
}
