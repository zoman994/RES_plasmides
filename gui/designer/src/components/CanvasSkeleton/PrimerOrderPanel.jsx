/**
 * PrimerOrderPanel — lists oligonucleotide containers с готовыми
 * праймерами и копирует в clipboard в форматах TSV / FASTA / Evrogen-form.
 *
 * R6-3 (14.05.2026). Биолог нажимает кнопку «Заказ олигов» → видит
 * все праймеры из canvas (designed PCR + KLD pairs + любые загруженные)
 * → выбирает формат и копирует.
 *
 * TSV format columns:
 *   Name<TAB>Sequence<TAB>Scale<TAB>Purification<TAB>Modifications
 * Подходит для bulk upload форм Evrogen / Syntol / Sintol / IDT.
 */
import { useMemo, useState } from 'react';
import { useSkeletonState } from './store/skeleton-context';

function collectOligoPrimers(containers) {
  const out = [];
  for (const c of containers || []) {
    if (c?.kind !== 'oligonucleotide') continue;
    const seqs = c.payload?.sequences || [];
    for (let i = 0; i < seqs.length; i += 1) {
      const s = seqs[i];
      if (!s?.sequence) continue;
      const baseName = c.name || c.id.slice(0, 8);
      const partName = s.name || (i === 0 ? 'fwd' : i === 1 ? 'rev' : `p${i + 1}`);
      out.push({
        containerId: c.id,
        name: `${baseName}_${partName}`,
        sequence: s.sequence.toUpperCase(),
        length: s.sequence.length,
        Tm: s.Tm,
        GC: s.GC,
      });
    }
  }
  return out;
}

/**
 * B1 (audit) — realised PCR ops carry their pair in params.userPrimers but produce
 * NO oligonucleotide container, so the order list was empty after «Realise». Scan
 * ops too; skip any op whose output IS an oligo container (executed path) to avoid
 * double-counting.
 */
function collectFromOps(operations, containers) {
  const oligoIds = new Set((containers || []).filter((c) => c?.kind === 'oligonucleotide').map((c) => c.id));
  const out = [];
  for (const op of operations || []) {
    const ups = Array.isArray(op?.params?.userPrimers) ? op.params.userPrimers : [];
    if (!ups.length) continue;
    if (Array.isArray(op.outputs) && op.outputs.some((id) => oligoIds.has(id))) continue;
    const base = (op.origin && op.origin.segmentId) || (op.id ? op.id.slice(0, 8) : 'op');
    for (const up of ups) {
      if (up?.forward) out.push({ containerId: op.id, name: `${base}_fwd`, sequence: String(up.forward).toUpperCase(), length: up.forward.length, Tm: up.fwdTm });
      if (up?.reverse) out.push({ containerId: op.id, name: `${base}_rev`, sequence: String(up.reverse).toUpperCase(), length: up.reverse.length, Tm: up.revTm });
    }
  }
  return out;
}

function asTSV(primers, scale, purification) {
  const lines = ['Name\tSequence\tScale\tPurification\tModifications'];
  for (const p of primers) {
    lines.push(`${p.name}\t${p.sequence}\t${scale}\t${purification}\t-`);
  }
  return lines.join('\n');
}

function asFASTA(primers) {
  const lines = [];
  for (const p of primers) {
    const meta = [];
    if (p.length) meta.push(`${p.length} nt`);
    if (p.Tm) meta.push(`Tm ${p.Tm}°C`);
    if (p.GC) meta.push(`GC ${p.GC}%`);
    const header = meta.length ? ` | ${meta.join(' | ')}` : '';
    lines.push(`>${p.name}${header}`);
    lines.push(p.sequence);
  }
  return lines.join('\n');
}

function asPlain(primers) {
  const lines = [];
  for (const p of primers) {
    const meta = [];
    if (p.length) meta.push(`${p.length} nt`);
    if (p.Tm) meta.push(`Tm=${p.Tm}°C`);
    if (p.GC) meta.push(`GC=${p.GC}%`);
    lines.push(`${p.name}: 5'-${p.sequence}-3'${meta.length ? ` (${meta.join(', ')})` : ''}`);
  }
  return lines.join('\n');
}

export default function PrimerOrderPanel() {
  const state = useSkeletonState();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('tsv'); // tsv | fasta | plain
  const [scale, setScale] = useState('25 nmol');
  const [purification, setPurification] = useState('Standard desalt');
  const [copied, setCopied] = useState(false);

  const primers = useMemo(
    () => [
      ...collectOligoPrimers(state.containers || []),
      ...collectFromOps(state.operations || [], state.containers || []),
    ],
    [state.containers, state.operations],
  );

  const exportText = useMemo(() => {
    if (format === 'fasta') return asFASTA(primers);
    if (format === 'plain') return asPlain(primers);
    return asTSV(primers, scale, purification);
  }, [primers, format, scale, purification]);

  const onCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(exportText);
      } else {
        const ta = document.createElement('textarea');
        ta.value = exportText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { /* best-effort */ }
  };

  return (
    <>
      <button
        type="button"
        data-testid="skeleton-primer-order-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Заказ олигонуклеотидов"
        style={{
          // B2 — bottom-right action stack (above «Протокол» + «Очистить»); the
          // old bottom-left position overlaid the assembly workspace content.
          position: 'absolute',
          bottom: 240,
          right: 24,
          zIndex: 30,
          padding: '8px 14px',
          background: 'var(--surface-2, #f5f5f4)',
          color: 'var(--text-primary, #1c1917)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          opacity: primers.length > 0 ? 1 : 0.6,
        }}
      >
        <span>🧪</span>
        <span>Заказ олигов {primers.length > 0 ? `(${primers.length})` : ''}</span>
      </button>

      {open && (
        <div
          data-testid="skeleton-primer-order-panel"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 520,
            maxWidth: '95vw',
            background: 'var(--surface-1, #fff)',
            borderLeft: '1px solid var(--border-default, #d6d3d1)',
            boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border-default, #d6d3d1)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
              Заказ олигонуклеотидов ({primers.length})
            </span>
            <button
              type="button"
              data-testid="skeleton-primer-order-copy"
              onClick={onCopy}
              disabled={primers.length === 0}
              style={{
                padding: '5px 10px',
                background: copied ? 'var(--success-500, #16a34a)' : 'var(--accent-500, #d97706)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: primers.length === 0 ? 'not-allowed' : 'pointer',
                opacity: primers.length === 0 ? 0.5 : 1,
              }}
            >
              {copied ? '✓ Скопировано' : 'Копировать'}
            </button>
            <button
              type="button"
              data-testid="skeleton-primer-order-close"
              onClick={() => setOpen(false)}
              style={{
                padding: '5px 8px',
                background: 'transparent',
                color: 'var(--text-tertiary, #a8a29e)',
                border: '1px solid var(--border-default, #d6d3d1)',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--border-default, #d6d3d1)',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              fontSize: 11,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Формат:
              <select
                data-testid="skeleton-primer-order-format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                style={{
                  padding: '3px 6px',
                  border: '1px solid var(--border-default, #d6d3d1)',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                <option value="tsv">TSV (Evrogen / Syntol bulk)</option>
                <option value="fasta">FASTA</option>
                <option value="plain">Plain text</option>
              </select>
            </label>
            {format === 'tsv' && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Scale:
                  <select
                    value={scale}
                    onChange={(e) => setScale(e.target.value)}
                    style={{
                      padding: '3px 6px',
                      border: '1px solid var(--border-default, #d6d3d1)',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    <option value="25 nmol">25 nmol</option>
                    <option value="100 nmol">100 nmol</option>
                    <option value="250 nmol">250 nmol</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Purification:
                  <select
                    value={purification}
                    onChange={(e) => setPurification(e.target.value)}
                    style={{
                      padding: '3px 6px',
                      border: '1px solid var(--border-default, #d6d3d1)',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    <option value="Standard desalt">Standard desalt</option>
                    <option value="HPLC">HPLC</option>
                    <option value="PAGE">PAGE</option>
                  </select>
                </label>
              </>
            )}
          </div>

          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {primers.length === 0 && (
              <div style={{ color: 'var(--text-tertiary, #a8a29e)', fontSize: 12, padding: 8 }}>
                Нет олигонуклеотидов на canvas. Запустите PCR с auto-design праймеров,
                или загрузите oligo контейнер в Library.
              </div>
            )}
            {primers.length > 0 && (
              <>
                <PrimerTable primers={primers} />
                <pre
                  data-testid="skeleton-primer-order-text"
                  style={{
                    fontSize: 11,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    background: 'var(--surface-2, #f5f5f4)',
                    border: '1px solid var(--border-default, #d6d3d1)',
                    borderRadius: 4,
                    padding: 10,
                    margin: 0,
                    overflow: 'auto',
                    whiteSpace: 'pre',
                  }}
                >
                  {exportText}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PrimerTable({ primers }) {
  return (
    <table
      data-testid="skeleton-primer-order-table"
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 11,
        background: 'var(--surface-1, #fff)',
      }}
    >
      <thead>
        <tr style={{ background: 'var(--surface-2, #f5f5f4)', borderBottom: '1px solid var(--border-default, #d6d3d1)' }}>
          <th style={cellStyle}>Name</th>
          <th style={cellStyle}>Sequence (5'→3')</th>
          <th style={{ ...cellStyle, textAlign: 'right' }}>nt</th>
          <th style={{ ...cellStyle, textAlign: 'right' }}>Tm</th>
          <th style={{ ...cellStyle, textAlign: 'right' }}>GC%</th>
        </tr>
      </thead>
      <tbody>
        {primers.map((p, i) => (
          <tr key={`${p.containerId}-${i}`} style={{ borderBottom: '1px solid var(--border-default, #d6d3d1)' }}>
            <td style={cellStyle}>{p.name}</td>
            <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{p.sequence}</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{p.length}</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{p.Tm || '-'}</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>{p.GC || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cellStyle = {
  padding: '4px 6px',
  textAlign: 'left',
  verticalAlign: 'top',
};
