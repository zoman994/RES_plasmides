/**
 * CodonStatsPanel — overlay showing codon usage stats для highlighted
 * молекулы. Биолог нажимает "Codon stats" → видит CDS аннотации с
 * % E.coli-preferred codons и список rare codons.
 *
 * R9-3 (14.05.2026). Без UI helpers были невидимы; теперь биолог
 * может прямо в canvas посмотреть оптимизацию.
 */
import { useMemo, useState } from 'react';
import { useSkeletonState } from './store/skeleton-context';
import { codonScore, findRareCodons, optimizeCdsForEcoli } from '../../lib/bio/codon-optimize-ecoli';
import { Icon } from '../icons/Icon';

function isCDSAnnotation(ann) {
  const candidates = [ann?.type, ann?.kind, ann?.feature, ann?.featureType];
  for (const c of candidates) {
    if (typeof c === 'string' && c.toUpperCase() === 'CDS') return true;
  }
  if (typeof ann?.name === 'string' && /\bCDS\b/i.test(ann.name)) return true;
  return false;
}

export default function CodonStatsPanel() {
  const state = useSkeletonState();
  const [open, setOpen] = useState(false);

  const highlighted = state.highlightedContainerId
    ? state.containers.find((c) => c.id === state.highlightedContainerId)
    : null;

  const cdsList = useMemo(() => {
    if (!highlighted?.sequence || !Array.isArray(highlighted.annotations)) return [];
    return highlighted.annotations
      .filter((a) => isCDSAnnotation(a) && typeof a.start === 'number' && typeof a.end === 'number' && (a.end - a.start) >= 6)
      .map((a) => {
        const start = Math.max(0, a.start);
        const end = Math.min(highlighted.sequence.length, a.end);
        const seq = highlighted.sequence.slice(start, end);
        return {
          id: a.id || a.name,
          name: a.name || 'CDS',
          start, end, length: end - start,
          sequence: seq,
          score: codonScore(seq),
          rare: findRareCodons(seq),
        };
      });
  }, [highlighted]);

  if (!highlighted) return null;
  const hasCds = cdsList.length > 0;

  return (
    <>
      <button
        type="button"
        data-testid="skeleton-codon-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Codon usage (E.coli K-12)"
        style={{
          position: 'absolute',
          bottom: 20,
          left: 610,
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
          opacity: hasCds ? 1 : 0.5,
        }}
      >
        <Icon name="dna" size={14} style={{ display: 'inline-block', verticalAlign: '-2px' }} />
        <span>Codon stats {hasCds ? `(${cdsList.length})` : ''}</span>
      </button>

      {open && (
        <div
          data-testid="skeleton-codon-panel"
          style={{
            position: 'fixed',
            top: 0, right: 0, bottom: 0,
            width: 480, maxWidth: '95vw',
            background: 'var(--surface-1, #fff)',
            borderLeft: '1px solid var(--border-default, #d6d3d1)',
            boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 100,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-default, #d6d3d1)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
              Codon usage — {highlighted.name || '?'} (E.coli K-12)
            </span>
            <button
              type="button"
              data-testid="skeleton-codon-close"
              onClick={() => setOpen(false)}
              style={{
                padding: '5px 8px',
                background: 'transparent',
                color: 'var(--text-tertiary, #a8a29e)',
                border: '1px solid var(--border-default, #d6d3d1)',
                borderRadius: 4, fontSize: 13, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><Icon name="close" size={13} /></button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!hasCds && (
              <div style={{ color: 'var(--text-tertiary, #a8a29e)', fontSize: 12 }}>
                В этой молекуле нет CDS аннотаций.
              </div>
            )}
            {cdsList.map((cds) => (
              <CdsCard key={cds.id} cds={cds} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CdsCard({ cds }) {
  const { score, rare } = cds;
  const optimized = useMemo(() => optimizeCdsForEcoli(cds.sequence), [cds.sequence]);

  return (
    <div
      data-testid={`skeleton-codon-card-${cds.id}`}
      style={{
        border: '1px solid var(--border-default, #d6d3d1)',
        borderRadius: 6,
        padding: 10,
        background: 'var(--surface-1, #fff)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {cds.name}
        <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-tertiary)' }}>
          {cds.start}–{cds.end} ({cds.length} bp, {score.totalCodons} codons)
        </span>
      </div>
      <div style={{ fontSize: 11, marginBottom: 8 }}>
        Preferred-codon match: <strong>{score.percent}%</strong>
        {' '}({score.preferredCount}/{score.totalCodons})
        {' '}{score.percent >= 80 ? '✓' : score.percent >= 50 ? '⚠' : '⚠⚠'}
      </div>
      {rare.length > 0 && (
        <div style={{ fontSize: 10.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>
            Rare codons ({rare.length}):
          </div>
          <div style={{
            fontFamily: 'monospace',
            maxHeight: 100,
            overflow: 'auto',
            border: '1px solid var(--border-default, #e7e5e4)',
            borderRadius: 4,
            padding: 4,
            background: 'var(--surface-2, #f5f5f4)',
          }}>
            {rare.slice(0, 30).map((r) => (
              <div key={r.position}>
                pos {r.position}: {r.codon} ({r.aa}) → {r.preferred}
              </div>
            ))}
            {rare.length > 30 && (
              <div style={{ color: 'var(--text-tertiary)' }}>+{rare.length - 30} more…</div>
            )}
          </div>
        </div>
      )}
      {optimized.changes > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, cursor: 'pointer' }}>
            E.coli-optimized variant ({optimized.changes} silent mutations)
          </summary>
          <pre
            data-testid={`skeleton-codon-optimized-${cds.id}`}
            style={{
              fontSize: 10.5,
              fontFamily: 'monospace',
              maxHeight: 120,
              overflow: 'auto',
              border: '1px solid var(--border-default, #e7e5e4)',
              borderRadius: 4,
              padding: 4,
              margin: '4px 0 0 0',
              background: 'var(--surface-2, #f5f5f4)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}
          >{optimized.optimized}</pre>
        </details>
      )}
    </div>
  );
}
