/**
 * RacetrackView — stadium-shaped canvas for circular constructs.
 *
 * Fragments sit on an elliptical track. Junctions are Bezier curves.
 * Miro-flow interaction: + on free block ends, real JunctionBlock between blocks.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { computeRacetrackLayout } from '../racetrack-layout';
import PartBlock from './PartBlock';
import JunctionBlock from './JunctionBlock';
import JunctionDNA from './JunctionDNA';
import ConnectorDropdown from './ConnectorDropdown';
import { getFragColor, isMarker } from '../theme';

const JUNCTION_COLORS = {
  overlap: '#94A3B8',
  golden_gate: '#22C55E',
  restriction: '#F97316',
  kld: '#A855F7',
};

/* ─── PlusButton: small + circle on block edge ─── */
function PlusButton({ side, onClick }) {
  const style = side === 'left'
    ? { left: -24, top: '50%', transform: 'translateY(-50%)' }
    : { right: -24, top: '50%', transform: 'translateY(-50%)' };

  return (
    <div className="absolute w-5 h-5 rounded-full bg-white border-2 border-gray-300
      hover:border-blue-500 hover:bg-blue-50 hover:scale-125
      flex items-center justify-center cursor-pointer transition-all z-10"
      style={style} onClick={e => { e.stopPropagation(); onClick(e); }}>
      <svg width="10" height="10" viewBox="0 0 12 12">
        <line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" strokeWidth="1.5" />
        <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/* ─── RacetrackView ─── */
export default function RacetrackView({
  fragments, junctions: junctionConfigs = [], primers = [],
  circular, constructName, totalBp, zoom = 100,
  parts, allOverhangs, calculated,
  onRemove, onFlip, onEditFragment, onToggleAmplification,
  onReorder, onSplitSignal, onSwapVariant,
  onInsertAt, onImportFile, onJunctionChange,
}) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 400 });
  const [connectorMenu, setConnectorMenu] = useState(null);

  // ResizeObserver for responsive layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => computeRacetrackLayout(fragments, size),
    [fragments, size],
  );

  const n = fragments.length;
  const scale = zoom / 100;

  return (
    <div ref={containerRef}
      className="flex-1 relative overflow-hidden min-h-0"
      onClick={() => setConnectorMenu(null)}>
      <div className="w-full h-full relative" style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>

        {/* ═══ SVG Layer: junction curves ═══ */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          {layout.junctions.map((j, i) => {
            const jType = junctionConfigs[i]?.type || 'overlap';
            const color = JUNCTION_COLORS[jType] || '#94A3B8';
            return (
              <path key={i} d={j.path}
                fill="none" stroke={color} strokeWidth="2.5"
                strokeDasharray="6 4" opacity="0.75" />
            );
          })}
        </svg>

        {/* ═══ Center label ═══ */}
        <div className="absolute flex flex-col items-center justify-center pointer-events-none select-none"
          style={{
            left: layout.center.x - 80, top: layout.center.y - 20,
            width: 160, height: 40, zIndex: 0,
          }}>
          <div className="text-sm font-semibold text-gray-700 truncate max-w-full">
            {constructName || 'Сборка'}
          </div>
          <div className="text-[10px] text-gray-400">
            {totalBp ? `${(totalBp / 1000).toFixed(1)} kb` : ''} {circular ? 'circular' : 'linear'}
          </div>
        </div>

        {/* ═══ HTML Layer: PartBlocks with PlusButtons ═══ */}
        {layout.blocks.map((block, i) => {
          const frag = fragments[i];
          if (!frag) return null;

          const hasJunctionBefore = i > 0 || circular;
          const hasJunctionAfter = i < n - 1 || circular;

          return (
            <div key={frag.id || i}
              className="absolute transition-all duration-300"
              style={{ left: block.x, top: block.y, width: block.w, height: block.h, zIndex: 1 }}>

              {/* + LEFT (free end only) */}
              {!hasJunctionBefore && (
                <PlusButton side="left" onClick={e => {
                  e.stopPropagation();
                  setConnectorMenu({ afterIdx: i - 1, position: { x: e.clientX, y: e.clientY } });
                }} />
              )}

              <PartBlock
                fragment={frag}
                index={i}
                compact={true}
                fragmentCount={n}
                onRemove={onRemove}
                onFlip={onFlip}
                onEditFragment={onEditFragment}
                onToggleAmplification={onToggleAmplification}
                onReorder={onReorder}
                onSplitSignal={onSplitSignal}
                onSwapVariant={onSwapVariant}
              />

              {/* + RIGHT (free end only) */}
              {!hasJunctionAfter && (
                <PlusButton side="right" onClick={e => {
                  e.stopPropagation();
                  setConnectorMenu({ afterIdx: i, position: { x: e.clientX, y: e.clientY } });
                }} />
              )}
            </div>
          );
        })}

        {/* ═══ Real JunctionBlocks between connected blocks ═══ */}
        {layout.junctions.map((j, i) => {
          const jConfig = junctionConfigs[i];
          if (!jConfig) return null;

          const leftFrag = fragments[i];
          const rightFrag = fragments[(i + 1) % n];

          return (
            <div key={`junc-${i}`}
              className="absolute group"
              style={{
                left: j.connX - 42,
                top: j.connY - 22,
                zIndex: 5,
              }}>

              {/* Real JunctionBlock — same as blocks view */}
              <JunctionBlock
                junction={jConfig}
                index={i}
                leftName={leftFrag?.name || '?'}
                rightName={rightFrag?.name || '?'}
                leftFrag={leftFrag}
                rightFrag={rightFrag}
                leftPCR={leftFrag?.needsAmplification !== false}
                rightPCR={rightFrag?.needsAmplification !== false}
                onChange={cfg => onJunctionChange?.(i, cfg)}
                allOverhangs={allOverhangs}
                fragmentCount={n}
              />

              {/* JunctionDNA — inline details panel */}
              <JunctionDNA junction={jConfig} calculated={calculated}
                primers={primers}
                leftFragment={leftFrag} rightFragment={rightFrag} />

              {/* Small + for insert-between (hover only) */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2
                w-4 h-4 rounded-full bg-white border border-gray-300
                flex items-center justify-center cursor-pointer
                opacity-0 group-hover:opacity-100 transition-opacity text-[8px] text-gray-500
                hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 z-10"
                onClick={e => {
                  e.stopPropagation();
                  setConnectorMenu({ afterIdx: i, position: { x: e.clientX, y: e.clientY } });
                }}
                title="Вставить элемент между">
                +
              </div>
            </div>
          );
        })}

        {/* ═══ ConnectorDropdown (Miro-style insert) ═══ */}
        {connectorMenu && (
          <ConnectorDropdown
            position={connectorMenu.position}
            afterIdx={connectorMenu.afterIdx}
            parts={parts}
            onInsert={(afterIdx, part) => { onInsertAt?.(afterIdx, part); setConnectorMenu(null); }}
            onClose={() => setConnectorMenu(null)}
            onImport={onImportFile}
          />
        )}
      </div>
    </div>
  );
}
