/**
 * SnippetOnboardingTip — M-CANVAS-WORKFLOW-UX K6 (SPEC §5.3).
 *
 * First-time-only callout when a snippet appears in the strip — biolog
 * needs to know that the «обвес» is NOT a separate reaction; its
 * sequence physically lives in a neighbour primer's 5'-tail. Dismissal
 * persists in localStorage so the tip never reappears for this user.
 */
import { useState } from 'react';

const FLAG = 'bodge-onboarding-snippet';

function alreadyDismissed() {
  try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
}

export default function SnippetOnboardingTip({ hasSnippet }) {
  const [hidden, setHidden] = useState(alreadyDismissed);

  if (!hasSnippet || hidden) return null;

  const dismiss = () => {
    try { localStorage.setItem(FLAG, '1'); } catch { /* private mode */ }
    setHidden(true);
  };

  return (
    <div
      data-testid="snippet-onboarding-tip"
      style={{
        margin: '8px 12px',
        padding: '10px 14px',
        background: 'var(--accent-wash, rgba(184,92,62,0.10))',
        border: '1px solid var(--accent-500, #b85c3e)',
        borderRadius: 6,
        fontSize: 11.5,
        lineHeight: 1.5,
        color: 'var(--text-primary)',
      }}
    >
      <strong style={{ display: 'block', marginBottom: 4 }}>Обвес встраивается в праймер</strong>
      Этот короткий участок (✦) не делается отдельной PCR — он добавляется в 5'-конец
      праймера соседнего куска. В финальном продукте он на своём месте, но в лаборатории
      это просто длинный праймер. Tm/GC соседнего праймера рассчитываются с учётом
      этого хвоста.
      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          data-testid="snippet-onboarding-dismiss"
          onClick={dismiss}
          style={{
            fontSize: 11, padding: '3px 10px',
            background: 'var(--accent-500, #b85c3e)', color: '#fff',
            border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500,
          }}
        >Понятно, не показывать снова</button>
      </div>
    </div>
  );
}
