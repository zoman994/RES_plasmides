/**
 * LigateOpPopup — лигирование (sticky / blunt) popup.
 *
 * Sprint M-CANVAS-OPS K8 (12.05.2026 — DEC-OPS-06). Multi-select
 * линейных фрагментов; auto-detect sticky vs blunt (с manual override);
 * topology toggle (circular | linear).
 */
import { useMemo, useState } from 'react';
import OpPopup from './OpPopup';

export default function LigateOpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const params = operation?.params || {};
  const [fragmentIds, setFragmentIds] = useState(params.fragmentIds || []);
  const [endsMode, setEndsMode] = useState(params.endsMode || 'auto'); // 'auto' | 'sticky' | 'blunt'
  const [circular, setCircular] = useState(
    params.circular !== undefined ? params.circular : true,
  );

  const linearContainers = useMemo(
    () => containers.filter(
      (c) => (c.kind || 'molecule') === 'molecule'
        && c.sequence
        && !c.topology?.circular,
    ),
    [containers],
  );

  // Auto-detect sticky end: any fragment with non-empty ends.overhang
  // hint → sticky. K9 adapter is the source of truth; this is a UI hint.
  const detectedEnds = useMemo(() => {
    const selected = linearContainers.filter((c) => fragmentIds.includes(c.id));
    const anySticky = selected.some((c) => !!c.ends?.left?.overhang || !!c.ends?.right?.overhang);
    return anySticky ? 'sticky' : 'blunt';
  }, [linearContainers, fragmentIds]);

  const effectiveEnds = endsMode === 'auto' ? detectedEnds : endsMode;

  // R4-BIO-2 (14.05.2026): sticky-end compatibility check.
  // EcoRI overhang AATT ligates only with AATT (same enzyme or
  // isoschizomer). Различные overhangs = no ligation. Подсвечиваем.
  const stickyMismatch = useMemo(() => {
    if (effectiveEnds !== 'sticky') return null;
    const selected = linearContainers.filter((c) => fragmentIds.includes(c.id));
    if (selected.length < 2) return null;
    const overhangs = new Set();
    for (const c of selected) {
      if (c.ends?.left?.overhang) overhangs.add(String(c.ends.left.overhang).toUpperCase());
      if (c.ends?.right?.overhang) overhangs.add(String(c.ends.right.overhang).toUpperCase());
    }
    if (overhangs.size === 0) return null;
    if (overhangs.size > 1) {
      return Array.from(overhangs);
    }
    return null;
  }, [linearContainers, fragmentIds, effectiveEnds]);

  const toggleFragment = (id) => {
    setFragmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const executeDisabled = fragmentIds.length < 2;

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="Ligate — Лигирование"
      icon="🪢"
      onCancel={onCancel}
      onExecute={() => onExecute?.({ fragmentIds, ends: effectiveEnds, circular })}
      executeDisabled={executeDisabled}
      executeLabel="Лигировать"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Фрагменты (≥2 линейных)">
          <div
            data-testid="ligate-op-fragment-list"
            style={{
              maxHeight: 140, overflow: 'auto',
              border: '1px solid var(--border-default, #e7e5e4)',
              borderRadius: 4, padding: 4,
            }}
          >
            {linearContainers.length === 0 && (
              <div style={{ padding: 6, color: 'var(--text-tertiary)', fontSize: 12 }}>
                Нет линейных фрагментов.
              </div>
            )}
            {linearContainers.map((c) => {
              const checked = fragmentIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  data-testid={`ligate-op-fragment-row-${c.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 6px', cursor: 'pointer', borderRadius: 3,
                    background: checked ? 'var(--surface-2)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFragment(c.id)}
                    data-testid={`ligate-op-fragment-${c.id}`}
                  />
                  <span style={{ fontSize: 12 }}>{c.name || c.id}</span>
                </label>
              );
            })}
          </div>
        </Field>

        <Field label={`Концы (auto-detect → ${detectedEnds})`}>
          <select
            value={endsMode}
            onChange={(e) => setEndsMode(e.target.value)}
            data-testid="ligate-op-ends-mode"
            style={selectStyle}
          >
            <option value="auto">Auto</option>
            <option value="sticky">Sticky</option>
            <option value="blunt">Blunt</option>
          </select>
        </Field>

        <Field label="Топология результата">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={circular}
              onChange={(e) => setCircular(e.target.checked)}
              data-testid="ligate-op-circular"
            />
            <span>Замкнуть в circular</span>
          </label>
        </Field>

        {/* R4-BIO-2: sticky-end mismatch warning. */}
        {stickyMismatch && (
          <div
            data-testid="ligate-op-warn-sticky-mismatch"
            style={{
              padding: '6px 8px',
              background: '#fef3c7',
              border: '1px solid #d97706',
              borderRadius: 4,
              fontSize: 11,
              color: '#7c2d12',
              lineHeight: 1.4,
            }}
          >
            ⚠ Sticky концы несовместимы: <code>{stickyMismatch.join(', ')}</code>.
            Разные overhang'и не лигируются — используйте одинаковые ферменты на обоих концах.
          </div>
        )}
      </div>
    </OpPopup>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #57534e)' }}>{label}</span>
      {children}
    </div>
  );
}

const selectStyle = {
  padding: '5px 8px',
  border: '1px solid var(--border-default, #d6d3d1)',
  borderRadius: 4,
  background: 'var(--surface-1, #fff)',
  fontSize: 13,
};
