/**
 * PlasmidNode — custom ReactFlow node for plasmids on Project Flow canvas.
 *
 * Collapsed: card with topology icon, name, size, region count.
 * Expanded: mini-racetrack SVG (reuses computeRacetrackLayout).
 *
 * Double-click: if part has assembly -> Construct View; else -> PlasmidViewer.
 */
import { useState, memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useStore } from '../../store';
import { getRegions } from '../../annotation-model';
import { SBOLIcon } from '../../sbol-glyphs';
import { computeRacetrackLayout } from '../../racetrack-layout';
import { getFragColor } from '../../theme';
import SubFragmentBar from '../SubFragmentBar';

const MINI_W = 160;
const MINI_H = 100;

/* ─── MiniRacetrack: simplified SVG ─── */
function MiniRacetrack({ regions, part }) {
  if (!regions.length) return null;

  const pseudoFragments = regions.map(r => ({
    name: r.name || r.type,
    length: (r.end || 0) - (r.start || 0) || 100,
    type: r.type,
  }));

  const layout = computeRacetrackLayout(pseudoFragments, { width: MINI_W, height: MINI_H });

  return (
    <svg width={MINI_W} height={MINI_H} className="mt-1">
      {/* Ellipse guide */}
      <ellipse cx={layout.center.x} cy={layout.center.y}
        rx={layout.center.rx} ry={layout.center.ry}
        fill="none" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3" />
      {/* Junction curves */}
      {layout.junctions.map((j, i) => (
        <path key={`j-${i}`} d={j.path}
          fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.5" />
      ))}
      {/* Fragment blocks */}
      {layout.blocks.map((b, i) => {
        const color = getFragColor(pseudoFragments[i]?.type, i);
        return (
          <g key={`b-${i}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h}
              rx="4" fill={`${color}25`} stroke={color} strokeWidth="1.2" />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3}
              textAnchor="middle" fontSize="8" fill="#374151" className="select-none">
              {(pseudoFragments[i]?.name || '').slice(0, 8)}
            </text>
          </g>
        );
      })}
      {/* Center label */}
      <text x={layout.center.x} y={layout.center.y + 3}
        textAnchor="middle" fontSize="9" fontWeight="600" fill="#6b7280" className="select-none">
        {part.name?.slice(0, 12)}
      </text>
    </svg>
  );
}

/* ─── PlasmidNode ─── */
function PlasmidNode({ id, data }) {
  const part = useStore(s => s.parts.find(p => p.id === data.partId));
  const assemblies = useStore(s => s.assemblies);
  const switchAssembly = useStore(s => s.switchAssembly);
  const setProjectView = useStore(s => s.setProjectView);
  const setViewerPart = useStore(s => s.setViewerPart);
  const addFlowPCR = useStore(s => s.addFlowPCR);
  const addFlowAssembly = useStore(s => s.addFlowAssembly);
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  if (!part) {
    return (
      <div className="bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-xs text-red-600">
        <Handle type="target" position={Position.Left} />
        Part not found
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  const regions = getRegions(part.annotations || []);
  const sizeKb = ((part.length || 0) / 1000).toFixed(1);
  const topology = part.topology || 'linear';
  const isCircular = topology === 'circular';

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    // Find assembly that uses this part
    const asm = assemblies.find(a =>
      a.fragments?.some(f => f.partId === data.partId || f.id === data.partId)
    );
    if (asm) {
      switchAssembly(asm.id);
      setProjectView('construct');
    } else {
      // Source plasmid — open PlasmidViewer (read-only)
      setViewerPart(part);
    }
  };

  const handleClick = () => {
    setExpanded(v => !v);
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      className="bg-white border-2 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer select-none"
      style={{
        borderColor: isCircular ? '#3b82f6' : '#94a3b8',
        minWidth: expanded ? MINI_W + 24 : 140,
      }}>
      <Handle type="target" position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-blue-400 !border-white !border-2" />

      <div className="px-3 py-2">
        {/* Header */}
        <div className="flex items-center gap-1.5">
          <span className="text-base" title={topology}>
            {isCircular ? '\u25CB' : '\u2500'}
          </span>
          <span className="text-sm font-semibold text-gray-800 truncate max-w-[120px]">
            {part.name}
          </span>
        </div>

        {/* Info line */}
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
          <span>{sizeKb} kb</span>
          <span>{topology}</span>
          {regions.length > 0 && <span>{regions.length} reg.</span>}
        </div>

        {/* Region badges (collapsed) */}
        {!expanded && regions.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {regions.slice(0, 4).map((r, i) => (
              <span key={i} className="text-[8px] px-1 py-px rounded bg-blue-50 text-blue-600 truncate max-w-[60px]">
                {r.name || r.type}
              </span>
            ))}
            {regions.length > 4 && (
              <span className="text-[8px] px-1 py-px rounded bg-gray-100 text-gray-500">
                +{regions.length - 4}
              </span>
            )}
          </div>
        )}

        {/* SubFragmentBar (collapsed, assembled parts only) */}
        {!expanded && part.subFragments?.length > 0 && (
          <>
            <SubFragmentBar subFragments={part.subFragments} height={8} className="mt-1" />
            <div className="text-[8px] text-gray-400 mt-0.5">
              {part.assemblyMethod || 'assembled'} · {part.subFragments.length} frags
            </div>
          </>
        )}

        {/* Mini-racetrack (expanded) */}
        {expanded && isCircular && (
          <MiniRacetrack regions={regions} part={part} />
        )}

        {/* Region list for expanded linear */}
        {expanded && !isCircular && regions.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {regions.map((r, i) => (
              <div key={i} className="flex items-center gap-1 text-[9px]">
                <SBOLIcon type={r.type} size={10} color={getFragColor(r.type, i)} />
                <span className="text-gray-700 truncate">{r.name || r.type}</span>
                <span className="text-gray-400 ml-auto">{(r.end - r.start)} bp</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MIRO+ source handle with dropdown */}
      <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-20"
        onMouseEnter={() => setShowMenu(true)}
        onMouseLeave={() => { setShowMenu(false); setShowDropdown(false); }}>
        <Handle type="source" position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-blue-400 !border-white !border-2" />
        {/* Invisible bridge to prevent gap between handle and menu */}
        {showMenu && <div className="absolute left-full top-0 w-2 h-full" />}

        {/* + indicator on hover */}
        {showMenu && !showDropdown && (
          <div className="absolute left-full ml-1 top-1/2 -translate-y-1/2
            w-4 h-4 rounded-full bg-blue-500 text-white text-[10px]
            flex items-center justify-center cursor-pointer shadow"
            onClick={(e) => { e.stopPropagation(); setShowDropdown(true); }}>
            +
          </div>
        )}

        {/* Dropdown menu */}
        {showDropdown && (
          <div className="absolute left-full ml-1 top-1/2 -translate-y-1/2
            bg-white border rounded-lg shadow-lg py-1 min-w-[190px] z-50"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-1.5 text-xs hover:bg-teal-50 cursor-pointer"
              onClick={() => { addFlowPCR(id); setShowDropdown(false); setShowMenu(false); }}>
              🧪 ПЦР из этого фрагмента
            </div>
            <div className="border-t my-0.5" />
            <div className="px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'gibson'); setShowDropdown(false); setShowMenu(false); }}>
              ⚗️ Gibson Assembly
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-green-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'golden_gate'); setShowDropdown(false); setShowMenu(false); }}>
              🔶 Golden Gate Assembly
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-orange-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 're_ligation'); setShowDropdown(false); setShowMenu(false); }}>
              ✂️ RE Лигирование
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-purple-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'kld'); setShowDropdown(false); setShowMenu(false); }}>
              🔄 KLD
            </div>
            <div className="px-3 py-1.5 text-xs hover:bg-yellow-50 cursor-pointer"
              onClick={() => { addFlowAssembly(id, 'ligation'); setShowDropdown(false); setShowMenu(false); }}>
              🔗 Лигирование
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PlasmidNode);
