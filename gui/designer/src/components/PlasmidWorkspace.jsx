/**
 * PlasmidWorkspace — multi-pane Map view wrapper (Sprint Map-WS-1).
 *
 * Thin layout + shared-state layer above the existing <PlasmidMap>:
 *   ┌──────────────────────────────┐
 *   │  PlasmidMap  (top pane)      │
 *   │                              │
 *   ├──── splitter (ns-resize) ────┤
 *   │  SequencePane (bottom pane)  │
 *   └──────────────────────────────┘
 *
 * State `selectedRegionId` synchronises the cursor between both panes:
 *   - click a subarc on the map → bottom pane scrolls the region into view
 *   - click a nucleotide in the pane → same region id highlights on the map
 *
 * Bottom-pane height persists in localStorage under `plasmid-workspace-bottom-h`.
 *
 * PlasmidMap props are forwarded 1:1 — its internal popup (remove/flip/split/edit)
 * keeps working. Map-WS-2 will layer inline mutations on top of SequencePane.
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import PlasmidMap from './PlasmidMap';
import SequencePane from './SequencePane';
import { getRegions } from '../annotation-model';

const STORAGE_KEY = 'plasmid-workspace-bottom-h';
const MIN_PANE = 100;

export default function PlasmidWorkspace({
  fragments,
  constructName,
  totalBp,
  junctions = [],
  primers = [],
  onRemove,
  onFlip,
  onSplitSignal,
  onEditFragment,
}) {
  const containerRef = useRef(null);
  const dragging = useRef(false);

  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [bottomHeight, setBottomHeight] = useState(() => {
    const saved = Number(typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : 0);
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  });

  // Fragment offsets + regions grouped by fragment — fallback path for
  // PlasmidMap `onSelectFragment(i)` when a fragment is clicked on a region-less
  // arc (single solid arc). We pick the fragment's first region as the target.
  // `getRegions` normalises id for annotations that arrive without one
  // (whole-plasmid imports, legacy projects) so frs[0].id is always defined.
  const { regionsByFragment } = useMemo(() => {
    const list = fragments || [];
    const byFragment = [];
    let offset = 0;
    for (const f of list) {
      const fragLen = (f?.sequence || '').length || f?.length || 0;
      const rs = getRegions(f?.annotations).filter(a => typeof a.start === 'number');
      byFragment.push(rs.map(r => ({ ...r, start: r.start + offset, end: r.end + offset })));
      offset += fragLen;
    }
    return { regionsByFragment: byFragment };
  }, [fragments]);

  // Initial bottom height = 40% of container on first mount.
  useEffect(() => {
    if (bottomHeight || !containerRef.current) return;
    const h = Math.round(containerRef.current.offsetHeight * 0.4);
    if (h > 0) setBottomHeight(Math.max(MIN_PANE, h));
  }, [bottomHeight]);

  // Persist bottom height on change (clamped by the drag handler already).
  useEffect(() => {
    if (bottomHeight && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(bottomHeight));
    }
  }, [bottomHeight]);

  // Global mouse listeners so drag survives the cursor leaving the splitter.
  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newH = Math.max(MIN_PANE, Math.min(rect.height - MIN_PANE, rect.bottom - e.clientY));
      setBottomHeight(newH);
    };
    const onUp = () => { dragging.current = false; document.body.style.cursor = ''; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onSplitterDown = useCallback((e) => {
    dragging.current = true;
    document.body.style.cursor = 'ns-resize';
    e.preventDefault();
  }, []);

  // Fallback for fragment-level arc click (no sub-arcs): jump to the fragment's
  // first region. If the fragment has no regions, clear the selection.
  const onMapFragmentFallback = useCallback((i) => {
    const frs = regionsByFragment[i];
    if (!frs || !frs.length) {
      setSelectedRegionId(null);
      return;
    }
    const targetId = frs[0].id;
    setSelectedRegionId(prev => (prev === targetId ? null : targetId));
  }, [regionsByFragment]);

  // Sub-arc click → region id directly (toggled inside PlasmidMap when id known).
  const onMapRegionSelect = useCallback((id) => {
    setSelectedRegionId(id);
  }, []);

  // Sequence pane click → region id directly (component already toggles).
  const onSequenceSelect = useCallback((id) => {
    setSelectedRegionId(id);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full overflow-hidden"
      data-testid="plasmid-workspace"
    >
      {/* Top pane — PlasmidMap unchanged, just forward all props. */}
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <PlasmidMap
          fragments={fragments}
          constructName={constructName}
          totalBp={totalBp}
          junctions={junctions}
          primers={primers}
          selectedRegionId={selectedRegionId}
          onSelectRegion={onMapRegionSelect}
          onSelectFragment={onMapFragmentFallback}
          onRemove={onRemove}
          onFlip={onFlip}
          onSplitSignal={onSplitSignal}
          onEditFragment={onEditFragment}
        />
      </div>

      {/* Splitter handle. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        className="h-[6px] bg-gray-200 hover:bg-gray-300 cursor-ns-resize shrink-0"
        style={{ touchAction: 'none' }}
        onMouseDown={onSplitterDown}
        data-testid="plasmid-workspace-splitter"
      />

      {/* Bottom pane — sequence. */}
      <div
        className="shrink-0 overflow-hidden"
        style={{ height: bottomHeight || 240 }}
      >
        <SequencePane
          fragments={fragments}
          primers={primers}
          selectedRegionId={selectedRegionId}
          onSelectRegion={onSequenceSelect}
        />
      </div>
    </div>
  );
}
