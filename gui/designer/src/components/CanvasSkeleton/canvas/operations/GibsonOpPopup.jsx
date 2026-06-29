/**
 * GibsonOpPopup — Gibson assembly (overlap 20-40 bp) popup.
 *
 * Sprint M-CANVAS-OPS K7 (12.05.2026 — DEC-OPS-06). 14.05.2026 — Gibson
 * и Golden Gate разделены на отдельные kind'ы (V60). Этот компонент
 * теперь чисто Gibson (overlap method); Golden Gate в GoldenGateOpPopup.
 *
 * Поверх OpPopup base:
 *   - Fragment multi-select (≥2, только linear)
 *   - Order: up/down reorder
 *   - Topology output: circular | linear
 *   - Execute → onExecute({fragmentIds, method: 'overlap', circular})
 */
import { useMemo, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import OpPopup from './OpPopup';
import { Icon } from '../../../icons/Icon';
import { designGibsonPrimers } from '../../../../lib/bio/gibson-primer-design';
import { useSkeletonActionsSafe } from '../../store/skeleton-context';

export default function GibsonOpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const actions = useSkeletonActionsSafe();
  const params = operation?.params || {};
  const [fragmentIds, setFragmentIds] = useState(params.fragmentIds || []);
  const [circular, setCircular] = useState(
    params.circular !== undefined ? params.circular : true,
  );

  // Linear molecule containers eligible as fragments.
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

  const executeDisabled = fragmentIds.length < 2;

  // R7-1: design Gibson primers (homology arm tails).
  const primerDesigns = useMemo(() => {
    if (fragmentIds.length < 2) return null;
    const frags = fragmentIds
      .map((id) => linearContainers.find((c) => c.id === id))
      .filter(Boolean);
    if (frags.length !== fragmentIds.length) return null;
    return designGibsonPrimers(frags, circular);
  }, [fragmentIds, linearContainers, circular]);

  const onAddPrimers = () => {
    if (!primerDesigns) return;
    if (!actions.addContainer) return; // no-op when rendered standalone (tests).
    for (const d of primerDesigns) {
      if (d.error) continue;
      const oligo = {
        id: uuidv7(),
        kind: 'oligonucleotide',
        name: `${d.fragmentName}_gibson_primers`,
        topology: { circular: false },
        length: 0,
        sequence: '',
        annotations: [],
        ends: null,
        payload: {
          // V175 (PRIMER-9) — split each oligo into binding (anneal, on template)
          // + tail (homology arm, NOT on template) so executePCR anneals the
          // binding, PrimerTrack draws the overhang, and binding-search is correct.
          sequences: [
            {
              name: 'fwd', sequence: d.fwd.sequence,
              bindingSequence: d.fwd.sequence.slice(d.fwd.homologyLen),
              tail: d.fwd.sequence.slice(0, d.fwd.homologyLen),
              Tm: d.fwd.Tm, GC: d.fwd.GC, length: d.fwd.length, homologyLen: d.fwd.homologyLen,
            },
            {
              name: 'rev', sequence: d.rev.sequence,
              bindingSequence: d.rev.sequence.slice(d.rev.homologyLen),
              tail: d.rev.sequence.slice(0, d.rev.homologyLen),
              Tm: d.rev.Tm, GC: d.rev.GC, length: d.rev.length, homologyLen: d.rev.homologyLen,
            },
          ],
          purpose: 'gibson_homology_primer',
        },
        origin: { kind: 'op_gibson_primer_designed', parentContainerId: d.fragmentId },
        parentCommitId: null,
      };
      actions.addContainer(oligo);
    }
  };

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="Gibson — Overlap-сборка"
      icon={<Icon name="mix" size={16} />}
      onCancel={onCancel}
      onExecute={() => onExecute?.({ fragmentIds, method: 'overlap', circular })}
      executeDisabled={executeDisabled}
      executeLabel="Собрать"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Фрагменты (≥2 линейных)">
          <div
            data-testid="gibson-op-fragment-list"
            style={{
              maxHeight: 140, overflow: 'auto',
              border: '1px solid var(--border-default, #e7e5e4)',
              borderRadius: 4, padding: 4,
            }}
          >
            {linearContainers.length === 0 && (
              <div style={{ padding: 6, color: 'var(--text-tertiary)', fontSize: 12 }}>
                Нет линейных фрагментов на canvas.
              </div>
            )}
            {linearContainers.map((c) => {
              const checked = fragmentIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  data-testid={`gibson-op-fragment-row-${c.id}`}
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
                    data-testid={`gibson-op-fragment-${c.id}`}
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
            <div data-testid="gibson-op-order-list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {fragmentIds.map((id, idx) => {
                const c = linearContainers.find((x) => x.id === id);
                return (
                  <div
                    key={id}
                    data-testid={`gibson-op-order-${id}`}
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
                      data-testid={`gibson-op-order-up-${id}`}
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      style={miniBtn}
                      aria-label="Вверх"
                    ><Icon name="sort" size={13} /></button>
                    <button
                      type="button"
                      data-testid={`gibson-op-order-down-${id}`}
                      onClick={() => moveDown(idx)}
                      disabled={idx === fragmentIds.length - 1}
                      style={miniBtn}
                      aria-label="Вниз"
                    ><Icon name="sort" size={13} /></button>
                  </div>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Топология результата">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={circular}
              onChange={(e) => setCircular(e.target.checked)}
              data-testid="gibson-op-circular"
            />
            <span>Замкнуть в плазмиду (circular)</span>
          </label>
        </Field>

        {primerDesigns && primerDesigns.length > 0 && (
          <Field label="Дизайн primer'ов с homology arms (5'-tail)">
            <div
              data-testid="gibson-op-primer-designs"
              style={{
                maxHeight: 100,
                overflow: 'auto',
                border: '1px solid var(--border-default, #e7e5e4)',
                borderRadius: 4,
                padding: 4,
                fontSize: 10.5,
                fontFamily: 'monospace',
              }}
            >
              {primerDesigns.map((d) => (
                <div key={d.fragmentId} style={{ padding: 2, borderBottom: '1px dashed var(--border-default, #e7e5e4)' }}>
                  <div style={{ fontWeight: 600 }}>{d.fragmentName}</div>
                  {d.error ? (
                    <div style={{ color: 'var(--error-500, #dc2626)' }}>{d.error}</div>
                  ) : (
                    <>
                      <div>fwd ({d.fwd.length} nt, Tm {d.fwd.Tm}°C, homol {d.fwd.homologyLen}): {d.fwd.sequence}</div>
                      <div>rev ({d.rev.length} nt, Tm {d.rev.Tm}°C, homol {d.rev.homologyLen}): {d.rev.sequence}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              data-testid="gibson-op-add-primers"
              onClick={onAddPrimers}
              style={{
                marginTop: 6,
                padding: '5px 10px',
                background: 'var(--accent-500, #d97706)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Icon name="plus" size={13} />
              Добавить праймеры на canvas
            </button>
          </Field>
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

const miniBtn = {
  padding: '2px 6px',
  border: '1px solid var(--border-default, #d6d3d1)',
  borderRadius: 3,
  background: 'var(--surface-1, #fff)',
  cursor: 'pointer',
  fontSize: 11,
  display: 'inline-flex',
  alignItems: 'center',
};
