/**
 * useMarkdownRefResolver — drives the markdown @@ref display label
 * resolver from the project's entity state.
 *
 * Spec §3.2. On mount sets the resolver via setRefDisplayLabelResolver;
 * on unmount restores null so other parts of the app don't render
 * stale labels.
 *
 * Resolver branches per kind:
 *   container  → containers.find(c => c.id === id)?.name ?? id.slice(0, 8)
 *   zone       → zones.find(z => z.id === id)?.name ?? id.slice(0, 8)
 *   operation  → `${op.kind} #${id.slice(2, 8)}`
 *   piece      → pieces.find(p => p.id === id)?.name ?? id.slice(0, 8)
 *   primer     → primers.find(p => p.id === id)?.name ?? id.slice(0, 8)
 *   clone      → containers.find(c => c.id === id)?.name ?? `clone ${id.slice(0,6)}`
 *   external   → externalRefs.find(r => r.id === id)?.title ?? accession ?? id
 *   default    → id.slice(0, 8)
 */
import { useEffect } from 'react';
import { setRefDisplayLabelResolver } from '../lib/markdown-ref-plugin';

export function useMarkdownRefResolver(entityState) {
  useEffect(() => {
    const state = entityState || {};
    const resolver = (kind, id) => {
      if (!id) return '';
      switch (kind) {
        case 'container': {
          const c = (state.containers || []).find(c => c.id === id);
          return c?.name || id.slice(0, 8);
        }
        case 'zone': {
          const z = (state.zones || []).find(z => z.id === id);
          return z?.name || id.slice(0, 8);
        }
        case 'operation': {
          const o = (state.operations || []).find(o => o.id === id);
          return o ? `${o.kind || 'op'} #${id.slice(2, 8)}` : id.slice(0, 8);
        }
        case 'piece': {
          const p = (state.pieces || []).find(p => p.id === id);
          return p?.name || id.slice(0, 8);
        }
        case 'primer': {
          const p = (state.primers || []).find(p => p.id === id);
          return p?.name || id.slice(0, 8);
        }
        case 'clone': {
          // Clones may be tracked as standalone containers (T9 materialised
          // clones get their own container record), so fall through to
          // containers list first.
          const c = (state.containers || []).find(c => c.id === id);
          return c?.name || `clone ${id.slice(0, 6)}`;
        }
        case 'external': {
          const r = (state.externalRefs || []).find(r => r.id === id);
          return r?.title || r?.accession || r?.doi || id.slice(0, 8);
        }
        default:
          return id.slice(0, 8);
      }
    };
    setRefDisplayLabelResolver(resolver);
    return () => setRefDisplayLabelResolver(null);
  }, [entityState]);
}
