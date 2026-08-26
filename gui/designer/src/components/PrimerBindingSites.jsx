/**
 * PrimerBindingSites — PRIMER-1/5 UI (Игорь /loop 28.06): «куда комплиментарен» +
 * specificity audit. Lists WHERE across the library a primer anneals. PRIMER-5 adds:
 *   • «± мисматчи» toggle → weakly-complementary (1-mismatch) sites, with a 3′-clamp
 *     mismatch flag (3′ mismatch = won't prime; internal = mispriming risk).
 *   • a multi-binding warning when ≥2 sites can actually prime (off-target / неспецифичность).
 * Self-contained: reads the library pool from the store, runs the pure scan.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { scanLibraryForPrimer, summarizeBindingHits } from '../lib/primer-binding-search';
import { tf, t } from '../i18n';

export default function PrimerBindingSites({ primer }) {
  const libraryEntries = useStore((s) => s.libraryEntries);
  const hydrateLibrary = useStore((s) => s.hydrateLibrary);
  const [fuzzy, setFuzzy] = useState(false);

  // PRIMER-8 (V179, robustness) — «куда садится» searches the library; ensure it
  // is hydrated even if the user reaches a primer view before App-boot hydration
  // completes (cold start / slow Dexie). Idempotent (hydrateLibrary self-guards on
  // _libraryHydrated); mirrors PrimerPoolList/useEntryPrimers' hydratePrimers.
  useEffect(() => {
    if (typeof hydrateLibrary !== 'function') return;
    if (typeof indexedDB === 'undefined') return;
    Promise.resolve(hydrateLibrary()).catch(() => {});
  }, [hydrateLibrary]);

  const hits = useMemo(() => {
    const entries = Object.values(libraryEntries || {}).map((e) => ({
      id: e.id,
      name: e.name || (e.payload && e.payload.name) || e.id,
      sequence: (e.payload && e.payload.sequence) || '',
      // library topology is a string ('circular'|'linear') → engine wants {circular}
      topology: { circular: ((e.payload && e.payload.topology) || '') === 'circular' },
    })).filter((e) => e.sequence);
    const list = scanLibraryForPrimer(primer, entries, { maxMismatches: fuzzy ? 1 : 0 });
    // exact first, then fewest mismatches, then by molecule name
    return list.sort((a, b) => (a.mismatches - b.mismatches)
      || String(a.entryName).localeCompare(String(b.entryName)));
  }, [primer, libraryEntries, fuzzy]);

  const summary = useMemo(() => summarizeBindingHits(hits), [hits]);

  // ANN-0L — what the FILE said is a different kind of fact from what a scan
  // found. Source sites are listed first and separately; the library scan below
  // stays an analysis and never gets promoted into a stored site.
  const sourceSites = Array.isArray(primer?.sites) ? primer.sites : [];

  return (
    <div data-testid="primer-binding-sites" className="mt-1.5 space-y-1">
      {sourceSites.length > 0 && (
        <div data-testid="primer-source-sites" className="space-y-1">
          <span className="text-[9px] text-gray-400 uppercase tracking-wide">
            {tf('primer.sourceSites', { n: sourceSites.length })}
          </span>
          {sourceSites.map((st, i) => {
            const segs = st?.location?.segments || [];
            const first = segs[0];
            const last = segs[segs.length - 1];
            const hidden = st?.sourceVisibility === 'hidden';
            return (
              <div
                key={st.id || i}
                data-testid="primer-source-site"
                data-primer-site-id={st.id || ''}
                data-primer-visibility={st?.sourceVisibility || 'shown'}
                className={`text-[10px] border rounded px-2 py-1 flex items-center gap-2 flex-wrap ${
                  hidden
                    ? 'bg-gray-50 border-dashed border-gray-300 text-gray-500'
                    : 'bg-sky-50 border-sky-200 text-sky-800'
                }`}
              >
                <span className="font-mono">
                  {first ? `${first.start + 1}–${last.end}` : '—'}
                  {segs.length > 1 ? ' · через ориджин' : ''}
                </span>
                <span className="font-mono">
                  {st?.strand === -1 ? '◂ rev' : st?.strand === 1 ? 'fwd ▸' : '?'}
                </span>
                {st?.tail ? (
                  <span className="text-[8px] px-1 rounded bg-amber-100 text-amber-700">
                    5′ {st.tail}
                  </span>
                ) : null}
                <span className="text-[8px] px-1 rounded bg-white/60">
                  {hidden ? t('primer.siteHidden') : t('primer.siteSource')}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-gray-400 uppercase tracking-wide">
          Садится в библиотеке ({hits.length})
        </span>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="primer-binding-fuzzy-toggle"
          onClick={() => setFuzzy((v) => !v)}
          aria-pressed={fuzzy}
          className={`text-[9px] px-1.5 py-0.5 rounded border ${fuzzy ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-gray-200 text-gray-500'}`}
          title="Показать слабокомплементарные сайты (до 1 мисматча)"
        >± мисматчи</button>
      </div>

      {summary.multiBinding && (
        <div
          data-testid="primer-binding-multibinding"
          className="text-[10px] bg-amber-50 border border-amber-300 text-amber-800 rounded px-2 py-1"
        >
          ⚠ Мультибайндинг: {summary.primingSites} сайт(а/ов) посадки — риск неспецифичной ПЦР
        </div>
      )}

      {hits.length === 0 && (
        <div data-testid="primer-binding-empty" className="text-[10px] text-gray-500">
          {fuzzy ? 'Сайтов посадки (вкл. слабые) не найдено' : 'Точных связываний в библиотеке не найдено'}
        </div>
      )}

      {hits.map((h, i) => (
        <div
          key={`${h.entryId}-${h.strand}-${h.start}-${i}`}
          className="text-[10px] bg-indigo-50 border border-indigo-200 rounded px-2 py-1 flex items-center gap-2 flex-wrap"
        >
          <span className="font-semibold text-indigo-800 truncate max-w-[150px]" title={h.entryName}>{h.entryName}</span>
          <span className={`px-1 rounded font-mono ${h.strand === '+' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
            {h.strand === '+' ? 'fwd ▸' : '◂ rev'}
          </span>
          <span className="text-indigo-600 font-mono">
            {h.start + 1}–{h.end}{h.wraps ? ' · через ориджин' : ''}
          </span>
          {h.mismatches === 0 ? (
            <span className="text-[8px] px-1 rounded bg-green-100 text-green-700">точно</span>
          ) : h.threePrimeMismatch ? (
            <span className="text-[8px] px-1 rounded bg-gray-100 text-gray-500" title="Мисматч на 3′-конце — не праймится">
              {h.mismatches} мисмат. · 3′✗
            </span>
          ) : (
            <span className="text-[8px] px-1 rounded bg-amber-100 text-amber-700" title="Внутренний мисматч — возможен неспецифичный отжиг">
              {h.mismatches} мисмат.
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
