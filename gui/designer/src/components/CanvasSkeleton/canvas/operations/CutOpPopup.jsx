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
      const sites = findSitesInSequence(e, seq, circular); // L13 — wrap circular origin
      // RC-5 — the cut is at the enzyme's offset INSIDE the site, not the site
      // start (EcoRI G^AATTC → +1; NotI GC^GGCCGC → +2). Using the site start
      // mis-sizes every fragment. Mirror the engine (cut.js _cutPosition).
      const re = RE_ENZYMES[e];
      const off = (re && Array.isArray(re.cut)) ? re.cut[0] : 0;
      for (const s of sites) {
        allCuts.push({ enzyme: e, position: (s.position + off) % seq.length });
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
    // A12 (audit) — mirror digest()'s contract so the preview can't promise
    // fragments a rejected digest will never make: single enzyme needs 1–2
    // sites; two different enzymes need EXACTLY 1 each; >2 enzymes unsupported.
    const perEnz = {};
    for (const c of allCuts) perEnz[c.enzyme] = (perEnz[c.enzyme] || 0) + 1;
    let viable = true;
    let unviableReason = '';
    if (enzymes.length > 2) {
      viable = false;
      unviableReason = 'движок поддерживает 1–2 фермента за реакцию';
    } else if (!circular) {
      // L12 (audit) — the single/exactly-1 constraint is digest()'s CIRCULAR
      // contract; a LINEAR template handles any ≥1 cut (N cuts → N+1 fragments).
      if (cutCount < 1) { viable = false; unviableReason = `${enzymes.join('+')} не режет этот линейный темплейт`; }
    } else if (enzymes.length === 2 && enzymes[0] !== enzymes[1]) {
      const bad = enzymes.find((e) => (perEnz[e] || 0) !== 1);
      if (bad) { viable = false; unviableReason = `${bad} режет ${perEnz[bad] || 0}× — для двойного digest нужно ровно 1 у каждого`; }
    } else {
      const n = perEnz[enzymes[0]] || 0;
      if (n < 1 || n > 2) { viable = false; unviableReason = `${enzymes[0]} режет ${n}× — нужно 1–2 разреза`; }
    }
    return {
      cutCount, fragmentCount, fragments, allCuts, viable, unviableReason,
    };
  }, [template, enzymes]);

  const toggleEnzyme = (name) => {
    setEnzymes((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  // A12 — block Execute when the digest would be rejected (the op would fail
  // with zero output despite the preview's fragment promise).
  const executeDisabled = !templateId || enzymes.length === 0 || (preview && !preview.viable);

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
            {/* A12 — hard block: the digest engine will reject this combo, so the
                fragment promise above is unachievable. Tell the biolog + Execute
                is disabled (was: preview showed N fragments, Execute stayed on,
                op failed with zero output). */}
            {!preview.viable && (
              <div
                data-testid="cut-op-warn-unviable"
                style={{
                  marginTop: 6, color: '#7c2d12', fontSize: 11, fontWeight: 600,
                  background: '#fef3c7', border: '1px solid #d97706', borderRadius: 4, padding: '4px 6px',
                }}
              >
                ⛔ Не выполнится: {preview.unviableReason}.
              </div>
            )}
            {/* R4-BIO-6: warn если 3+ cuts — обычно биолог хочет
                уникальный фермент (1 cut) для backbone linearize. */}
            {preview.viable && preview.cutCount >= 3 && (
              <div
                data-testid="cut-op-warn-multi-cut"
                style={{ marginTop: 6, color: '#b45309', fontSize: 11 }}
              >
                ⚠ {preview.cutCount} разрезов — фермент не уникален. Для backbone обычно нужен 1 разрез.
              </div>
            )}
          </div>
        )}

        {/* B4 (audit) — methylation caution for ANY selected Dam/Dcm-sensitive
            enzyme (was gated to exactly 2 enzymes via checkDoubleDigest, so a
            single XbaI/ClaI/BclI or SmaI surfaced no warning even though
            methylation blocks the cut regardless of single vs double digest). */}
        {(() => {
          const methyl = enzymes
            .map((n) => ({ n, e: RE_ENZYMES[n] }))
            .filter(({ e }) => e && (e.damSensitive || e.dcmSensitive));
          if (methyl.length === 0) return null;
          const label = ({ n, e }) => {
            const tags = [e.damSensitive && 'Dam', e.dcmSensitive && 'Dcm'].filter(Boolean).join('/');
            return `${n} (${tags})`;
          };
          return (
            <div
              data-testid="cut-op-warn-methylation"
              style={{
                padding: '6px 8px', background: '#fef3c7', border: '1px solid #d97706',
                borderRadius: 4, fontSize: 11, color: '#7c2d12', lineHeight: 1.4,
              }}
            >
              <strong>⚠ Метилирование:</strong> {methyl.map(label).join(', ')} — сайт блокируется метилированием; нарезайте ДНК из dam⁻/dcm⁻ штамма (напр. JM110 / GM2163).
            </div>
          );
        })()}

        {/* R4-BIO-3: double-digest compatibility warning. RC-2/RC-6 — read the
            ACTUAL checkDoubleDigest contract { simultaneous, buffer, temp,
            warnings[] }. The old code checked compat.compatible/reason/
            recommendation, fields the function never returns → the warning was
            permanently dead (buffer/temp + Dam/Dcm cautions never surfaced). */}
        {enzymes.length === 2 && (() => {
          const compat = checkDoubleDigest(enzymes[0], enzymes[1]);
          if (compat && Array.isArray(compat.warnings) && compat.warnings.length > 0) {
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
                <strong>⚠ Double-digest{compat.simultaneous ? ' (одновременно возможно, но):' : ':'}</strong>
                {compat.warnings.map((w, i) => (
                  <div key={i} style={{ marginTop: 2 }}>{w}</div>
                ))}
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
