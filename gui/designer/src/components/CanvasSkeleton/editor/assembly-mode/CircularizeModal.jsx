/**
 * CircularizeModal — M-CIRCULARIZE C1 (Игорь 12.06.2026). The single place to
 * decide topology + assembly/closure method, replacing the bare header topology
 * toggle + method dropdown. Primary purpose: «замкнуть сборку в плазмиду» — pick
 * the reaction that closes the ring (last fragment → first fragment), with the
 * biology surfaced per method.
 *
 * Decision (Игорь): one method applies to the WHOLE assembly (internal + closure);
 * per-junction override stays on the ромб. KLD is single-fragment self-closure.
 *
 * onConfirm({ circular, method, applyToAll }) — the caller (AssemblyShellBody)
 * dispatches setAssemblyDraftTopology + SET_ASSEMBLY_METHOD / closure config.
 * Mirrors the OpGroupPicker dialog contract (backdrop, Esc, confirm/cancel).
 */
import { useMemo, useState } from 'react';
import useModalKeyboardBoundary from '../../../../hooks/useModalKeyboardBoundary';
import { CLOSURE_METHODS, defaultEnzymeForMethod } from '../../lib/junction-derive';
import { validateClosure } from '../../lib/circularize-validate';
import { GG_ENZYMES } from '../../../../golden-gate';
import { RE_ENZYMES } from '../../../../restriction-db';

// F — enzyme choices offered per method. GG = the 5 Type IIS enzymes; RE = a
// curated set of common cloning workhorses (the full 63-enzyme DB is overkill for
// a closure dropdown — the per-junction ромб can reach the rest later).
const GG_ENZYME_KEYS = Object.keys(GG_ENZYMES);
const COMMON_RE_KEYS = ['EcoRI', 'BamHI', 'HindIII', 'XhoI', 'SalI', 'NdeI', 'NcoI', 'XbaI', 'PstI', 'KpnI', 'SacI', 'SpeI', 'NheI', 'BglII']
  .filter((k) => RE_ENZYMES[k]);
function enzymeKeysFor(method) {
  if (method === 'golden_gate' || method === 'moclo') return GG_ENZYME_KEYS; // #111 MoClo = Type IIS
  if (method === 'restriction') return COMMON_RE_KEYS;
  return [];
}

// C4 — validation badge palette by level (design-system emerald/amber).
const VBADGE = {
  ok: { background: 'var(--emerald-wash, rgba(74,124,89,0.12))', color: 'var(--emerald, #4A7C59)' },
  warn: { background: 'var(--amber-wash, rgba(184,122,14,0.12))', color: 'var(--amber, #B87A0E)' },
  info: { background: 'var(--surface-1)', color: 'var(--text-tertiary)' },
};
const VLABEL = { ok: '✓ годится', warn: '⚠ проверьте', info: 'ⓘ инфо' };

// engine method → biolog label + colour + one-line biology + requirement.
const META = {
  overlap_pcr: {
    label: 'Overlap PCR', color: '#378ADD', stroke: '#185FA5',
    bio: 'Гомологичные хвосты праймеров сшивают концы при ПЦР.',
    req: 'гомология концов ≥15 bp',
  },
  gibson: {
    label: 'Gibson Assembly', color: '#378ADD', stroke: '#185FA5',
    bio: 'Экзонуклеаза грызёт концы → гомология отжигается → полимераза+лигаза. Бесшовно, 50 °C.',
    req: 'гомология концов ≥15–20 bp',
  },
  golden_gate: {
    label: 'Golden Gate', color: '#1D9E75', stroke: '#0F6E56',
    bio: 'Type IIS (BsaI) режет вне сайта → уникальные 4-нт свесы → лигирование. Скар-лесс.',
    req: 'фермент Type IIS, без внутренних сайтов',
  },
  // #111 — SLIC: overlap homology (Gibson family), exonuclease chew-back + in-vivo repair.
  slic: {
    label: 'SLIC', color: '#378ADD', stroke: '#185FA5',
    bio: 'T4 ДНК-полимераза (3′-экзо) грызёт концы → комплементарные одноцепочечные участки отжигаются → репарация in vivo. Без лигазы in vitro.',
    req: 'гомология концов ≥15–20 bp',
  },
  // #111 — MoClo: standardized Type IIS one-pot assembly = Golden Gate preset (BsaI).
  moclo: {
    label: 'MoClo', color: '#1D9E75', stroke: '#0F6E56',
    bio: 'Стандартизованные 4-нт fusion-сайты Type IIS (BsaI) → one-pot иерархическая сборка по синтаксису MoClo. Скар-лесс.',
    req: 'фермент Type IIS (BsaI), без внутренних сайтов',
  },
  restriction: {
    label: 'RE-лигирование', color: '#BA7517', stroke: '#854F0B',
    bio: 'Классические рестриктазы режут концы → совместимые свесы → T4-лигаза.',
    req: 'совместимые концы; разные ферменты → направленно',
  },
  kld: {
    label: 'KLD · ПЦР-продукт', color: '#D85A30', stroke: '#993C1D',
    bio: 'Для ПЦР-АМПЛИФИЦИРОВАННОГО фрагмента (мутагенез): киназа фосфорилирует ПЦР-концы → лигаза смыкает тупой круг → DpnI убирает матрицу.',
    req: 'ПЦР-продукт; ровно 1 фрагмент',
  },
  direct_ligation: {
    label: 'Тупое лигирование', color: '#888780', stroke: '#5F5E5A',
    bio: 'Для ФИЗИЧЕСКИ тупых концов (тупой рез рестриктазой) → T4-лигаза напрямую. Без ПЦР/киназы/DpnI.',
    req: 'физически тупые концы; 5′-фосфат',
  },
};

// RC-SEP (Игорь 25.06) — this modal is the CLOSURE-REACTION picker ONLY (topology is a
// header toggle; internal junctions are the strip ромбы). The closure reactions =
// ring-forming chemistries (Gibson / Golden Gate / KLD / RE sticky ligation) + blunt
// direct ligation. NO overlap_pcr — for a ring, overlap homology IS Gibson. KLD is
// single-fragment-only (gated below).
const CLOSURE_REACTIONS = [...CLOSURE_METHODS, 'direct_ligation'];

function ringPath(cx, cy, r, a0, a1) {
  const p = (a) => {
    const t = (a * Math.PI) / 180;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  };
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

const FRAG_FILL = ['#E6F1FB', '#EAF3DE', '#FAEEDA', '#E1F5EE', '#FBEAF0', '#EEEDFE'];

function Preview({ segments, circular, methodColor }) {
  const n = Math.max(1, segments);
  const cx = 90;
  const cy = 90;
  const r = 58;
  if (!circular) {
    const w = Math.min(150 / n, 34);
    return (
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`Линейная сборка из ${n} фрагментов`}>
        {Array.from({ length: n }).map((_, i) => (
          <rect key={i} x={20 + i * (w + 2)} y={78} width={w} height={24} rx={4} fill={FRAG_FILL[i % FRAG_FILL.length]} stroke="#888780" strokeWidth="1" />
        ))}
        <text x="90" y="128" textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">линейный — без замыкания</text>
      </svg>
    );
  }
  const gap = n === 1 ? 0 : 12;
  const step = 360 / n;
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`Кольцевая сборка из ${n} фрагментов`}>
      {n === 1 ? (
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={FRAG_FILL[0]} strokeWidth="20" />
      ) : (
        Array.from({ length: n }).map((_, i) => {
          const a0 = -90 + i * step + gap / 2;
          const a1 = -90 + (i + 1) * step - gap / 2;
          return <path key={i} d={ringPath(cx, cy, r, a0, a1)} stroke={FRAG_FILL[i % FRAG_FILL.length]} strokeWidth="20" fill="none" strokeLinecap="round" />;
        })
      )}
      {/* closure ромб at 12 o'clock (last → first) */}
      <g transform={`translate(${cx},${cy - r}) rotate(45)`} data-testid="circularize-preview-closure">
        <rect x="-8" y="-8" width="16" height="16" rx="2" fill="var(--surface-1, #fff)" stroke={methodColor} strokeWidth="2" />
        <rect x="-4" y="-4" width="8" height="8" rx="1" fill={methodColor} />
      </g>
      <text x="90" y="95" textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">плазмида</text>
    </svg>
  );
}

export default function CircularizeModal({
  draft, closureMethod, onConfirm, onCancel,
}) {
  const modalBoundary = useModalKeyboardBoundary(onCancel);
  const segments = (draft && draft.segments ? draft.segments.length : 0);
  // KLD is single-fragment self-closure; a multi-fragment ring defaults to Gibson.
  const closureDefault = segments === 1 ? 'kld' : 'gibson';
  const [method, setMethod] = useState(() => closureMethod || closureDefault);
  // F — the chosen enzyme (GG Type IIS / RE). Defaults per the initial method.
  const [enzyme, setEnzyme] = useState(() => defaultEnzymeForMethod(closureMethod || closureDefault));

  // KLD is only valid as single-fragment self-closure.
  const isDisabled = (id) => (id === 'kld' && segments !== 1);

  // If the active method got disabled / is unknown, fall back to the closure default.
  const effectiveMethod = useMemo(() => {
    if (CLOSURE_REACTIONS.includes(method) && !isDisabled(method)) return method;
    return closureDefault;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, segments, closureDefault]);

  const meta = META[effectiveMethod] || META.gibson;
  // F — the enzyme offered for the effective method (GG/RE only). A stale enzyme
  // from a previous method category (e.g. BsmBI after switching GG→RE) falls back
  // to the new method's default, so the picker + onConfirm stay coherent.
  const enzymeKeys = enzymeKeysFor(effectiveMethod);
  const needsEnzyme = enzymeKeys.length > 0;
  const effectiveEnzyme = useMemo(() => {
    if (!needsEnzyme) return null;
    return enzymeKeys.includes(enzyme) ? enzyme : defaultEnzymeForMethod(effectiveMethod);
  }, [needsEnzyme, enzymeKeys, enzyme, effectiveMethod]);
  // C4 — live biovalidation of the chosen reaction against the real fragments.
  const verdict = useMemo(
    () => validateClosure({
      method: effectiveMethod, segments: draft && draft.segments, circular: true, enzyme: effectiveEnzyme || 'BsaI',
    }),
    [effectiveMethod, draft, effectiveEnzyme],
  );

  return (
    <div
      role="dialog"
      data-testid="circularize-modal"
      {...modalBoundary}
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: '94%', background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 10px 32px rgba(28,25,23,0.26)', overflow: 'hidden',
        }}
      >
        <div style={hdr}>
          <span aria-hidden style={{ fontSize: 15, color: 'var(--accent-500, #b85c3e)' }}>◉</span>
          {/* RC-SEP — closure-reaction ONLY. Topology is the header toggle; internal
              junctions are the strip ромбы. */}
          <strong style={{ fontSize: 13, flex: 1 }}>Реакция замыкания кольца</strong>
          <button type="button" data-testid="circularize-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 14, padding: 14 }}>
          <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <Preview segments={segments} circular methodColor={meta.color} />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
              {segments} фрагм. · замыкание — {meta.label.split(' ')[0]}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
              как замыкается кольцо (последний → первый фрагмент). Стыки между фрагментами — ромбами на полоске.
            </div>
            {CLOSURE_REACTIONS.map((id) => {
              const m = META[id];
              const dis = isDisabled(id);
              const on = effectiveMethod === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`circularize-method-${id}`}
                  disabled={dis}
                  aria-pressed={on}
                  onClick={() => setMethod(id)}
                  style={{
                    textAlign: 'left', display: 'flex', gap: 9, alignItems: 'flex-start',
                    padding: on ? '7px 9px' : '8px 10px', cursor: dis ? 'not-allowed' : 'pointer',
                    opacity: dis ? 0.45 : 1,
                    border: `${on ? 2 : 1}px solid ${on ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'}`,
                    borderRadius: 6, background: on ? 'var(--surface-2)' : 'var(--surface-1)',
                  }}
                >
                  <span style={{
                    width: 12, height: 12, marginTop: 2, flexShrink: 0, borderRadius: 3,
                    transform: 'rotate(45deg)', background: m.color,
                  }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.label}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      {dis ? 'доступно только для 1 фрагмента' : m.req}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ margin: '0 14px 6px', padding: '9px 11px', background: 'var(--surface-2)', borderRadius: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              data-testid="circularize-validation"
              data-level={verdict.level}
              style={{
                fontSize: 10.5, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                fontWeight: 600, ...VBADGE[verdict.level],
              }}
            >
              {VLABEL[verdict.level]}
            </span>
            <span>{verdict.message}</span>
          </div>
          <span style={{ color: 'var(--text-primary)' }}>{meta.bio}</span>
        </div>

        {/* F — enzyme picker for the enzyme-driven methods (GG Type IIS / RE). */}
        {needsEnzyme && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 14px 6px', fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <span>{effectiveMethod === 'golden_gate' ? 'Фермент Type IIS:' : 'Рестриктаза:'}</span>
            <select
              data-testid="circularize-enzyme"
              value={effectiveEnzyme || ''}
              onChange={(e) => setEnzyme(e.target.value)}
              style={{
                fontSize: 11.5, padding: '3px 6px', borderRadius: 4,
                border: '1px solid var(--border-subtle)', background: 'var(--surface-1)', color: 'var(--text-primary)',
              }}
            >
              {enzymeKeys.map((k) => {
                const rec = effectiveMethod === 'golden_gate'
                  ? (GG_ENZYMES[k] && GG_ENZYMES[k].recognition)
                  : (RE_ENZYMES[k] && RE_ENZYMES[k].site);
                return <option key={k} value={k}>{`${k} (${rec})`}</option>;
              })}
            </select>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="circularize-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="circularize-confirm"
            onClick={() => onConfirm({ method: effectiveMethod, enzyme: effectiveEnzyme })}
            style={primaryBtn}
          >
            ◉ Применить замыкание
          </button>
        </div>
      </div>
    </div>
  );
}

const hdr = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
  borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)',
};
const ghostBtn = {
  fontSize: 11, padding: '5px 12px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 12, padding: '6px 16px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
