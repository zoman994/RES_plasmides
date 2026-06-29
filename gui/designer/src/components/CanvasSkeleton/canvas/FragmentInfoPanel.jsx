/**
 * FragmentInfoPanel — CANVAS-CLICK-1 (Игорь /loop 28.06). Pinned summary shown when a
 * fragment card is clicked: the genetic engineer sees, at a glance, WHAT the fragment is
 * — name, length, topology, how it was obtained, its (sticky) ends, feature count — plus
 * «Открыть» (full editor). Data is the pure fragmentCardInfo projection; no store here.
 */
const panelStyle = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 6,
  width: 248,
  background: 'var(--surface-1, #fff)',
  border: '1px solid var(--border-strong, #c7c3bd)',
  borderRadius: 12,
  boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
  overflow: 'hidden',
  fontSize: 12.5,
  color: 'var(--text-primary, #1c1917)',
};
const hdStyle = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
  borderBottom: '1px solid var(--border-default, #e7e5e4)',
};
const kvStyle = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', padding: '8px 10px' };
const kStyle = { color: 'var(--text-tertiary, #78716c)', whiteSpace: 'nowrap' };
const vStyle = {
  textAlign: 'right', fontVariantNumeric: 'tabular-nums',
  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const chipStyle = {
  fontSize: 10.5, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4,
  background: 'var(--accent-50, #eef2ff)', color: 'var(--accent-700, #4338ca)',
};

const TOPO_RU = { circular: 'кольцевая', linear: 'линейная' };

export default function FragmentInfoPanel({
  info, onOpen, onClose, anchor,
}) {
  if (!info) return null;
  // anchor → float at the click (main canvas, parity with the op popups, position:fixed
  // so canvas scale/scroll doesn't move it); no anchor → pinned top-right (DAG view).
  const style = anchor
    ? {
      ...panelStyle,
      position: 'fixed',
      top: Math.min(anchor.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 230),
      left: Math.min(anchor.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260),
      right: 'auto',
    }
    : panelStyle;
  return (
    <div data-testid="fragment-info-panel" style={style}>
      <div style={hdStyle}>
        <span
          data-testid="fragment-info-name"
          title={info.name}
          style={{
            flex: 1, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {info.name}
        </span>
        <button
          type="button"
          data-testid="fragment-info-close"
          onClick={onClose}
          aria-label="Закрыть"
          title="Закрыть"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15,
            lineHeight: 1, color: 'var(--text-tertiary, #78716c)', padding: 0, width: 18,
          }}
        >
          ×
        </button>
      </div>
      <div style={kvStyle}>
        <span style={kStyle}>Длина</span>
        <span style={vStyle} data-testid="fragment-info-length">{info.lengthBp} bp</span>
        <span style={kStyle}>Топология</span>
        <span style={vStyle}>{TOPO_RU[info.topology] || info.topology}{info.reversed ? ' · rc' : ''}</span>
        {info.acquisition ? (
          <>
            <span style={kStyle}>Получение</span>
            <span style={vStyle}>{info.acquisition}</span>
          </>
        ) : null}
        <span style={kStyle}>Концы</span>
        <span style={vStyle} data-testid="fragment-info-ends">
          {info.ends && info.ends.length ? (
            <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {info.ends.map((e, i) => <span key={i} style={chipStyle}>{e}</span>)}
            </span>
          ) : (info.topology === 'circular' ? 'нет (кольцо)' : '—')}
        </span>
        <span style={kStyle}>Фичи</span>
        <span
          style={vStyle}
          data-testid="fragment-info-features"
          title={info.featureNames.join(', ')}
        >
          {info.featureCount > 0
            ? `${info.featureCount}${info.featureNames.length ? ` · ${info.featureNames.join(', ')}` : ''}`
            : 'нет'}
        </span>
      </div>
      {onOpen ? (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-default, #e7e5e4)' }}>
          <button
            type="button"
            data-testid="fragment-info-open"
            onClick={onOpen}
            style={{
              width: '100%', padding: '6px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--border-accent, #c7d2fe)',
              background: 'var(--accent-50, #eef2ff)', color: 'var(--accent-700, #4338ca)',
              fontSize: 12, fontWeight: 500,
            }}
          >
            Открыть
          </button>
        </div>
      ) : null}
    </div>
  );
}
