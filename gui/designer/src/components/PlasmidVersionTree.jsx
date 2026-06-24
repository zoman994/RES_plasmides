/**
 * PlasmidVersionTree — visual tree of Part derivation history.
 *
 * Shows parent→children lineage with derivation icons.
 * Click node → PlasmidViewer. Click edge → diff panel.
 */
import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { FEATURE_COLORS } from '../theme';
import { sequenceDiff } from '../sequence-diff';
import { Icon } from './icons/Icon';

const DERIV_ICONS = {
  mutation: '\uD83E\uDDEC', split: '\u2702\uFE0F', fusion: '\uD83D\uDD17',
  extract: '\uD83D\uDCE4', insertion: '\u2795', deletion: '\uD83D\uDDD1',
  intron_removal: '\uD83E\uDDA0', truncation: '\u2702\uFE0F',
};

const DERIV_LABELS = {
  mutation: 'Мутагенез', split: 'Разделение', fusion: 'Слияние',
  extract: 'Извлечение', insertion: 'Вставка', deletion: 'Делеция',
  intron_removal: 'Удаление интронов', truncation: 'Усечение',
};

/**
 * @param {Object} props
 * @param {string} props.partId — root Part ID to show tree for
 * @param {Function} props.onClose
 * @param {Function} [props.onViewPart] — (part) => open PlasmidViewer
 */
export default function PlasmidVersionTree({ partId, onClose, onViewPart }) {
  const parts = useStore(s => s.parts);
  const [diffPair, setDiffPair] = useState(null); // { parent, child }
  const [expanded, setExpanded] = useState(new Set());

  // Find root: walk up parentId chain
  const root = useMemo(() => {
    let current = parts.find(p => p.id === partId);
    if (!current) return null;
    while (current.parentId) {
      const parent = parts.find(p => p.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  }, [parts, partId]);

  // Build tree nodes recursively
  const buildTree = (part, depth = 0) => {
    if (!part) return null;
    const children = parts.filter(p => p.parentId === part.id || (p.parentIds && p.parentIds.includes(part.id)));
    return { part, depth, children: children.map(c => buildTree(c, depth + 1)).filter(Boolean) };
  };

  const tree = useMemo(() => root ? buildTree(root) : null, [root, parts]);

  // Diff computation
  const diff = useMemo(() => {
    if (!diffPair) return null;
    return sequenceDiff(diffPair.parent.sequence || '', diffPair.child.sequence || '');
  }, [diffPair]);

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Render tree node ──
  const renderNode = (node, isLast = true) => {
    if (!node) return null;
    const { part, depth, children } = node;
    const hasChildren = children.length > 0;
    const isExp = expanded.has(part.id) || depth === 0; // root always expanded
    const derivType = part.derivation?.type;
    const icon = DERIV_ICONS[derivType] || '';
    const color = FEATURE_COLORS[part.type] || ANNOTATION_COLORS[part.type] || '#999';
    const isSelected = diffPair?.child?.id === part.id || diffPair?.parent?.id === part.id;

    return (
      <div key={part.id}>
        <div className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-gray-50 transition
          ${isSelected ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
          style={{ marginLeft: depth * 20 }}>

          {/* Tree connector */}
          {depth > 0 && (
            <span className="text-gray-300 font-mono text-[10px] w-5 shrink-0 select-none">
              {isLast ? '└─' : '├─'}
            </span>
          )}

          {/* Derivation icon */}
          {icon && <span className="text-[11px] shrink-0" title={DERIV_LABELS[derivType]}>{icon}</span>}

          {/* Expand toggle */}
          {hasChildren ? (
            <button onClick={() => toggleExpand(part.id)}
              className="text-gray-400 w-3 shrink-0 inline-flex items-center justify-center">
              <Icon name={isExp ? 'chevron-down' : 'chevron-right'} size={10} />
            </button>
          ) : <span className="w-3 shrink-0" />}

          {/* Name + info */}
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-medium text-gray-800 truncate flex-1 cursor-pointer"
            onClick={() => onViewPart?.(part)}
            title="Открыть в просмотрщике">
            {part.name}
          </span>
          <span className="text-[10px] text-gray-400 shrink-0">{part.length || (part.sequence || '').length} п.н.</span>

          {/* Diff button (for non-root nodes) */}
          {part.parentId && (
            <button onClick={e => {
              e.stopPropagation();
              const parent = parts.find(p => p.id === part.parentId);
              if (parent) setDiffPair(diffPair?.child?.id === part.id ? null : { parent, child: part });
            }}
              className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0
                ${diffPair?.child?.id === part.id ? 'bg-blue-100 text-blue-700 border-blue-300' : 'text-gray-400 border-gray-200 hover:bg-gray-100'}`}
              title="Показать diff с родителем">
              diff
            </button>
          )}

          {/* Source label */}
          {derivType && (
            <span className="text-[8px] px-1 py-px rounded bg-gray-100 text-gray-400 shrink-0">
              {DERIV_LABELS[derivType] || derivType}
            </span>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExp && children.map((child, ci) =>
          renderNode(child, ci === children.length - 1)
        )}
      </div>
    );
  };

  if (!root) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-xl p-6 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="text-gray-400 text-sm">Part не найден</div>
          <button onClick={onClose} className="mt-3 text-xs px-3 py-1.5 border rounded">Закрыть</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 bg-black/40" onClick={onClose}>
      <div className="w-[700px] max-h-[80vh] bg-white rounded-xl shadow-2xl border overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h3 className="text-sm font-bold text-gray-700">
            <Icon name="branch" size={14} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> История версий — {root.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 inline-flex"><Icon name="close" size={16} /></button>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderNode(tree)}
        </div>

        {/* Diff panel */}
        {diff && diffPair && (
          <div className="border-t max-h-[35vh] overflow-y-auto p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600">
                Diff: {diffPair.parent.name} → {diffPair.child.name}
              </span>
              <button onClick={() => setDiffPair(null)} className="text-gray-400 hover:text-gray-600 inline-flex"><Icon name="close" size={13} /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-gray-400 text-[9px] uppercase mb-1">Длина</div>
                <div>{diff.lengthDelta === 0
                  ? `${diff.parentLen} п.н. (без изменений)`
                  : `${diff.parentLen} → ${diff.childLen} п.н. (${diff.lengthDelta > 0 ? '+' : ''}${diff.lengthDelta})`
                }</div>
              </div>
              <div>
                <div className="text-gray-400 text-[9px] uppercase mb-1">GC%</div>
                <div>{diff.parentGC}% → {diff.childGC}% ({diff.gcDelta > 0 ? '+' : ''}{diff.gcDelta}%)</div>
              </div>
            </div>

            {diff.substitutions.length > 0 && (
              <div className="mt-2">
                <div className="text-gray-400 text-[9px] uppercase mb-1">Нуклеотидные замены ({diff.substitutions.length})</div>
                <div className="space-y-0.5 max-h-[80px] overflow-y-auto">
                  {diff.substitutions.slice(0, 20).map((s, i) => (
                    <div key={i} className="text-[10px] font-mono text-gray-600">
                      поз. {s.pos + 1}: <span className="text-red-500">{s.from}</span> → <span className="text-green-600">{s.to}</span>
                    </div>
                  ))}
                  {diff.substitutions.length > 20 && (
                    <div className="text-[10px] text-gray-400">...и ещё {diff.substitutions.length - 20}</div>
                  )}
                </div>
              </div>
            )}

            {diff.lengthDelta !== 0 && (
              <div className="mt-2 text-[10px] text-gray-500">
                <Icon name="info" size={11} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> Последовательности разной длины — показаны только позиционные замены в общем префиксе
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t shrink-0">
          <button onClick={onClose} className="text-xs px-4 py-1.5 border rounded hover:bg-gray-100">Закрыть</button>
        </div>
      </div>
    </div>
  );
}
