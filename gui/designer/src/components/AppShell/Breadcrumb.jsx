/**
 * Breadcrumb — хлебные крошки «где я сейчас» (UX_DIRECTION фаза 2, логика окон).
 *
 * Read-only трейл текущего положения: «Инструменты → {окно}» для кросс-проектных
 * инструментов, либо «{Проект} → {окно}» для окон активного проекта. Делает
 * двойной роутер (activeFullscreen overlay + workspace.active) ЛЕГИБЕЛЬНЫМ без
 * его унификации (это отдельный риск-кусок фазы 2). Пара к ProjectContextBar:
 * полоса говорит КАКОЙ проект, крошки — КАКОЕ окно.
 *
 * Читает примитивы из стора (строки) → без object-identity-churn. Логика —
 * чистый `lib/breadcrumb.js::buildBreadcrumb` (юнит-тест). Монтаж — за флагом
 * FEATURE_FLAGS.breadcrumb (AppShell), откат мгновенный.
 */
import { useState } from 'react';
import { useStore } from '../../store';
import { buildBreadcrumb } from '../../lib/breadcrumb';
import { Icon } from '../icons/Icon';

export default function Breadcrumb() {
  const activeFullscreen = useStore((s) => s.canvas?.activeFullscreen);
  const workspaceActive = useStore((s) => s.workspace?.active);
  const projectName = useStore((s) => {
    const i = s.currentProjectId;
    return i ? (s.projects?.[i]?.name || 'Проект') : null;
  });
  // Проектная крошка теперь = выход из оверлея (роль «← Назад», которую сняли
  // со слим-шапки канваса). Кликабельна только она — popFullscreen снимает
  // верхний overlay-роут (canvasSkeleton/containerWindow). На прочих крошках —
  // инертно. popFullscreen — no-op, если стек пуст (безопасно).
  const popFullscreen = useStore((s) => s.popFullscreen);
  const [hovered, setHovered] = useState(false);

  const crumbs = buildBreadcrumb({ activeFullscreen, workspaceActive, projectName });

  return (
    <nav
      data-testid="app-breadcrumb"
      aria-label="Хлебные крошки"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        height: 34, padding: '0 16px', flexShrink: 0,
        borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-base, #fafaf9)',
        fontSize: 12.5, color: 'var(--text-secondary)',
      }}
    >
      {crumbs.map((c, i) => {
        const clickable = c.kind === 'project' && typeof popFullscreen === 'function';
        const onCrumb = clickable ? () => popFullscreen() : undefined;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span aria-hidden style={{ color: 'var(--text-tertiary)' }}>›</span>}
            <span
              data-testid="breadcrumb-crumb"
              data-kind={c.kind || ''}
              data-current={c.current ? 'true' : 'false'}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              title={clickable ? 'К проекту (выйти из окна)' : undefined}
              onClick={onCrumb}
              onKeyDown={clickable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); popFullscreen(); }
              } : undefined}
              onMouseEnter={clickable ? () => setHovered(true) : undefined}
              onMouseLeave={clickable ? () => setHovered(false) : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color: c.current ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: c.current ? 600 : 400,
                cursor: clickable ? 'pointer' : 'default',
                textDecoration: clickable && hovered ? 'underline' : 'none',
              }}
            >
              {c.kind === 'project' && <Icon name="folder" size={14} style={{ color: 'var(--accent-700)' }} />}
              {c.label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
