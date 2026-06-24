/**
 * ProjectContextBar — полоса/карточка активного проекта (UX_DIRECTION фаза 1).
 *
 * Корень жалобы Игоря: «не понимаю, какой проект выбран». Активный проект уже
 * есть в сторе (`currentProjectId`), но интерфейс его нигде не показывает. Эта
 * карточка в Sidebar делает активный `.bodge` ВИДИМЫМ всегда: имя + файл +
 * число контейнеров + быстрое переключение на недавние проекты.
 *
 * Развёрнутый Sidebar → карточка + дропдаун «Сменить» внутри неё.
 * Свёрнутый Sidebar (Игорь, 19.06) → кликабельная иконка, которая открывает
 * флай-аут со списком проектов ВПРАВО, БЕЗ разворачивания панели. Флай-аут
 * рендерится через portal в `document.body` + `position:fixed` — иначе его
 * клипнул бы `.sb-body` (overflow-x:auto) / `.sb` (`contain:layout` делает
 * containing-block для fixed).
 *
 * Смонтирована за фиче-флагом `FEATURE_FLAGS.projectContextBar` (Sidebar) —
 * откат мгновенный. Читает примитивы из стора (имя/файл — строки) → без
 * object-identity-churn.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store';
import { selectRecentProjectsForSwitch, selectProjectsForPick } from '../../lib/project-context';
import { Icon } from '../icons/Icon';

export default function ProjectContextBar({ collapsed = false }) {
  const id = useStore((s) => s.currentProjectId);
  const name = useStore((s) => {
    const i = s.currentProjectId;
    const p = i ? s.projects?.[i] : null;
    // Удалённый (в корзине) текущий проект не светим в карточке — иначе после
    // «удалить всё в библиотеке» активный проект остаётся гореть (Игорь 24.06).
    return p && !p._pendingDelete ? (p.name || 'Без имени') : null;
  });
  const containerCount = useStore((s) => {
    const i = s.currentProjectId;
    const p = i ? s.projects?.[i] : null;
    return p && Array.isArray(p.containerIds) ? p.containerIds.length : 0;
  });
  const fileName = useStore((s) => s.fileName);
  const projects = useStore((s) => s.projects);
  const recentIds = useStore((s) => s.recentProjectIds);
  const activateProject = useStore((s) => s.activateProject);
  const createProject = useStore((s) => s.createProject);
  const openProjectInfo = useStore((s) => s.openProjectInfo);

  const [open, setOpen] = useState(false);
  const [flyoutPos, setFlyoutPos] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  // Outside-click closes the menu (whether inline dropdown or portaled flyout).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const inRoot = rootRef.current && rootRef.current.contains(e.target);
      const inMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!inRoot && !inMenu) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Collapse / expand toggle closes any open menu (geometry changes).
  useEffect(() => { setOpen(false); }, [collapsed]);

  const hasProject = !!(id && name);
  const recent = selectRecentProjectsForSwitch({ currentProjectId: id, projects, recentProjectIds: recentIds }, 8);
  // ПЕРВЫЙ выбор (нет активного проекта): полный список проектов, а не только
  // недавние — иначе на свежем старте дропдаун пуст и приходится идти в Библиотеку
  // (жалоба Игоря: «первый выбор кидает в библиотеку, не даёт списка»).
  const pickList = hasProject
    ? recent
    : selectProjectsForPick({ currentProjectId: id, projects, recentProjectIds: recentIds }, 12);

  // «Все проекты…» убрали (Игорь 24.06): Библиотека и так в один клик в сайдбаре,
  // дублировать переход незачем. Вместо него — создание проекта: store
  // (createProject) уникализирует имя, активирует и роутит в Библиотеку, затем
  // открываем модалку именования (паттерн Library «+ Проект» / Ctrl+N) — Игорь
  // хочет диалог создания, а не молчаливый спавн.
  const createNew = () => {
    createProject?.('Новый проект');
    openProjectInfo?.();
    setOpen(false);
  };
  const pickProject = (pid) => {
    activateProject?.(pid);
    setOpen(false);
  };

  // Shared menu body. С активным проектом — недавние для быстрой смены; без него
  // (первый выбор) — полный список проектов (pickList).
  const menuBody = (
    <>
      {pickList.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', padding: '6px 8px' }}>
          {hasProject ? 'Недавних нет' : 'Проектов пока нет'}
        </div>
      )}
      {pickList.map((p) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={p.isCurrent ? 'true' : 'false'}
          data-testid={`pcb-recent-${p.id}`}
          onClick={() => pickProject(p.id)}
          style={{
            ...rowStyle,
            background: p.isCurrent ? 'var(--accent-50)' : 'transparent',
            color: p.isCurrent ? 'var(--accent-700)' : 'var(--text-primary)',
          }}
        >
          <Icon name="folder" size={14} />
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{p.name}</span>
        </button>
      ))}
      <button
        type="button"
        data-testid="pcb-create"
        onClick={createNew}
        style={{ ...rowStyle, borderTop: '0.5px solid var(--border-subtle)', marginTop: 4, color: 'var(--accent-700)' }}
      >
        <Icon name="plus" size={14} />
        <span style={{ flex: 1, textAlign: 'left' }}>Создать проект</span>
      </button>
    </>
  );

  if (collapsed) {
    const toggleFlyout = () => {
      setOpen((v) => {
        const next = !v;
        if (next && rootRef.current && rootRef.current.getBoundingClientRect) {
          const r = rootRef.current.getBoundingClientRect();
          setFlyoutPos({ top: r.top, left: r.right + 6 });
        }
        return next;
      });
    };
    return (
      <>
        <button
          ref={rootRef}
          type="button"
          data-testid="project-context-bar"
          data-collapsed="true"
          data-has-project={hasProject ? 'true' : 'false'}
          aria-haspopup="listbox"
          aria-expanded={open ? 'true' : 'false'}
          title={hasProject ? `Проект: ${name} (клик — список проектов)` : 'Проект не выбран (клик — список проектов)'}
          onClick={toggleFlyout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '6px 4px', padding: '7px 0', borderRadius: 6, width: 'auto',
            border: 'none', cursor: 'pointer',
            background: hasProject ? 'var(--accent-50)' : 'var(--surface-2)',
            color: hasProject ? 'var(--accent-700)' : 'var(--text-tertiary)',
            fontSize: 15, position: 'relative',
          }}
        >
          <Icon name="folder" size={15} />
          {hasProject && (
            <span style={{
              position: 'absolute', top: 4, right: 6, width: 6, height: 6,
              borderRadius: '50%', background: 'var(--accent-500)',
            }}
            />
          )}
        </button>
        {open && createPortal(
          <div
            ref={menuRef}
            data-testid="pcb-dropdown"
            data-flyout="true"
            role="listbox"
            style={{
              position: 'fixed', top: (flyoutPos?.top ?? 0), left: (flyoutPos?.left ?? 0),
              width: 220, background: 'var(--surface-1)',
              border: '0.5px solid var(--border-default)', borderRadius: 7,
              boxShadow: 'var(--ss-shadow-lg, 0 8px 24px rgba(15,15,15,.18))',
              zIndex: 1000, padding: 4, maxHeight: 320, overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: '4px 8px 6px' }}>
              {hasProject ? `Проект: ${name}` : 'Проект не выбран'}
            </div>
            {menuBody}
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid="project-context-bar"
      data-has-project={hasProject ? 'true' : 'false'}
      style={{
        margin: '6px 4px 10px', padding: '8px 9px', borderRadius: 7,
        border: '0.5px solid var(--accent-500)',
        background: 'var(--accent-50)', position: 'relative',
      }}
    >
      {!hasProject ? (
        <div data-testid="pcb-empty" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="folder" size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>Проект не выбран</span>
          <button
            type="button"
            data-testid="pcb-choose"
            aria-haspopup="listbox"
            aria-expanded={open ? 'true' : 'false'}
            onClick={() => setOpen((v) => !v)}
            style={btnStyle}
          >Выбрать ▾</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="folder" size={14} style={{ color: 'var(--accent-700)' }} />
            <span style={{ fontSize: 10, color: 'var(--accent-700)', flexShrink: 0 }}>Проект</span>
            <span
              data-testid="pcb-name"
              title={name}
              style={{
                flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600,
                color: 'var(--text-primary)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >{name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
            {fileName ? (
              <span
                data-testid="pcb-file"
                title={fileName}
                style={{
                  fontSize: 10.5, fontFamily: 'var(--ss-font-mono, monospace)',
                  background: 'var(--surface-1)', color: 'var(--text-secondary)',
                  padding: '1px 6px', borderRadius: 5, maxWidth: 120,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >{fileName}</span>
            ) : (
              <span
                data-testid="pcb-nofile"
                title="Проект ещё не экспортирован в файл — автосохранение идёт в браузере (Ctrl+S — сохранить .bodge)"
                style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}
              >только в браузере</span>
            )}
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>· {containerCount} конт.</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              data-testid="pcb-switch"
              aria-haspopup="listbox"
              aria-expanded={open ? 'true' : 'false'}
              onClick={() => setOpen((v) => !v)}
              style={{ ...btnStyle, padding: '2px 7px' }}
            >Сменить ▾</button>
          </div>
        </>
      )}

      {/* Дропдаун — общий для обоих состояний: «Сменить» (есть проект) и
          «Выбрать» (первый выбор). position:absolute относительно карточки. */}
      {open && (
        <div
          ref={menuRef}
          data-testid="pcb-dropdown"
          role="listbox"
          style={{
            position: 'absolute', left: 6, right: 6, top: '100%', marginTop: 4,
            background: 'var(--surface-1)', border: '0.5px solid var(--border-default)',
            borderRadius: 7, boxShadow: 'var(--ss-shadow-lg)', zIndex: 30, padding: 4,
            maxHeight: 240, overflowY: 'auto',
          }}
        >
          {menuBody}
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  border: '0.5px solid var(--accent-500)', background: 'transparent',
  color: 'var(--accent-700)', borderRadius: 5, padding: '3px 9px',
  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  border: 'none', background: 'transparent', borderRadius: 5,
  padding: '6px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
};
