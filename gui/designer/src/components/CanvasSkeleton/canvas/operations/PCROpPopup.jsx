/**
 * PCROpPopup — kind-specific popup body для PCR operation.
 *
 * Sprint M-CANVAS-OPS K6 (12.05.2026 — DEC-OPS-06). Поверх OpPopup
 * base: template select, primer pair select, auto-design checkbox,
 * annealing °C input, extension sec input.
 *
 * Hard cap 8 KB (DEC-OPS-06). На execute — onExecute({...params})
 * caller дёргает opSetParams + opExecute (K9).
 */
import { useState } from 'react';
import OpPopup from './OpPopup';

export default function PCROpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const params = operation?.params || {};
  // V69 — op.inputs[0] is the canonical template everywhere else in the
  // PCR system (selectors-pcr.js, adapters/pcr.js, PcrModeShell). The
  // hover 🔬-icon wires the fragment into op.inputs, not
  // params.templateId, so fall back to it here — SAME resolution order
  // as adapters/pcr.js (params.templateId → templateIds[0] → inputs[0]).
  const inputTemplateId = Array.isArray(operation?.inputs) ? (operation.inputs[0] || '') : '';
  const [templateId, setTemplateId] = useState(params.templateId || inputTemplateId || '');
  // R6-4: multi-template support.
  const [multi, setMulti] = useState(Boolean(params.templateIds && params.templateIds.length > 1));
  const [templateIds, setTemplateIds] = useState(
    Array.isArray(params.templateIds)
      ? params.templateIds
      : (params.templateId
          ? [params.templateId]
          : (inputTemplateId ? [inputTemplateId] : [])),
  );
  const [primerPairId, setPrimerPairId] = useState(params.primerPairId || '');
  const [autoDesign, setAutoDesign] = useState(
    params.autoDesign !== undefined ? params.autoDesign : true,
  );
  const [annealingC, setAnnealingC] = useState(params.annealingC ?? 55);
  const [extensionSec, setExtensionSec] = useState(params.extensionSec ?? 30);

  const moleculeContainers = containers.filter(
    (c) => (c.kind || 'molecule') === 'molecule' && c.sequence,
  );
  const oligoContainers = containers.filter(
    (c) => c.kind === 'oligonucleotide',
  );

  const executeDisabled = (multi
    ? templateIds.length === 0
    : !templateId
  ) || (!primerPairId && !autoDesign);

  const toggleTemplateInList = (id) => {
    setTemplateIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="PCR — Амплификация"
      icon="🧬"
      onCancel={onCancel}
      onExecute={() => {
        onExecute?.({
          templateId: multi ? null : templateId,
          templateIds: multi ? templateIds : null,
          primerPairId: primerPairId || null,
          autoDesign,
          annealingC: Number(annealingC),
          extensionSec: Number(extensionSec),
        });
      }}
      executeDisabled={executeDisabled}
      executeLabel={multi ? `ПЦР × ${templateIds.length}` : 'Запустить ПЦР'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input
            type="checkbox"
            data-testid="pcr-op-multi"
            checked={multi}
            onChange={(e) => {
              const v = e.target.checked;
              setMulti(v);
              if (v && templateId && !templateIds.includes(templateId)) {
                setTemplateIds([templateId]);
              }
            }}
          />
          <span>Multi-template (parallel PCR над несколькими темплейтами)</span>
        </label>

        {!multi && (
          <Field label="Темплейт">
            <select
              data-testid="pcr-op-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              style={selectStyle}
            >
              <option value="">— выбрать —</option>
              {moleculeContainers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id} {c.topology?.circular ? '(circular)' : '(linear)'}
                </option>
              ))}
            </select>
            {moleculeContainers.length === 0 && (
              <Hint>На canvas нет molecule containers — добавьте через дерево.</Hint>
            )}
          </Field>
        )}
        {multi && (
          <Field label={`Темплейты (${templateIds.length} выбрано)`}>
            <div
              data-testid="pcr-op-template-multi"
              style={{
                maxHeight: 140,
                overflow: 'auto',
                border: '1px solid var(--border-default, #d6d3d1)',
                borderRadius: 4,
                background: 'var(--surface-1, #fff)',
                padding: 4,
              }}
            >
              {moleculeContainers.length === 0 && (
                <Hint>Нет molecule containers.</Hint>
              )}
              {moleculeContainers.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    data-testid={`pcr-op-template-check-${c.id}`}
                    checked={templateIds.includes(c.id)}
                    onChange={() => toggleTemplateInList(c.id)}
                  />
                  <span>{c.name || c.id} {c.topology?.circular ? '(circular)' : '(linear)'}</span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field label="Праймер-пара">
          <select
            data-testid="pcr-op-primer-pair"
            value={primerPairId}
            onChange={(e) => setPrimerPairId(e.target.value)}
            disabled={autoDesign}
            style={{ ...selectStyle, opacity: autoDesign ? 0.5 : 1 }}
          >
            <option value="">— выбрать —</option>
            {oligoContainers.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
          {oligoContainers.length === 0 && !autoDesign && (
            <Hint>Нет oligonucleotide containers (доступны после K10).</Hint>
          )}
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            data-testid="pcr-op-auto-design"
            checked={autoDesign}
            onChange={(e) => setAutoDesign(e.target.checked)}
          />
          <span>Auto-design праймеров (использует local-primer-design)</span>
        </label>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Annealing °C" style={{ flex: 1 }}>
            <input
              type="number"
              data-testid="pcr-op-annealing"
              value={annealingC}
              min={40}
              max={75}
              onChange={(e) => setAnnealingC(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Extension сек" style={{ flex: 1 }}>
            <input
              type="number"
              data-testid="pcr-op-extension"
              value={extensionSec}
              min={5}
              max={600}
              onChange={(e) => setExtensionSec(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>
    </OpPopup>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #57534e)' }}>{label}</span>
      {children}
    </div>
  );
}

function Hint({ children }) {
  return (
    <span style={{ fontSize: 11, color: 'var(--text-tertiary, #a8a29e)' }}>{children}</span>
  );
}

const selectStyle = {
  padding: '5px 8px',
  border: '1px solid var(--border-default, #d6d3d1)',
  borderRadius: 4,
  background: 'var(--surface-1, #fff)',
  fontSize: 13,
  color: 'var(--text-primary)',
};

const inputStyle = selectStyle;
