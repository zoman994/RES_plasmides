/**
 * OnboardingTooltip — первый-mount тип «👈 Click ghost to start».
 *
 * B12 (14.05.2026 — TIER-B). Показывается ОДИН РАЗ на первом mount'е
 * canvas-skeleton. Запоминается в localStorage. Dismiss кнопкой ×.
 */
import { useEffect, useState } from 'react';

const SEEN_KEY = 'bodge-skeleton-onboarding-seen-v1';

function hasSeen() {
  try {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch { return true; }
}
function markSeen() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SEEN_KEY, '1');
  } catch { /* ignore */ }
}

export default function OnboardingTooltip() {
  const [visible, setVisible] = useState(() => !hasSeen());
  useEffect(() => {
    // Auto-dismiss after 12s.
    if (!visible) return;
    const t = setTimeout(() => {
      setVisible(false);
      markSeen();
    }, 12000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    markSeen();
  };

  return (
    <div
      data-testid="skeleton-onboarding-tooltip"
      role="alert"
      style={{
        position: 'absolute',
        top: 70,
        left: 90,
        zIndex: 35,
        background: 'var(--accent-500, #d97706)',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: 8,
        boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
        maxWidth: 280,
        fontSize: 12.5,
        lineHeight: 1.4,
        animation: 'skeleton-onboarding-fadein 280ms ease',
      }}
    >
      <style>{`
        @keyframes skeleton-onboarding-fadein {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>👈</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Призрачный контейнер</div>
          <div>
            Нажми на него, чтобы выбрать фрагмент.
            Hotkeys: <strong>Ctrl+Z/Y</strong> — Undo/Redo,
            <strong> Ctrl+click</strong> — multi-select,
            <strong> Alt+drag</strong> — соединить.
          </div>
        </div>
        <button
          type="button"
          data-testid="skeleton-onboarding-dismiss"
          onClick={dismiss}
          aria-label="Закрыть"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 18,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 0,
          }}
        >×</button>
      </div>
    </div>
  );
}
