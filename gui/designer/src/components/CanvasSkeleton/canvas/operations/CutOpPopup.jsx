/**
 * CutOpPopup — restriction digest popup (K7, DEC-OPS-06).
 * Template + enzyme multi-select + cut preview + Execute.
 */
import { useMemo, useState } from 'react';
import OpPopup from './OpPopup';
import { RE_ENZYMES, findSitesInSequence, checkDoubleDigest } from '../../../../restriction-db';

const PINNED_ENZYMES = [
  'EcoRI', 'BamHI', 'HindIII', 'SalI', 'NotI',
  'XhoI', 'NcoI', 'BglII', 'BsaI', 'BsmBI',
];

export default function CutOpPopup({
  operation,
  position,
  containers = [],
  onCancel,
  onExecute,
}) {
  const params = operation?.params || {};
  const [templateId, setTemplateId] = useState(params.templateId || '');
  const [enzymes, setEnzymes] = useState(params.enzymes || []);
  const [search, setSearch] = useState('');

  const moleculeContainers = containers.filter(
    (c) => (c.kind || 'molecule') === 'molecule' && c.sequence,
  );
  const template = moleculeContainers.find((c) => c.id === templateId) || null;

  // Filter enzyme list by search input.
  const enzymeList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = Object.keys(RE_ENZYMES);
    let filtered = all;
    if (q) {
      filtered = all.filter((name) => {
        const e = RE_ENZYMES[name];
        return name.toLowerCase().includes(q)
          || (e?.site || '').toLowerCase().includes(q)
          || (e?.overhang || '').toLowerCase().includes(q);
      });
    }
    // Pinned first, then alphabetical.
    const pinned = PINNED_ENZYMES.filter((p) => filtered.includes(p));
    const rest = filtered.filter((n) => !PINNED_ENZYMES.includes(n)).sort();
    return [...pinned, ...rest];
  }, [search]);

  // Preview: sum cut positions across selected enzymes.
  const preview = useMemo(() => {
    if (!template || enzymes.length === 0) return null;
    const seq = template.sequence;
    const circular = !!template.topology?.circular;
    const allCuts = [];
    for (const e of enzymes) {
      const sites = findSitesInSequence(e, seq);
      for (const s of sites) {
        allCuts.push({ enzyme: e, position: s.position });
      }
    }
    allCuts.sort((a, b) => a.position - b.position);
    const cutCount = allCuts.length;
    // Fragment count: circular → N fragments, linear → N+1.
    const fragmentCount = cutCount === 0
      ? (circular ? 1 : 1)
      : (circular ? cutCount : cutCount + 1);
    // Estimate fragment lengths (rough, ignoring overhang complexity).
    const fragments = [];
    if (cutCount > 0) {
      if (circular) {
        for (let i = 0; i < allCuts.length; i += 1) {
          const a = allCuts[i].position;
          const b = allCuts[(i + 1) % allCuts.length].position;
          const len = i === allCuts.length - 1
            ? (seq.length - a + b)
            : (b - a);
          fragments.push(len);
        }
      } else {
        let last = 0;
        for (const c of allCuts) { fragments.push(c.position - last); last = c.position; }
        fragments.push(seq.length - last);
      }
    } else {
      fragments.push(seq.length);
    }
    return { cutCount, fragmentCount, fragments, allCuts };
  }, [template, enzymes]);

  const toggleEnzyme = (name) => {
    setEnzymes((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  const executeDisabled = !templateId || enzymes.length === 0;

  return (
    <OpPopup
      operation={operation}
      position={position}
      title="Cut — Рестрикция"
      icon="🔪"
      onCancel={onCancel}
      onExecute={() => onExecute?.({ templateId, enzymes })}
      executeDisabled={executeDisabled}
      executeLabel="Разрезать"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Темплейт">
          <select
            data-testid="cut-op-template"
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
        </Field>

        <Field label="Ферменты (поиск)">
          <input
            type="text"
            data-testid="cut-op-search"
            placeholder="EcoRI / GAATTC / overhang…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <div
          data-testid="cut-op-enzyme-list"
          style={{
            maxHeight: 140,
            overflow: 'auto',
            border: '1px solid var(--border-default, #e7e5e4)',
            borderRadius: 4,
            padding: 4,
          }}
        >
          {enzymeList.slice(0, 50).map((name) => {
            const e = RE_ENZYMES[name];
            const checked = enzymes.includes(name);
            return (
              <label
                key={name}
                data-testid={`cut-op-enzyme-row-${name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 6px',
                  cursor: 'pointer',
                  borderRadius: 3,
                  background: checked ? 'var(--surface-2)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleEnzyme(name)}
                  data-testid={`cut-op-enzyme-${name}`}
                />
                <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 60 }}>{name}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{e?.site || ''}</span>
              </label>
            );
          })}
          {enzymeList.length === 0 && (
            <div style={{ padding: 6, color: 'var(--text-tertiary)', fontSize: 12 }}>
              Ничего не найдено.
            </div>
          )}
        </div>

        {preview && (
          <div
            data-testid="cut-op-preview"
            style={{
              padding: '6px 8px',
              background: 'var(--surface-2)',
              borderRadius: 4,
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            <div>
              <strong data-testid="cut-op-preview-cuts">{preview.cutCount}</strong> разрез(ов),
              {' '}<strong data-testid="cut-op-preview-fragments">{preview.fragmentCount}</strong> фрагмент(ов)
            </div>
            {preview.fragments.length > 0 && (
              <div style={{ fontFamily: 'monospace', marginTop: 4 }}>
                {preview.fragments.map((l, i) => (
                  <span key={i} style={{ marginRight: 6 }}>{l} bp</span>
                ))}
              </div>
            )}
            {/* R4-BIO-6: warn если 3+ cuts — обычно биолог хочет
                уникальный фермент (1 cut) для backbone linearize. */}
            {preview.cutCount >= 3 && (
              <div
                data-testid="cut-op-warn-multi-cut"
                style={{ marginTop: 6, color: '#b45309', fontSize: 11 }}
              >
                ⚠ {preview.cutCount} разрезов — фермент не уникален. Для backbone обычно нужен 1 разрез.
              </div>
            )}
          </div>
        )}

        {/* R4-BIO-3: double-digest buffer/temp compatibility warning. */}
        {enzymes.length === 2 && (() => {
          const compat = checkDoubleDigest(enzymes[0], enzymes[1]);
          if (compat && compat.compatible === false) {
            return (
              <div
                data-testid="cut-op-warn-double-digest"
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
                ⚠ Double-digest: {compat.reason || 'ферменты несовместимы (буфер/температура)'}
                {compat.recommendation && (
                  <div style={{ marginTop: 2, fontStyle: 'italic' }}>{compat.recommendation}</div>
                )}
              </div>
            );
          }
          return null;
        })()}
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
