/**
 * skeleton-state-canvas-cut — CUT_CONTAINER_AT_CURSOR handler.
 *
 * R12-4 (15.05.2026 — DEC-OPS-STATE-CANVAS-SPLIT-01). Extracted из
 * skeleton-state-canvas.js (167 lines, ~7 KB) чтобы вернуть main file
 * под 25 KB hard. Behavior byte-identical.
 *
 * CUT_CONTAINER_AT_CURSOR — toolbar cut жест: разрезает container в
 * позиции `cutPos`.
 *   - Linear → split на 2 containers + auto-junction.
 *   - Circular → rotate + linearize in place (same id, new sequence).
 *
 * Аннотации:
 *   - Linear: расщепляются на left/right с trim по cutPos.
 *   - Circular: shift'аются (start - cutPos) mod len.
 */
import { v7 as uuidv7 } from 'uuid';
import { BLOCK_LINEAR_W } from '../canvas/canvas-layout';

export function handleCutAtCursor(state, action) {
  const { containerId, cutPos } = action;
  if (!containerId) return state;
  const idx = state.containers.findIndex((c) => c.id === containerId);
  if (idx < 0) return state;
  const target = state.containers[idx];
  const seq = target.sequence || '';
  const len = seq.length;
  if (!Number.isFinite(cutPos) || cutPos < 0 || cutPos > len) return state;
  if (len === 0) return state;

  const wasCircular = !!target.topology?.circular;
  if (!wasCircular) {
    // Linear → split into 2 containers + auto-junction.
    const leftSeq = seq.slice(0, cutPos);
    const rightSeq = seq.slice(cutPos);
    const baseName = (target.name || 'container').replace(/_cut@\d+(_[LR])?$/, '');
    const ann = target.annotations || [];
    const leftAnns = ann
      .map((a) => {
        if (typeof a.start !== 'number' || typeof a.end !== 'number') return null;
        if (a.start >= cutPos) return null;
        const ne = Math.min(a.end, cutPos);
        if (ne <= a.start) return null;
        return { ...a, end: ne };
      })
      .filter(Boolean);
    const rightAnns = ann
      .map((a) => {
        if (typeof a.start !== 'number' || typeof a.end !== 'number') return null;
        if (a.end <= cutPos) return null;
        const ns = Math.max(0, a.start - cutPos);
        const ne = a.end - cutPos;
        if (ne <= ns) return null;
        const newId = a.id ? `${a.id}_R` : undefined;
        return { ...a, id: newId, start: ns, end: ne };
      })
      .filter(Boolean);

    const leftContainer = {
      ...target,
      sequence: leftSeq,
      length: leftSeq.length,
      topology: { circular: false },
      annotations: leftAnns,
      name: `${baseName}_cut@${cutPos}_L`,
      ends: {
        fivePrime: target.ends?.fivePrime || { overhang: '', type: 'blunt' },
        threePrime: { overhang: '', type: 'blunt' },
      },
      origin: {
        kind: 'cut',
        parentContainerId: target.id,
        parentName: target.name,
        parentTopology: 'linear',
        cutPos,
        cutSide: 'left',
        cutAt: new Date().toISOString(),
      },
    };
    const rightId = uuidv7();
    const rightContainer = {
      ...target,
      id: rightId,
      sequence: rightSeq,
      length: rightSeq.length,
      topology: { circular: false },
      annotations: rightAnns,
      name: `${baseName}_cut@${cutPos}_R`,
      ends: {
        fivePrime: { overhang: '', type: 'blunt' },
        threePrime: target.ends?.threePrime || { overhang: '', type: 'blunt' },
      },
      origin: {
        kind: 'cut',
        parentContainerId: target.id,
        parentName: target.name,
        parentTopology: 'linear',
        cutPos,
        cutSide: 'right',
        cutAt: new Date().toISOString(),
      },
      parentCommitId: null,
    };
    const containers = state.containers.slice();
    containers[idx] = leftContainer;
    containers.push(rightContainer);

    const leftPos = state.positions[target.id] || { x: 100, y: 100 };
    const gap = 32;
    const positions = {
      ...state.positions,
      [rightId]: { x: leftPos.x + BLOCK_LINEAR_W + gap, y: leftPos.y },
    };

    const junctionId = `j-auto-${target.id}-${rightId}`;
    const junctions = [
      ...state.junctions,
      {
        id: junctionId,
        fromContainerId: target.id,
        toContainerId: rightId,
        kind: 'ligation',
        autoDetectedKind: 'ligation',
      },
    ];

    return {
      ...state,
      containers,
      positions,
      junctions,
      highlightedContainerId: target.id,
      toast: {
        kind: 'success',
        message: `Разделён на 2 фрагмента: ${leftContainer.name} + ${rightContainer.name}`,
      },
    };
  }

  // Circular → rotate + linearize in place.
  const newSeq = seq.slice(cutPos) + seq.slice(0, cutPos);
  const newAnnotations = (target.annotations || [])
    .map((a) => {
      if (typeof a.start !== 'number' || typeof a.end !== 'number') return null;
      const ns = (a.start - cutPos + len) % len;
      const ne = (a.end - cutPos + len) % len;
      if (ne <= ns) {
        return { ...a, start: ns, end: len };
      }
      return { ...a, start: ns, end: ne };
    })
    .filter(Boolean);

  const modified = {
    ...target,
    sequence: newSeq,
    length: newSeq.length,
    topology: { circular: false },
    annotations: newAnnotations,
    name: `${target.name || 'container'}_cut@${cutPos + 1}`,
    ends: {
      fivePrime: { overhang: '', type: 'blunt' },
      threePrime: { overhang: '', type: 'blunt' },
    },
    origin: {
      kind: 'cut',
      parentContainerId: target.id,
      parentName: target.name,
      parentTopology: 'circular',
      cutPos,
      cutAt: new Date().toISOString(),
    },
  };

  const containers = state.containers.slice();
  containers[idx] = modified;
  return {
    ...state,
    containers,
    highlightedContainerId: containerId,
    toast: {
      kind: 'success',
      message: `Разрезан и линеаризован: ${modified.name}`,
    },
  };
}
