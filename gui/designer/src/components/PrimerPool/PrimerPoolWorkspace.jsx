/**
 * PrimerPoolWorkspace — PRIMER-2b (Игорь 28.06.2026: «Праймеры вынести под
 * библиотеку в левой панели»). Full-page standalone workspace for the unified
 * primer pool, reached from the sidebar «Праймеры» item (ss-nav-primer-pool).
 * Mirrors the RestrictionSitesWorkspace shell (header + back → library + body).
 * The body is the reusable PrimerPoolList.
 */
import { useStore } from '../../store';
import PrimerPoolList from '../PrimerPoolList';

export default function PrimerPoolWorkspace() {
  const goBack = useStore((s) => s.goBack);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  // A primer picked in global search arrives via the workspace switch context (§10.4).
  const selectedPrimerId = useStore((s) => s.workspace?.context?.selectedPrimerId || null);

  return (
    <div data-testid="primer-pool-workspace" style={shell}>
      <div style={header}>
        <strong style={{ fontSize: 14 }}>Праймеры</strong>
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary, #a8a29e)' }}>
          общий пул · поиск по библиотеке · статусы · заказ
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid="primer-pool-back"
          onClick={() => { goBack?.(); setActiveWorkspace?.('library'); }}
          style={ghost}
        >← Назад</button>
      </div>
      <div style={body}>
        <PrimerPoolList selectedPrimerId={selectedPrimerId} />
      </div>
    </div>
  );
}

const shell = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--surface-1)', color: 'var(--text-primary)' };
const header = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' };
const body = { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 16, maxWidth: 880, width: '100%' };
const ghost = { fontSize: 11, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)' };
