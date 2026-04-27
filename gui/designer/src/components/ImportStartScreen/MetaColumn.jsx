import PlasmidMiniMap from '../PlasmidMiniMap';
import { getRegions } from '../../annotation-model';

/**
 * MetaColumn — fixed 280 px right-side column shown when parsedItems.length === 1.
 * Holds:
 *   - PlasmidMiniMap 180 px
 *   - Topology toggle (◯ / —)
 *   - Origin-offset input (visible only when topology === 'circular')
 *   - Name input
 *   - Info card (length / features count / sanitize report)
 *   - IUPAC warning card (if hasIUPAC)
 */
export default function MetaColumn({
  length,
  topology,
  onTopologyChange,
  originOffset,
  onOriginOffsetChange,
  onApplyOrigin,
  originHints = '',
  name,
  onNameChange,
  annotations = [],
  sanitizeReport,
  hasIUPAC,
  iupacChars = [],
  fromFileFeatures = 0,
  enrichedFeatures = 0,
  lastActionStatus = null,
}) {
  const regions = getRegions(annotations);
  const isCircular = topology === 'circular';

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

  return (
    <div className="flex flex-col gap-2.5">
      {/* mini-map */}
      <div className="flex items-center justify-center bg-amber-50/40 border border-gray-200 rounded p-3">
        <PlasmidMiniMap
          length={length}
          topology={topology}
          annotations={annotations}
          size={180}
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

      {/* origin offset (circular only) */}
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
            <button
              type="button"
              onClick={onApplyOrigin}
              disabled={!originOffset || originOffset === 1}
              className="text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Применить ротацию"
            >
              ↻ применить
            </button>
          </div>
          {originHints && (
            <div className="text-[10px] text-gray-400 italic leading-snug">
              межгенные участки: {originHints}
            </div>
          )}
        </div>
      )}

      {/* name */}
      <div className="bg-white border border-gray-200 rounded px-3 py-2">
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">имя</label>
        <input
          type="text"
          value={name || ''}
          onChange={(e) => onNameChange?.(e.target.value)}
          placeholder="part_1"
          className="w-full text-sm px-2 py-1 border border-gray-200 rounded outline-none focus:border-emerald-600"
          data-testid="meta-name-input"
        />
        {!name && (
          <div className="text-[10px] text-gray-400 italic mt-1">
            пусто → присвоится part_N автоматически
          </div>
        )}
        {removedSummary && (
          <div className="text-[10px] text-gray-400 italic mt-1">убрано: {removedSummary}</div>
        )}
      </div>

      {/* info card */}
      <div className="bg-amber-50/40 border border-gray-200 rounded px-3 py-2 text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">Длина</span>
          <span className="font-medium text-gray-800">{(length || 0).toLocaleString()} п.н.</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Регионов</span>
          <span className="font-medium text-gray-800">{regions.length}</span>
        </div>
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
