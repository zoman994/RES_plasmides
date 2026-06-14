/**
 * ProtocolPanel — overlay показывающий step-by-step protocol для
 * lab notebook. Кнопка-toggle в CanvasArea внизу слева.
 *
 * R6-2 (14.05.2026). Биолог нажимает кнопку «Протокол» → видит
 * детальный текст всех выполненных операций → кнопкой «Скопировать»
 * берёт в clipboard.
 */
import { useMemo, useState } from 'react';
import { useSkeletonState } from './store/skeleton-context';
import { buildProtocol } from './canvas/operations/protocol-export';

export default function ProtocolPanel() {
  const state = useSkeletonState();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const protocol = useMemo(
    () => buildProtocol(state.operations || [], state.containers || []),
    [state.operations, state.containers],
  );

  // L3 (audit) — count the steps actually in the protocol (executed + realised
  // committed ops), not only status==='executed'. After «Realise» the assembly
  // ops are committed, so the old count read 0 while the body listed real steps.
  const executedCount = protocol.steps.length;

  const onCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(protocol.text);
      } else {
        // Fallback: создаём textarea и копируем.
        const ta = document.createElement('textarea');
        ta.value = protocol.text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // swallow — best-effort
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="skeleton-protocol-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Показать lab-notebook protocol"
        style={{
          // B2 — bottom-right action stack (above «Очистить», below «Заказ олигов»);
          // the old bottom-left position overlaid the assembly workspace content.
          position: 'absolute',
          bottom: 196,
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
          opacity: executedCount > 0 ? 1 : 0.6,
        }}
      >
        <span>📓</span>
        <span>Протокол {executedCount > 0 ? `(${executedCount})` : ''}</span>
      </button>

      {open && (
        <div
          data-testid="skeleton-protocol-panel"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
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
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
              Lab-notebook protocol ({executedCount} операций)
            </span>
            <button
              type="button"
              data-testid="skeleton-protocol-copy"
              onClick={onCopy}
              style={{
                padding: '5px 10px',
                background: copied ? 'var(--success-500, #16a34a)' : 'var(--accent-500, #d97706)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? '✓ Скопировано' : 'Копировать'}
            </button>
            <button
              type="button"
              data-testid="skeleton-protocol-close"
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
          <pre
            data-testid="skeleton-protocol-text"
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 16,
              fontSize: 11.5,
              lineHeight: 1.5,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              background: 'var(--surface-1, #fff)',
              color: 'var(--text-primary, #1c1917)',
            }}
          >
            {protocol.text}
          </pre>
        </div>
      )}
    </>
  );
}
