import PlasmidMiniMap from '../PlasmidMiniMap';

/**
 * MetaColumn — fixed 280 px right-side column shown when parsedItems.length === 1.
 * Holds:
 *   - PlasmidMiniMap 180 px
 *   - Topology toggle (◯ / —)
 *   - Origin-offset input (visible only when topology === 'circular')
 *   - Compact info-card (Из файла / Дополнено / lastActionStatus) — hides when empty
 *   - IUPAC warning card (if hasIUPAC)
 *
 * Polish §2/§5: name input + длина/регионов rows removed — title row
 * (inline-editable in index.jsx) and subtitle now own that data.
 */
export default function MetaColumn({
  length,
  topology,
  onTopologyChange,
  originOffset,
  onOriginOffsetChange,
  onApplyOrigin,
  originHints = '',
  annotations = [],
  hasIUPAC,
  iupacChars = [],
  fromFileFeatures = 0,
  enrichedFeatures = 0,
  lastActionStatus = null,
  miniMapSize = 180,
}) {
  const isCircular = topology === 'circular';
  const showInfoCard = fromFileFeatures > 0 || enrichedFeatures > 0 || !!lastActionStatus;

  return (
    <div className="flex flex-col gap-2.5">
      {/* mini-map */}
      <div className="flex items-center justify-center bg-amber-50/40 border border-gray-200 rounded p-3">
        <PlasmidMiniMap
          length={length}
          topology={topology}
          annotations={annotations}
          size={miniMapSize}
        />
      </div>

      {/* topology toggle */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">топология</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onTopologyChange?.('circular')}
            className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm transition ${
              isCircular
                ? 'bg-emerald-50 border-emerald-600 text-emerald-700 font-bold'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
            title="круглая"
            aria-label="circular"
            aria-pressed={isCircular}
          >
            ◯
          </button>
          <button
            type="button"
            onClick={() => onTopologyChange?.('linear')}
            className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm transition ${
              !isCircular
                ? 'bg-emerald-50 border-emerald-600 text-emerald-700 font-bold'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
            title="линейная"
            aria-label="linear"
            aria-pressed={!isCircular}
          >
            —
          </button>
        </div>
      </div>

      {/* origin offset (circular only) — V47 vertical stack: input row + button row */}
      {isCircular && (
        <div className="bg-white border border-gray-200 rounded px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-gray-500 flex-1">начало (п.н.)</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, length || 1)}
              value={originOffset}
              onChange={(e) => onOriginOffsetChange?.(Number(e.target.value) || 1)}
              className="w-20 text-xs px-2 py-1 border border-gray-200 rounded text-right font-mono"
              data-testid="origin-offset-input"
            />
          </div>
          <button
            type="button"
            onClick={onApplyOrigin}
            disabled={!originOffset || originOffset === 1}
            className="w-full text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Применить ротацию"
          >
            ↻ применить
          </button>
          {originHints && (
            <div className="text-[10px] text-gray-400 italic leading-snug">
              межгенные участки: {originHints}
            </div>
          )}
        </div>
      )}

      {/* info card — Polish §5: длина/регионов rows removed, hidden if all empty */}
      {showInfoCard && (
        <div className="bg-amber-50/40 border border-gray-200 rounded px-3 py-2 text-xs space-y-1">
          {fromFileFeatures > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Из файла</span>
              <span className="font-medium text-gray-800">{fromFileFeatures}</span>
            </div>
          )}
          {enrichedFeatures > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Дополнено</span>
              <span className="font-medium text-emerald-700">+{enrichedFeatures}</span>
            </div>
          )}
          {lastActionStatus && (
            <div
              className="mt-1 pt-1 border-t border-emerald-200 text-emerald-700 font-medium"
              data-testid="meta-last-action-status"
            >
              {lastActionStatus.type === 'canvas' && '✓ Добавлено на канвас'}
              {lastActionStatus.type === 'library' && '✓ В библиотеке'}
              {lastActionStatus.type === 'annotate' && (
                <>
                  ✓ +{Math.max(0, lastActionStatus.regionsAfter - lastActionStatus.regionsBefore)} регионов аннотированы (
                  {lastActionStatus.regionsBefore} → {lastActionStatus.regionsAfter})
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* IUPAC warning */}
      {hasIUPAC && iupacChars.length > 0 && (
        <div
          className="border border-amber-400 bg-amber-50 rounded px-3 py-2 text-[11px] text-amber-800 leading-snug"
          data-testid="iupac-warning"
        >
          Содержит IUPAC: {iupacChars.join(', ')} — праймеры по таким участкам
          не дизайнятся, программа предупредит при сборке.
        </div>
      )}
    </div>
  );
}
