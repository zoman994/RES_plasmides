/**
 * useAppEffects.js — Top-level side effects for App.jsx.
 *
 * Extracted from App.jsx (Sprint App-Decomp K2, 28.04.2026).
 * Three independent effects:
 *   1. Keyboard shortcuts (Ctrl+Z/Y undo/redo, Ctrl+5 toggle Construct↔Flow).
 *   2. Initial fetchParts() merge with persisted user variants.
 *   3. Auto-design primers client-side on fragment/junction changes.
 *
 * No return value — hook is invoked for its side effects only.
 */
import { useEffect, useMemo } from 'react';
import {
  useStore, useFragments, useJunctions,
  undo, redo,
} from '../store/index';
import { fetchParts } from '../api';
import { designPrimersLocal } from '../local-primer-design';

export function useAppEffects() {
  const fragments = useFragments();
  const junctions = useJunctions();
  // UX-006 wire-up — Settings → Display & Defaults stores polymerase
  // and primerPrefix under `displaySettings`. The previous reads of
  // top-level `s.polymerase` / `s.primerPrefix` were silently
  // undefined (no such root keys exist), so designPrimersLocal fell
  // back to its hardcoded defaults («phusion» / «P»). Now Settings
  // actually drives the calculator: changing polymerase in the modal
  // re-runs the auto-design memo on the next tick.
  const polymerase = useStore(s => (
    s.displaySettings ? s.displaySettings.polymerase : 'q5'
  ));
  const primerPrefix = useStore(s => (
    s.displaySettings ? s.displaySettings.primerPrefix : 'P'
  ));
  const assemblies = useStore(s => s.assemblies);
  const activeId = useStore(s => s.activeId);
  const active = useMemo(
    () => assemblies.find(a => a.id === activeId),
    [assemblies, activeId],
  );
  const circular = active?.circular || false;

  // ═══ Undo/Redo + Construct↔Flow toggle (Ctrl+5) ═══
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '5') {
        e.preventDefault();
        const v = useStore.getState().projectView;
        useStore.getState().setProjectView(v === 'construct' ? 'flow' : 'construct');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ═══ Load parts on mount (merge API parts with persisted user variants) ═══
  useEffect(() => {
    const mergeParts = (apiParts) => {
      const currentParts = useStore.getState().parts;
      if (!apiParts.length) return; // don't wipe on empty
      const existingIds = new Set(currentParts.map(p => p.id));
      const existingNames = new Set(currentParts.map(p => p.name));
      const newOnly = apiParts.filter(p => !existingIds.has(p.id) && !existingNames.has(p.name));
      if (newOnly.length > 0) {
        useStore.getState().setParts([...currentParts, ...newOnly]);
      }
    };
    fetchParts().then(mergeParts).catch(() => {}); // on error — keep existing parts
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ Auto-design primers (client-side, no API) ═══
  const autoDesigned = useMemo(() => {
    if (fragments.length < 2) return null;
    if (fragments.some(f => f.needsAmplification !== false && !f.sequence)) return null;
    return designPrimersLocal(fragments, junctions, circular, { tmTarget: 60, primerPrefix, polymerase });
  }, [fragments, junctions, circular, primerPrefix, polymerase]);

  useEffect(() => {
    const { updateActive, getActive } = useStore.getState();
    if (autoDesigned && autoDesigned.primers.length > 0) {
      // V4-A guard: if the active assembly already carries mutagenesis primers,
      // do NOT overwrite them with standard overlap-auto-designed ones — keep
      // the KLD/fragment-strategy primers and only refresh warnings/calculated.
      const a = getActive();
      const hasMutPrimers = a?.primers?.some(p => p.isMutagenesis);
      if (hasMutPrimers) {
        updateActive({
          apiWarnings: autoDesigned.warnings,
          calculated: true,
        });
      } else {
        updateActive({
          primers: autoDesigned.primers,
          apiWarnings: autoDesigned.warnings,
          calculated: true,
        });
      }
    } else if (autoDesigned !== undefined) {
      // P1v2 fix: clear stale primers when auto-design returns null/empty (e.g. 1 fragment)
      const a = getActive();
      if (a?.primers?.length > 0 && !a.primers.some(p => p.isMutagenesis)) {
        updateActive({
          primers: [],
          apiWarnings: autoDesigned?.warnings || (fragments.length === 1
            ? ['ℹ️ Один фрагмент — праймеры не нужны. Добавьте второй фрагмент для сборки.']
            : []),
          calculated: false,
        });
      }
    }
  }, [autoDesigned]); // eslint-disable-line react-hooks/exhaustive-deps
}
