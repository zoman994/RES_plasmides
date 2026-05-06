import { useEffect, useMemo, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { computeResourceHash } from '../lib/resource-hash';
import { computeSuggestedName } from '../lib/compute-suggested-name';

const S = STRINGS.importer;

/**
 * PrimerWizardStepModal — M-B.1 K6 (DEC-IMP-11 ⚓).
 *
 * Surfaces an opt-in checkbox-list of primers extracted from .dna metadata
 * during Confirm. Each row shows the primer name, sequence, length, Tm, and
 * a status chip (default 'imported'). When the primer's resourceHash matches
 * an existing entry in the unified pool the row is flagged as a duplicate
 * (warning chip + checkbox unchecked by default); biolog can re-check it,
 * which triggers an autoname (M13 Forward → M13 Forward (1)) at Add time.
 *
 * On Add the parent calls `addPrimerToPool` with the unified-pool metadata
 * (`status='imported'`, `origin={kind:'file_import', sourceFile}`,
 * `projectId = currentProjectId || null`).
 *
 * Props:
 *   primers       PrimerInput[]      — { name, sequence, tm?, length?, direction?, sourceFile? }
 *   existingNames Set<string>        — names already in the pool (for autoname collisions)
 *   checkDupe     async (hash) => Primer | undefined
 *   onAdd         (selected: PreparedPrimer[]) => void  — see prepared shape below
 *   onSkip        () => void
 *   onCancel      () => void
 *
 * PreparedPrimer = { ...primer, name, resourceHash, _wasDupe }
 */
export default function PrimerWizardStepModal({
  primers = [],
  existingNames,
  checkDupe,
  onAdd,
  onSkip,
  onCancel,
}) {
  // Async per-primer state: { hash, dupeOf | null, suggestedName }
  const [meta, setMeta] = useState(() => primers.map(p => ({
    hash: null, dupeOf: null, suggestedName: p.name,
  })));
  const [selected, setSelected] = useState(() => primers.map(() => true));

  // One-shot async preparation: hash + dupe check + autoname suggestion.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await Promise.all(primers.map(async (p, i) => {
        let hash = null;
        try {
          hash = await computeResourceHash({
            sequence: p.sequence,
            topology: 'linear',
            ends: { left: '5', right: '3' },
          });
        } catch { /* leave null */ }
        const dupe = (hash && checkDupe) ? await checkDupe(hash) : null;
        const names = new Set(existingNames || []);
        // If a previous row in this same modal will land on `p.name`, count it too.
        for (let j = 0; j < i; j += 1) names.add(primers[j].name);
        const suggestedName = computeSuggestedName(p.name || `primer-${i + 1}`, names);
        return { hash, dupeOf: dupe || null, suggestedName };
      }));
      if (cancelled) return;
      setMeta(next);
      // Default: dupes start unchecked, everything else checked.
      setSelected(next.map(m => !m.dupeOf));
    })();
    return () => { cancelled = true; };
  }, [primers, existingNames, checkDupe]);

  const checkedCount = useMemo(() => selected.filter(Boolean).length, [selected]);

  const onAddClick = () => {
    const prepared = primers
      .map((p, i) => {
        if (!selected[i]) return null;
        const m = meta[i];
        const wasDupe = !!m?.dupeOf;
        const finalName = wasDupe ? m.suggestedName : (m?.suggestedName || p.name);
        return {
          ...p,
          name: finalName,
          resourceHash: m?.hash || null,
          _wasDupe: wasDupe,
        };
      })
      .filter(Boolean);
    onAdd(prepared);
  };

  return (
    <div
      data-testid="importer-primer-wizard"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(28,25,23,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div
        style={{
          width: 640, maxWidth: '100%', maxHeight: '85vh',
          background: 'var(--surface-1, #fff)',
          borderRadius: 'var(--radius-lg, 10px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 12,
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
          {S.primerWizardTitle(primers.length)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {S.primerWizardPoolHint}
        </div>

        <ol
          data-testid="importer-primer-wizard-list"
          style={{
            listStyle: 'none', margin: 0, padding: 0,
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflowY: 'auto',
            maxHeight: 360,
          }}
        >
          {primers.map((p, i) => {
            const m = meta[i] || {};
            const isDupe = !!m.dupeOf;
            const displayName = isDupe ? m.suggestedName : (m.suggestedName || p.name);
            return (
              <li
                key={p.name + ':' + i}
                data-testid={`importer-primer-row-${p.name}`}
                data-dupe={isDupe ? 'true' : 'false'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  borderBottom: '0.5px solid var(--border-subtle)',
                  background: isDupe ? 'var(--warning-bg, #fffbeb)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!selected[i]}
                  onChange={(e) => setSelected(prev => {
                    const next = [...prev];
                    next[i] = e.target.checked;
                    return next;
                  })}
                  data-testid={`importer-primer-check-${p.name}`}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {displayName}
                    {isDupe && (
                      <span
                        data-testid={`importer-primer-dupe-${p.name}`}
                        style={{
                          marginLeft: 8, fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--warning-chip, #fef3c7)',
                          color: 'var(--warning-text, #92400e)',
                        }}
                      >{S.primerDupeBadge}</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono, monospace)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.sequence}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {S.primerMeta(p.length || p.sequence?.length || 0, p.tm, p.direction)}
                  </div>
                </div>
                <span
                  data-testid={`importer-primer-status-${p.name}`}
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                  }}
                >{S.primerStatusImported}</span>
              </li>
            );
          })}
        </ol>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)' }}>
            {S.primerWizardSelectedCount(checkedCount, primers.length)}
          </div>
          <button
            type="button"
            data-testid="importer-primer-wizard-skip"
            onClick={onSkip}
            style={{
              padding: '6px 12px', fontSize: 12,
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >{S.primerWizardSkip}</button>
          <button
            type="button"
            data-testid="importer-primer-wizard-add"
            onClick={onAddClick}
            disabled={checkedCount === 0}
            style={{
              padding: '6px 14px', fontSize: 12,
              border: '0.5px solid var(--accent-500, #f59e0b)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-500, #f59e0b)',
              color: 'var(--surface-1, #fff)',
              cursor: checkedCount > 0 ? 'pointer' : 'not-allowed',
              opacity: checkedCount > 0 ? 1 : 0.5,
            }}
          >{S.primerWizardAdd(checkedCount)}</button>
        </div>
      </div>
    </div>
  );
}
