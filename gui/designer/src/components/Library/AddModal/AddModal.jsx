/**
 * AddModal — Sprint M-X.7a v2 K6 (DEC-MX7A-V2-07).
 *
 * Wrapper around the existing PreImportModal flow per spec §3
 * IN #8 + §6 K6. Renders:
 *   • Source tiles (Файл · Paste · Каталог · Cross-project)
 *   • Target radio (Активный / Без проекта / Лабпул — last
 *     visible only for kind=primer scope; deferred to a future
 *     refinement when target metadata propagates further down)
 *   • Esc + click-outside closes
 *
 * Source dispatch:
 *   • file → onLaunchPreImport({ source: 'file', target })
 *   • paste → onLaunchPreImport({ source: 'paste', target })
 *   • catalog → onLaunchPreImport({ source: 'catalog', target })
 *   • cross-project → opens CrossProjectStub (no PreImport handoff)
 *
 * The PreImportModal handoff signatures are minimal in K6 (preset
 * source + target). Concrete file picker / paste textarea / catalog
 * sub-flows live in the existing PreImportModal — we just hand it
 * the preset and let it run. R4 risk mitigation: 2 new props on
 * PreImportModal don't break existing Importer flow callsites.
 */
import { useEffect, useMemo, useState } from 'react';
import { STRINGS } from '../../../lib/strings';
import { useStore } from '../../../store';
import { Icon } from '../../icons/Icon';
import SourceTiles from './SourceTiles';
import CrossProjectStub from './CrossProjectStub';

const LOOSE_TARGET = { id: 'loose', label: 'Без проекта', sub: '⎀ свободный стол' };

/**
 * WT-UX-4 — a short, per-project distinguishing detail for the target list.
 * Creation date+time is preferred (human-meaningful, and distinct even for
 * projects made in the same session); container count is the fallback when
 * `createdAt` is absent. Manual formatting — no locale dependency.
 */
function projectDetail(p) {
  if (p && p.createdAt != null) {
    const d = new Date(p.createdAt);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return `📦 ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  const n = Array.isArray(p?.containerIds) ? p.containerIds.length : 0;
  return `📦 ${n} конт.`;
}

export default function AddModal({ open, onClose, onLaunchPreImport }) {
  const ws = STRINGS.libraryWorkspace || {};
  const pinnedProjectIds = useStore((s) => s.pinnedProjectIds);
  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const [pickedSource, setPickedSource] = useState(null);
  const [target, setTarget] = useState('loose');
  const [stubOpen, setStubOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  // WT-D-2 — homology auto-annotation toggle (default on). Rides the preset
  // → LibraryTreeHost.importFiles opts → enrichAnnotations.
  const [autoAnnotate, setAutoAnnotate] = useState(true);
  // WT-UX-8/7 — optional name + topology for paste imports (headerless ACGT
  // would otherwise land as «imported» / always-linear). Ride the preset.
  const [pasteName, setPasteName] = useState('');
  const [pasteTopology, setPasteTopology] = useState('linear');

  // Build the target list: «Без проекта» + every pinned project +
  // (current project if it's not already in pinned). The current
  // is shown with a small ● marker; click selects it. If there
  // are no pinned + no current → only «Без проекта» remains.
  const targets = useMemo(() => {
    const list = [LOOSE_TARGET];
    const seen = new Set();
    const addProject = (p) => {
      if (!p || seen.has(p.id)) return;
      seen.add(p.id);
      list.push({
        id: `project:${p.id}`,
        label: p.name || p.id,
        // WT-UX-4 — distinguishing detail so identically-named projects
        // («Новый проект» ×3) are tellable apart (creation date+time, else
        // container count). Replaces the indistinct shared «📦 .bodge».
        sub: projectDetail(p),
        isCurrent: p.id === currentProjectId,
      });
    };
    for (const id of (pinnedProjectIds || [])) addProject(projectsById?.[id]);
    // Current project not in pinned — surface it anyway.
    if (currentProjectId) addProject(projectsById?.[currentProjectId]);
    return list;
  }, [pinnedProjectIds, projectsById, currentProjectId]);

  // Reset on open transition. Default selection: current project
  // (if available among targets), else first non-loose, else loose.
  useEffect(() => {
    if (!open) return;
    setPickedSource(null);
    setStubOpen(false);
    setPasteText('');
    setAutoAnnotate(true);
    setPasteName('');
    setPasteTopology('linear');
    const currentT = currentProjectId
      ? targets.find((t) => t.id === `project:${currentProjectId}`)
      : null;
    if (currentT) {
      setTarget(currentT.id);
    } else if (targets.length > 1) {
      setTarget(targets[1].id);
    } else {
      setTarget('loose');
    }
  }, [open, currentProjectId, targets]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const onPickSource = (id) => {
    setPickedSource(id);
    if (id === 'cross-project') {
      setStubOpen(true);
      return;
    }
  };

  const submitDisabled = !pickedSource
    || pickedSource === 'cross-project'
    || (pickedSource === 'paste' && !pasteText.trim());

  const onSubmit = () => {
    if (submitDisabled) return;
    if (pickedSource === 'paste') {
      onLaunchPreImport?.({
        source: 'paste', target, text: pasteText, autoAnnotate, name: pasteName, topology: pasteTopology,
      });
    } else {
      onLaunchPreImport?.({ source: pickedSource, target, autoAnnotate });
    }
    onClose?.();
  };

  // WT-UX-9 — header tracks the chosen destination instead of the static
  // «в библиотеку» (which contradicted the default target = active project).
  const targetObj = targets.find((t) => t.id === target);
  const headerTitle = target === 'loose'
    ? (ws.addTitleLoose || 'Добавить на свободный стол')
    : `${ws.addTitleProject || 'Добавить в проект'} «${targetObj?.label || ''}»`;

  // WT-D-2 — auto-annotation toggle (default on). Applies to both file and
  // paste imports; value rides the preset to importFiles. Rendered once: in
  // paste mode directly under the textarea (Игорь 26.05.2026), otherwise at
  // the bottom of the body — exactly one instance per state.
  const autoAnnotateRow = (
    <label
      data-testid="add-modal-auto-annotate-row"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '8px 10px', cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm, 4px)',
      }}
    >
      <input
        type="checkbox"
        data-testid="add-modal-auto-annotate"
        checked={autoAnnotate}
        onChange={(e) => setAutoAnnotate(e.target.checked)}
        style={{ margin: '2px 0 0 0' }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
          {ws.autoAnnotateLabel || 'Авто-аннотация'}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
          {ws.autoAnnotateHint || 'Найти известные элементы по гомологии'}
        </span>
      </span>
    </label>
  );

  return (
    <div
      data-testid="add-modal-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 230,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6vh 4vw',
      }}
    >
      <div
        data-testid="add-modal"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          // V117 — cap height to the centered backdrop's content box (it has
          // 6vh/4vw padding) so tall content can't push the footer off-screen.
          maxHeight: '100%',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          border: '0.5px solid var(--border-default)',
          borderRadius: 'var(--radius-md, 6px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'baseline', gap: 12,
          padding: '14px 20px',
          borderBottom: '0.5px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <h2 data-testid="add-modal-title" style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
            {headerTitle}
          </h2>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            data-testid="add-modal-close"
            onClick={onClose}
            aria-label="close"
            style={{
              fontSize: 14, padding: '0 6px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          ><Icon name="close" size={14} /></button>
        </header>

        <div
          data-testid="add-modal-body"
          style={{
            padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16,
            // V117 — the middle content is the scroll region; header/footer stay
            // pinned so the footer buttons are always reachable.
            flexGrow: 1, minHeight: 0, overflowY: 'auto',
          }}
        >
          <FieldLabel label="ИСТОЧНИК">
            <SourceTiles onPick={onPickSource} picked={pickedSource} />
          </FieldLabel>

          {/* 12.05.2026 — Игорь: «каталог снапгена ... модалка дает
              выбрать но говорит что в разработке». Inline banner под
              tiles когда выбран catalog. Submit всё ещё доступен —
              отдаст тost через onLaunchPreImport fallback. */}
          {pickedSource === 'catalog' && (
            <div
              data-testid="add-modal-catalog-in-dev"
              role="status"
              style={{
                padding: '8px 12px',
                background: 'var(--accent-50, #fef3c7)',
                border: '1px solid var(--accent-300, #fcd34d)',
                borderRadius: 'var(--radius-sm, 4px)',
                fontSize: 11.5,
                color: 'var(--accent-700, #b45309)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <strong style={{ fontSize: 12 }}>SnapGene-каталог в разработке</strong>
              <span>
                Браузер 2800+ плазмид из SnapGene Public Catalog появится
                в M-X.9+. Пока загрузите файл (.dna / .gb) или вставьте
                последовательность.
              </span>
            </div>
          )}

          {/* Paste textarea — appears only when source = «Вставить».
              Uses parseFile via a synthetic File on submit (handled
              by LibraryWorkspace.onLaunchPreImport). */}
          {pickedSource === 'paste' && (
            <>
            <FieldLabel label="ВСТАВЬТЕ ПОСЛЕДОВАТЕЛЬНОСТЬ">
              <textarea
                data-testid="add-modal-paste-textarea"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  // Normal paste behavior is fine — just stop the
                  // event from bubbling to the modal's keydown
                  // listener (which would close on Esc-like keys).
                  e.stopPropagation();
                }}
                placeholder={'>my_plasmid\nATGCATGCATGC…\n\nили GenBank LOCUS-блок'}
                rows={8}
                autoFocus
                style={{
                  width: '100%',
                  resize: 'vertical',
                  padding: '8px 10px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono, monospace)',
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  outline: 'none',
                }}
              />
              <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                Авто-определение формата: GenBank · FASTA · plain ACGT.
              </div>
            </FieldLabel>

            {/* Игорь 26.05.2026 — авто-аннотация прямо под полем ввода текста. */}
            {autoAnnotateRow}

            {/* WT-UX-8 — optional explicit name (headerless ACGT would
                otherwise become «imported»). A `>name` in the text wins
                only when this is left blank (handled in importFiles). */}
            <FieldLabel label="ИМЯ">
              <input
                data-testid="add-modal-paste-name"
                type="text"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
                placeholder={ws.pasteNamePlaceholder || 'напр. pLAB-1'}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 12,
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  outline: 'none',
                }}
              />
              <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                {ws.pasteNameHint || 'если в тексте есть >name — имя возьмётся из заголовка'}
              </div>
            </FieldLabel>

            {/* WT-UX-7 — topology for pasted raw sequence (parseFasta hardcodes
                linear). Segmented toggle, selection visible. Paste-path only. */}
            <FieldLabel label={ws.topologyLabel || 'Топология'}>
              <div data-testid="add-modal-topology" style={{ display: 'flex', gap: 4 }}>
                {[
                  ['linear', ws.topologyLinear || 'Линейная'],
                  ['circular', ws.topologyCircular || 'Кольцевая'],
                ].map(([val, lbl]) => {
                  const active = pasteTopology === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      data-testid={`add-modal-topology-${val}`}
                      aria-pressed={active}
                      onClick={() => setPasteTopology(val)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                        background: active ? 'var(--accent-50)' : 'var(--surface-2)',
                        color: 'var(--text-primary)',
                        border: active
                          ? '1px solid var(--accent-500)'
                          : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm, 4px)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </FieldLabel>
            </>
          )}

          <FieldLabel label="КУДА ДОБАВИТЬ">
            <div data-testid="add-modal-target" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {targets.map((t) => (
                <label
                  key={t.id}
                  data-testid={`add-modal-target-${t.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    border: target === t.id
                      ? '1px solid var(--accent-500)'
                      : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: target === t.id ? 'var(--accent-50)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="add-target"
                    value={t.id}
                    checked={target === t.id}
                    onChange={() => setTarget(t.id)}
                    style={{ margin: 0 }}
                  />
                  {t.isCurrent && (
                    <span
                      title="текущий"
                      style={{ color: 'var(--accent-700)', fontSize: 10, display: 'inline-flex', alignItems: 'center' }}
                    ><Icon name="circular" size={10} /></span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {t.label}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                    {t.sub}
                  </span>
                </label>
              ))}
            </div>
          </FieldLabel>

          {/* File / catalog modes — no textarea above, so the toggle stays at
              the bottom of the body (paste mode renders it under the textarea). */}
          {pickedSource !== 'paste' && autoAnnotateRow}
        </div>

        <footer
          style={{
            display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end',
            padding: '12px 20px',
            borderTop: '0.5px solid var(--border-subtle)',
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            data-testid="add-modal-cancel"
            onClick={onClose}
            style={{
              fontSize: 12, padding: '6px 14px',
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: 'pointer',
            }}
          >Отмена</button>
          <button
            type="button"
            data-testid="add-modal-submit"
            onClick={onSubmit}
            disabled={submitDisabled}
            style={{
              fontSize: 12, padding: '6px 16px',
              background: 'var(--accent-500)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: submitDisabled ? 'not-allowed' : 'pointer',
              opacity: submitDisabled ? 0.55 : 1,
              fontWeight: 500,
            }}
          >Продолжить</button>
        </footer>
      </div>

      {stubOpen && <CrossProjectStub onClose={() => setStubOpen(false)} />}
    </div>
  );
}

function FieldLabel({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-secondary)',
      }}>{label}</span>
      {children}
    </div>
  );
}
