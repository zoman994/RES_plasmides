/**
 * KLDOpPopup — KLD-мутагенез (kinase-ligase-DpnI) popup.
 *
 * Sprint M-CANVAS-OPS K8 (12.05.2026 — DEC-OPS-06). Template = 1 circular
 * container; primer pair = 1 oligonucleotide container; DpnI digest
 * (auto-on, default true) — strips methylated parent.
 */
import { useMemo, useState } from 'react';
import OpPopup from './OpPopup';

export default function KLDOpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const params = operation?.params || {};
  const [templateId, setTemplateId] = useState(params.templateId || '');
  const [primerPairId, setPrimerPairId] = useState(params.primerPairId || '');
  const [dpniDigest, setDpniDigest] = useState(
    params.dpniDigest !== undefined ? params.dpniDigest : true,
  );

  const circularContainers = useMemo(
    () => containers.filter(
      (c) => (c.kind || 'molecule') === 'molecule'
        && c.sequence
        && c.topology?.circular,
    ),
    [containers],
  );
  const oligoContainers = useMemo(
    () => containers.filter((c) => c.kind === 'oligonucleotide'),
    [containers],
  );

  const executeDisabled = !templateId || !primerPairId;

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="KLD — Мутагенез"
      icon="🧫"
      onCancel={onCancel}
      onExecute={() => onExecute?.({ templateId, primerPairId, dpniDigest })}
      executeDisabled={executeDisabled}
      executeLabel="Запустить KLD"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Темплейт (circular)">
          <select
            data-testid="kld-op-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={selectStyle}
          >
            <option value="">— выбрать —</option>
            {circularContainers.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
          {circularContainers.length === 0 && (
            <Hint>Нет circular containers на canvas.</Hint>
          )}
        </Field>

        <Field label="Праймер-пара (oligonucleotide)">
          <select
            data-testid="kld-op-primer-pair"
            value={primerPairId}
            onChange={(e) => setPrimerPairId(e.target.value)}
            style={selectStyle}
          >
            <option value="">— выбрать —</option>
            {oligoContainers.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
          {oligoContainers.length === 0 && (
            <Hint>Нет oligonucleotide containers (K10).</Hint>
          )}
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={dpniDigest}
            onChange={(e) => setDpniDigest(e.target.checked)}
            data-testid="kld-op-dpni"
          />
          <span>DpnI digest (убирает метилированный темплейт)</span>
        </label>
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

function Hint({ children }) {
  return <span style={{ fontSize: 11, color: 'var(--text-tertiary, #a8a29e)' }}>{children}</span>;
}

const selectStyle = {
  padding: '5px 8px',
  border: '1px solid var(--border-default, #d6d3d1)',
  borderRadius: 4,
  background: 'var(--surface-1, #fff)',
  fontSize: 13,
};
