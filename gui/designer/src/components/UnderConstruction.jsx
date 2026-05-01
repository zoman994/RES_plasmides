import { useStore } from '../store';
import { STRINGS } from '../lib/strings';

export default function UnderConstruction({ payload }) {
  const navStack = useStore(s => s.canvas.navStack);
  const top = navStack[navStack.length - 1];
  const data = payload || top?.payload || {};
  const milestone = data.milestone || 'TBD';
  const name = data.name || STRINGS.placeholder.underConstructionFallbackName;

  return (
    <div
      data-testid="under-construction"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 32,
        textAlign: 'center',
        background: 'var(--surface-base, #fafaf9)',
        color: 'var(--text-primary, #1c1917)',
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
        {STRINGS.placeholder.underConstructionTitle(name)}
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-secondary, #57534e)', margin: 0 }}>
        {STRINGS.placeholder.underConstructionSubtitle(milestone)}
      </p>
    </div>
  );
}
