/**
 * MutagenesisOpPopup — точечный мутагенез popup.
 *
 * Sprint M-CANVAS-OPS K8 (12.05.2026 — DEC-OPS-06). Template = 1
 * molecule container; mutation type = point / insertion / deletion;
 * mutation list = rows {position, from, to | insert}.
 *
 * Saturation mutagenesis batch — out of scope (M-CANVAS-MUTAGENESIS
 * sprint).
 */
import { useState } from 'react';
import OpPopup from './OpPopup';

export default function MutagenesisOpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const params = operation?.params || {};
  const [templateId, setTemplateId] = useState(params.templateId || '');
  const [mutationType, setMutationType] = useState(params.mutationType || 'point');
  const [mutations, setMutations] = useState(
    Array.isArray(params.mutations) && params.mutations.length > 0
      ? params.mutations
      : [{ position: 0, from: '', to: '' }],
  );

  const moleculeContainers = containers.filter(
    (c) => (c.kind || 'molecule') === 'molecule' && c.sequence,
  );

  const addMutation = () => {
    setMutations((prev) => [...prev, { position: 0, from: '', to: '' }]);
  };
  const removeMutation = (idx) => {
    setMutations((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateMutation = (idx, patch) => {
    setMutations((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const executeDisabled = !templateId || mutations.length === 0;

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="Mutate — Мутагенез"
      icon="⚗"
      onCancel={onCancel}
      onExecute={() => onExecute?.({ templateId, mutationType, mutations })}
      executeDisabled={executeDisabled}
      executeLabel="Применить"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Темплейт">
          <select
            data-testid="mut-op-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={selectStyle}
          >
            <option value="">— выбрать —</option>
            {moleculeContainers.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
        </Field>

        <Field label="Тип мутации">
          <select
            data-testid="mut-op-type"
            value={mutationType}
            onChange={(e) => setMutationType(e.target.value)}
            style={selectStyle}
          >
            <option value="point">Точечная (substitute)</option>
            <option value="insertion">Вставка</option>
            <option value="deletion">Делеция</option>
          </select>
        </Field>

        <Field label="Список мутаций">
          <div data-testid="mut-op-mutation-list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mutations.map((m, idx) => (
              <div
                key={idx}
                data-testid={`mut-op-mutation-row-${idx}`}
                style={{ display: 'flex', gap: 4, alignItems: 'center' }}
              >
                <input
                  type="number"
                  data-testid={`mut-op-position-${idx}`}
                  value={m.position}
                  onChange={(e) => updateMutation(idx, { position: Number(e.target.value) })}
                  placeholder="pos"
                  style={{ ...inputStyle, width: 70 }}
                />
                {mutationType === 'point' && (
                  <>
                    <input
                      type="text"
                      data-testid={`mut-op-from-${idx}`}
                      value={m.from || ''}
                      onChange={(e) => updateMutation(idx, { from: e.target.value })}
                      placeholder="from"
                      maxLength={1}
                      style={{ ...inputStyle, width: 50, fontFamily: 'monospace' }}
                    />
                    <span>→</span>
                    <input
                      type="text"
                      data-testid={`mut-op-to-${idx}`}
                      value={m.to || ''}
                      onChange={(e) => updateMutation(idx, { to: e.target.value })}
                      placeholder="to"
                      maxLength={1}
                      style={{ ...inputStyle, width: 50, fontFamily: 'monospace' }}
                    />
                  </>
                )}
                {mutationType === 'insertion' && (
                  <input
                    type="text"
                    data-testid={`mut-op-insert-${idx}`}
                    value={m.insert || ''}
                    onChange={(e) => updateMutation(idx, { insert: e.target.value })}
                    placeholder="insert seq"
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  />
                )}
                {mutationType === 'deletion' && (
                  <input
                    type="number"
                    data-testid={`mut-op-deletion-length-${idx}`}
                    value={m.length || 1}
                    onChange={(e) => updateMutation(idx, { length: Number(e.target.value) })}
                    placeholder="len"
                    style={{ ...inputStyle, width: 70 }}
                  />
                )}
                <button
                  type="button"
                  data-testid={`mut-op-remove-${idx}`}
                  onClick={() => removeMutation(idx)}
                  disabled={mutations.length === 1}
                  style={miniBtn}
                >×</button>
              </div>
            ))}
          </div>
          <button
            type="button"
            data-testid="mut-op-add"
            onClick={addMutation}
            style={{ ...miniBtn, marginTop: 4 }}
          >+ Добавить</button>
        </Field>
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
const inputStyle = selectStyle;
const miniBtn = {
  padding: '3px 8px',
  border: '1px solid var(--border-default, #d6d3d1)',
  borderRadius: 3,
  background: 'var(--surface-1, #fff)',
  cursor: 'pointer',
  fontSize: 12,
};
