/**
 * SessionSummary — accumulating list of items that the biolog has acted on
 * during the current ImportStartScreen session (single-file mode).
 *
 * Each item carries: { name, action, miniMapData?, regionsCount? }.
 * Action badges: ✓ Канвас (green), 📚 Библиотека (purple), 🏷 +N регионов
 * (orange). When at least one item.action === 'canvas', a top-right
 * «Открыть холст →» button surfaces — clicking closes the modal and brings
 * focus to the canvas.
 *
 * Renders nothing when addedItems is empty.
 */
import PlasmidMiniMap from '../PlasmidMiniMap';

function badge(action, regionsAdded) {
  if (action === 'canvas') {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ Канвас</span>;
  }
  if (action === 'library') {
    return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">📚 Библиотека</span>;
  }
  if (action === 'annotate') {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
        🏷 +{regionsAdded ?? 0} регионов
      </span>
    );
  }
  return null;
}

export default function SessionSummary({ addedItems = [], onOpenCanvas }) {
  if (!addedItems.length) return null;
  const hasCanvas = addedItems.some((i) => i.action === 'canvas');

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3" data-testid="session-summary">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
          ✓ Уже добавлено в этой сессии
        </span>
        {hasCanvas && (
          <button
            onClick={onOpenCanvas}
            className="text-[11px] px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
            data-testid="session-summary-open-canvas"
          >
            Открыть холст →
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {addedItems.map((it, idx) => (
          <li key={`${it.name}-${idx}`} className="flex items-center gap-2 text-xs text-gray-700">
            <span className="shrink-0">
              <PlasmidMiniMap
                length={it.miniMapData?.length || 0}
                topology={it.miniMapData?.topology || 'linear'}
                annotations={it.miniMapData?.annotations || []}
                size={32}
              />
            </span>
            <span className="font-semibold flex-1 truncate" title={it.name}>{it.name}</span>
            {badge(it.action, it.regionsAdded)}
          </li>
        ))}
      </ul>
    </div>
  );
}
