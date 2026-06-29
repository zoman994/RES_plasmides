/**
 * BluntOpPopup — GAP-1 (Игорь /loop 28.06). Exonuclease/polymerase end-blunting:
 * pick the fragment + the blunting enzyme. The enzyme list comes from
 * lib/end-blunting BLUNTING_ENZYMES (T4 pol / Кленов / Mung Bean / S1); each
 * option shows its biology note so the biolog picks the right one (T4 pol blunts
 * both polarities; Кленов only 5′ overhangs; Mung Bean / S1 chew any overhang).
 */
import { useState } from 'react';
import OpPopup from './OpPopup';
import { BLUNTING_ENZYMES } from '../../lib/end-blunting';

export default function BluntOpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const params = operation?.params || {};
  const [templateId, setTemplateId] = useState(params.templateId || operation?.inputs?.[0] || '');
  const [enzyme, setEnzyme] = useState(params.enzyme || 'T4pol');

  const fragmentContainers = containers.filter(
    (c) => (c.kind || 'molecule') === 'molecule' && c.sequence,
  );
  const note = BLUNTING_ENZYMES[enzyme]?.notes || '';
  const executeDisabled = !templateId || !BLUNTING_ENZYMES[enzyme];

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="Blunt — затупление концов"
      icon="◻"
      onCancel={onCancel}
      onExecute={() => onExecute?.({ templateId, enzyme })}
      executeDisabled={executeDisabled}
      executeLabel="Затупить"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Фрагмент">
          <select
            data-testid="blunt-op-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={selectStyle}
          >
            <option value="">— выбрать —</option>
            {fragmentContainers.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
        </Field>

        <Field label="Фермент">
          <select
            data-testid="blunt-op-enzyme"
            value={enzyme}
            onChange={(e) => setEnzyme(e.target.value)}
            style={selectStyle}
          >
            {Object.entries(BLUNTING_ENZYMES).map(([key, def]) => (
              <option key={key} value={key}>{def.name}</option>
            ))}
          </select>
        </Field>

        {note && (
          <div
            data-testid="blunt-op-note"
            style={{ fontSize: 11, color: 'var(--text-secondary, #57534e)', lineHeight: 1.5 }}
          >
            {note}
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
