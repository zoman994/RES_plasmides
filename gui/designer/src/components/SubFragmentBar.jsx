/**
 * SubFragmentBar — horizontal color-coded strip showing fragment composition.
 * Used in completed assembly view and on flow canvas PlasmidNode.
 */
export default function SubFragmentBar({ subFragments, height = 12, className = '' }) {
  if (!subFragments?.length) return null;

  const total = subFragments.reduce((s, f) => s + (f.length || 0), 0);
  if (total === 0) return null;

  return (
    <div className={`flex rounded-full overflow-hidden ${className}`} style={{ height }}>
      {subFragments.map((f, i) => (
        <div
          key={i}
          title={`${f.name}: ${f.length} bp (${f.pct?.toFixed(1) || ((f.length / total) * 100).toFixed(1)}%)`}
          style={{
            width: `${(f.length / total) * 100}%`,
            backgroundColor: f.color || '#94a3b8',
            minWidth: 2,
          }}
        />
      ))}
    </div>
  );
}
