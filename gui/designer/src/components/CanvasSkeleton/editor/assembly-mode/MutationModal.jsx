/**
 * MutationModal — M-CANVAS-WORKFLOW-UX K14 (SPEC §5.2). Add a per-base
 * SUBSTITUTION to a sourced piece (single-base only — indels go through the
 * node-level «Mutate» operation). K11 primer-derive applies it to the binding
 * region of the piece's amplification primer.
 * Closes on Esc / click-outside (ui-interactions modal contract).
 */
import { useEffect, useState } from 'react';

const BASES = ['A', 'C', 'G', 'T'];
const KINDS = [
  { id: 'silent', label: 'Silent' },
  { id: 'missense', label: 'Missense' },
  { id: 'nonsense', label: 'Nonsense' },
];

export default function MutationModal({
  sourceName, defaultPosition, fromBase, sequence, onConfirm, onCancel, kldApplies = false,
}) {
  const [position, setPosition] = useState(
    Number.isFinite(defaultPosition) ? defaultPosition : 0,
  );
  // A15 (audit) — the original base is derived from the piece sequence at the
  // CURRENT position (reactive), so editing Position updates «Original base» + the
  // stored fromBase instead of leaving the seeded base stale. Falls back to the
  // seeded fromBase prop when no sequence was passed.
  const effectiveFromBase = String(
    (typeof sequence === 'string' && sequence[position]) || fromBase || '',
  ).toUpperCase();
  const [toBase, setToBase] = useState(
    BASES.find((b) => b !== effectiveFromBase) || 'T',
  );
  const [kind, setKind] = useState('silent');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // H2/M2 (audit) — an auto mutagenic primer only carries the edit if it falls in
  // a TERMINAL binding window (~36 nt from either end of the piece). An interior
  // substitution is sliced away from both primers → the ordered oligos amplify
  // wild-type while the in-silico product shows the edit (biologically impossible).
  // Block out-of-range; warn (don't silently accept) an interior position.
  // V197 — a whole-plasmid KLD mutagenesis (circular, single segment) anneals the
  // mutagenic primers BACK-TO-BACK at the mutation site, so ANY position — interior
  // included — is carried by the ordered oligos. The terminal-binding-window caveat
  // only applies when the piece is amplified as a FRAGMENT by terminal primers, so
  // suppress the «amplify wild-type» warning when KLD applies (else it is a false alarm
  // on the exact standalone-plasmid mutagenesis the tool is meant to support).
  const BINDING_WINDOW = 36;
  const seqLen = typeof sequence === 'string' && sequence.length > 0 ? sequence.length : null;
  const outOfRange = seqLen != null && (position < 0 || position >= seqLen);
  const interior = seqLen != null && !outOfRange && !kldApplies
    && position >= BINDING_WINDOW && position < seqLen - BINDING_WINDOW;

  const apply = () => {
    if (outOfRange) return; // guarded — button is disabled too
    onConfirm({
      position: Number(position),
      fromBase: effectiveFromBase, // A15 — derived at the current position
      toBase: toBase.toUpperCase(),
      kind,
      notes: notes.trim(),
    });
  };

  return (
    <div
      role="dialog"
      data-testid="mutation-modal"
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
        }}
      >
        <div style={hdr}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            Mutation на {sourceName || 'piece'} position {position}
          </strong>
          <button type="button" data-testid="mutation-cancel" onClick={onCancel} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={lbl}>
              Position
              <input
                data-testid="mutation-position"
                type="number"
                min={0}
                max={seqLen != null ? seqLen - 1 : undefined}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                style={numInp}
              />
            </label>
            <div data-testid="mutation-frombase" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              Original base: <strong style={{ color: 'var(--text-primary)' }}>{effectiveFromBase || '?'}</strong>
            </div>
            <label style={lbl}>
              New base
              <select
                data-testid="mutation-tobase"
                value={toBase}
                onChange={(e) => setToBase(e.target.value)}
                style={numInp}
              >
                {BASES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          </div>

          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              Эффект — метка (не проверяется по рамке считывания)
            </div>
            {KINDS.map((k) => (
              <label key={k.id} style={radioRow}>
                <input
                  type="radio"
                  name="mutation-kind"
                  data-testid={`mutation-kind-${k.id}`}
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                />
                {k.label}
              </label>
            ))}
          </div>

          <label style={lbl}>
            Notes (опц)
            <input
              data-testid="mutation-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="K77E / test substitution"
              style={textInp}
            />
          </label>

          {outOfRange && (
            <div
              data-testid="mutation-error"
              style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 600,
                color: '#7c2d12', background: '#fef3c7', border: '1px solid #d97706', borderRadius: 4,
              }}
            >
              ⛔ Позиция {position} вне куска (длина {seqLen}). Допустимо 0…{seqLen - 1}.
            </div>
          )}
          {interior && (
            <div
              data-testid="mutation-interior-warn"
              style={{
                padding: '6px 10px', fontSize: 11,
                color: '#7c2d12', background: '#fef3c7', border: '1px solid #d97706', borderRadius: 4,
              }}
            >
              ⚠ Позиция в середине куска (вне зоны отжига праймера ~{BINDING_WINDOW} нт от концов).
              Автоматический праймер НЕ установит эту замену — нужен mutagenic primer внутри
              (разрежьте кусок по позиции) или QuikChange-протокол. Продукт покажет правку, но
              заказанные олиги амплифицируют дикий тип.
            </div>
          )}

          <div style={{
            padding: '6px 10px', fontSize: 10.5, color: 'var(--text-secondary)',
            background: 'var(--accent-wash, rgba(184,92,62,0.08))', borderRadius: 4,
          }}>
            Замена реализуется через mutagenic primer на куске, который
            амплифицируется (Overlap PCR / KLD). Только замена одного основания;
            вставки/делеции — через операцию «Mutate» на узле.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-2)' }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="mutation-cancel-2" onClick={onCancel} style={ghostBtn}>Отмена</button>
          <button
            type="button"
            data-testid="mutation-apply"
            onClick={apply}
            disabled={outOfRange}
            style={{ ...primaryBtn, opacity: outOfRange ? 0.5 : 1, cursor: outOfRange ? 'not-allowed' : 'pointer' }}
          >Применить</button>
        </div>
      </div>
    </div>
  );
}

const hdr = {
  display: 'flex', alignItems: 'center', padding: '8px 12px',
  borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)',
};
const ghostBtn = {
  fontSize: 11, padding: '4px 10px', background: 'transparent',
  border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)',
};
const primaryBtn = {
  fontSize: 11.5, padding: '5px 16px', background: 'var(--accent-500, #b85c3e)',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
};
const lbl = { display: 'flex', flexDirection: 'column', fontSize: 10.5, color: 'var(--text-secondary)' };
const numInp = {
  marginTop: 4, fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', width: 90,
};
const textInp = {
  marginTop: 4, fontSize: 12, padding: '5px 8px', border: '1px solid var(--border-subtle)',
  borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none',
  boxSizing: 'border-box',
};
const radioRow = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, marginRight: 12,
};
