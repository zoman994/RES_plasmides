/**
 * GoldenGateOpPopup — Golden Gate assembly (Type IIS, 4-nt overhang).
 *
 * Sprint M-CANVAS-OPS V60 (14.05.2026). Выделен из GibsonOpPopup'а как
 * отдельный kind. Type IIS enzymes (BsaI, BpiI, BsmBI, SapI, BtgZI) —
 * единственное допустимое семейство; default = BsaI.
 *
 * Layout:
 *   - Fragment multi-select (≥2, линейные молекулы)
 *   - Order: up/down reorder
 *   - Enzyme select: Type IIS из GG_ENZYMES (golden-gate.js)
 *   - Topology output: circular | linear
 *   - Execute → onExecute({fragmentIds, enzyme, circular, method: 'goldengate'})
 */
import { useMemo, useState } from 'react';
import OpPopup from './OpPopup';
import { GG_ENZYMES, checkInternalSites } from '../../../../golden-gate';

const GG_ENZYME_NAMES = Object.keys(GG_ENZYMES || {});

export default function GoldenGateOpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const params = operation?.params || {};
  const [fragmentIds, setFragmentIds] = useState(params.fragmentIds || []);
  const [enzyme, setEnzyme] = useState(params.enzyme || GG_ENZYME_NAMES[0] || 'BsaI');
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

  const toggleFragment = (id) => {
    setFragmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const moveUp = (idx) => {
    if (idx <= 0) return;
    setFragmentIds((prev) => {
      const next = prev.slice();
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };
  const moveDown = (idx) => {
    setFragmentIds((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  // GG-2 — live internal-site check for the chosen enzyme over the selected
  // fragments; a fragment with an internal recognition site self-cleaves → block
  // assembly and surface the offending fragments + a suggested alternative.
  const internal = useMemo(() => {
    const frags = fragmentIds.map((id) => containers.find((c) => c.id === id)).filter(Boolean);
    if (frags.length < 2) return { ok: true };
    return checkInternalSites(frags, enzyme);
  }, [fragmentIds, enzyme, containers]);
  const hasInternal = internal && internal.ok === false;

  const executeDisabled = fragmentIds.length < 2 || !enzyme || hasInternal;

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="Golden Gate — Type IIS"
      icon="⛓"
      onCancel={onCancel}
      onExecute={() => onExecute?.({
        fragmentIds,
        enzyme,
        circular,
        method: 'goldengate',
      })}
      executeDisabled={executeDisabled}
      executeLabel="Собрать GG"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Фрагменты (≥2 линейных)">
          <div
            data-testid="gg-op-fragment-list"
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
                  data-testid={`gg-op-fragment-row-${c.id}`}
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
                    data-testid={`gg-op-fragment-${c.id}`}
                  />
                  <span style={{ fontSize: 12 }}>{c.name || c.id}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {c.sequence?.length || 0} bp
                  </span>
                </label>
              );
            })}
          </div>
        </Field>

        {fragmentIds.length > 0 && (
          <Field label="Порядок сборки">
            <div data-testid="gg-op-order-list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {fragmentIds.map((id, idx) => {
                const c = linearContainers.find((x) => x.id === id);
                return (
                  <div
                    key={id}
                    data-testid={`gg-op-order-${id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 6px', background: 'var(--surface-2)',
                      borderRadius: 3, fontSize: 12,
                    }}
                  >
                    <span style={{ minWidth: 20 }}>{idx + 1}.</span>
                    <span style={{ flex: 1 }}>{c?.name || id}</span>
                    <button
                      type="button"
                      data-testid={`gg-op-order-up-${id}`}
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      style={miniBtn}
                    >↑</button>
                    <button
                      type="button"
                      data-testid={`gg-op-order-down-${id}`}
                      onClick={() => moveDown(idx)}
                      disabled={idx === fragmentIds.length - 1}
                      style={miniBtn}
                    >↓</button>
                  </div>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Type IIS фермент">
          <select
            data-testid="gg-op-enzyme"
            value={enzyme}
            onChange={(e) => setEnzyme(e.target.value)}
            style={selectStyle}
          >
            {GG_ENZYME_NAMES.map((name) => {
              const e = GG_ENZYMES[name];
              return (
                <option key={name} value={name}>
                  {/* GG-3 — GG_ENZYMES uses `.recognition` (e.g. BsaI → GGTCTC),
                      not `.site` (that's the RE_ENZYMES field); the old read was
                      always blank. */}
                  {name} · {e?.recognition || ''}
                </option>
              );
            })}
          </select>
          {/* AUD-42 — teach why classical RE (EcoRI/BamHI) aren't here: Type IIS
              cuts OUTSIDE its recognition site, so the site is removed from the
              product and the junction is seamless. */}
          <div data-testid="gg-op-typeiis-note" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', lineHeight: 1.4, marginTop: 2 }}>
            Type IIS режет <b>вне</b> сайта узнавания ({GG_ENZYMES[enzyme]?.recognition || '…'}) → сайт уходит из продукта, шов бесшовный. Классические рестриктазы (EcoRI, BamHI…) — в реакции «Разрез / RE-лигирование».
          </div>
        </Field>

        <Field label="Топология результата">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={circular}
              onChange={(e) => setCircular(e.target.checked)}
              data-testid="gg-op-circular"
            />
            <span>Замкнуть в плазмиду (circular)</span>
          </label>
        </Field>

        {hasInternal && (
          <div
            data-testid="gg-op-warn-internal-site"
            style={{
              padding: '6px 8px', background: '#fef3c7', border: '1px solid #d97706',
              borderRadius: 4, fontSize: 11, color: '#7c2d12', lineHeight: 1.4,
            }}
          >
            ⚠ {internal.message}
            {internal.alternatives && internal.alternatives.length > 0 && (
              <div style={{ marginTop: 2 }}>
                Без внутренних сайтов:{' '}
                <button
                  type="button"
                  data-testid="gg-op-switch-enzyme"
                  onClick={() => setEnzyme(internal.alternatives[0])}
                  style={{
                    background: 'transparent', border: 'none', padding: 0,
                    color: '#7c2d12', textDecoration: 'underline', cursor: 'pointer', fontSize: 11,
                  }}
                >{internal.alternatives[0]}</button>
              </div>
            )}
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

const miniBtn = {
  padding: '2px 6px',
  border: '1px solid var(--border-default, #d6d3d1)',
  borderRadius: 3,
  background: 'var(--surface-1, #fff)',
  cursor: 'pointer',
  fontSize: 11,
};
