/**
 * OperationInfoPanel — CANVAS-CLICK-2 / V139 (Игорь /loop 28.06). Pinned summary shown
 * when a reaction node (Cut / Ligate / ромб) is clicked: kind, enzyme(s), method,
 * inputs→output. Reads the pure operationInfo projection so it works on the DAG preview
 * (derived ops) AND committed ops — fixing the dead op click. Mirrors FragmentInfoPanel.
 */
import OpIcon from './op-icons';

const panelStyle = {
  position: 'absolute', top: 12, right: 12, zIndex: 6, width: 248,
  background: 'var(--surface-1, #fff)', border: '1px solid var(--border-strong, #c7c3bd)',
  borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden',
  fontSize: 12.5, color: 'var(--text-primary, #1c1917)',
};
const hdStyle = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
  borderBottom: '1px solid var(--border-default, #e7e5e4)',
};
const kvStyle = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', padding: '8px 10px' };
const kStyle = { color: 'var(--text-tertiary, #78716c)', whiteSpace: 'nowrap' };
const vStyle = {
  textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const chipStyle = {
  fontSize: 10.5, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4,
  background: 'var(--accent-50, #eef2ff)', color: 'var(--accent-700, #4338ca)',
};

export default function OperationInfoPanel({ info, onClose }) {
  if (!info) return null;
  const flow = [info.inputNames.join(' + ') || '—', info.outputNames.join(', ') || '—'];
  return (
    <div data-testid="operation-info-panel" style={panelStyle}>
      <div style={hdStyle}>
        <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--text-secondary, #57534e)' }}>
          <OpIcon kind={info.kind} size={15} />
        </span>
        <span data-testid="operation-info-kind" style={{ flex: 1, fontWeight: 500 }}>{info.kindLabel}</span>
        <button
          type="button"
          data-testid="operation-info-close"
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
        {info.enzymes.length ? (
          <>
            <span style={kStyle}>{info.enzymes.length > 1 ? 'Ферменты' : 'Фермент'}</span>
            <span style={vStyle} data-testid="operation-info-enzymes">
              <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {info.enzymes.map((e) => <span key={e} style={chipStyle}>{e}</span>)}
              </span>
            </span>
          </>
        ) : null}
        {info.method ? (
          <>
            <span style={kStyle}>Метод</span>
            <span style={vStyle}>{info.method}</span>
          </>
        ) : null}
        {info.selfClosure ? (
          <>
            <span style={kStyle}>Тип</span>
            <span style={vStyle}>само-замыкание</span>
          </>
        ) : null}
        <span style={kStyle}>Вход</span>
        <span style={vStyle} data-testid="operation-info-inputs" title={flow[0]}>{flow[0]}</span>
        <span style={kStyle}>Выход</span>
        <span style={vStyle} data-testid="operation-info-output" title={flow[1]}>{flow[1]}</span>
      </div>
    </div>
  );
}
