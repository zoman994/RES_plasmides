/**
 * AlignWorkspace — top-level «Выравнивание» workspace (routed via
 * workspace.active === 'align'). Left: input panel (sequences / FASTA / .ab1).
 * Right: result (metrics + alignment + column-locked chromatogram).
 *
 * Pairwise MVP. K3 ships the shell + run wiring; K4 fills the input panel,
 * K5 the result view.
 */
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { useResizableSplit } from '../../hooks/useResizableSplit';
import ResizeHandle from '../common/ResizeHandle';
import AlignInputPanel from './AlignInputPanel';
import AlignResultView from './AlignResultView';

const MODES = [
  { value: 'local', label: 'Локальное' },
  { value: 'global', label: 'Глобальное' },
  { value: 'semiglobal', label: 'Полу-глобальное' },
];

function Toggle({ label, checked, onChange, testid, title, disabled = false }) {
  return (
    <label title={title} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-tertiary, #78716c)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" data-testid={testid} checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      {label}
    </label>
  );
}

export default function AlignWorkspace() {
  const error = useStore((s) => s.align?.error || null);
  const mode = useStore((s) => s.align?.settings?.mode || 'local');
  const hasResult = useStore((s) => !!s.align?.result);
  const colorNucleotides = useStore((s) => s.align?.view?.colorNucleotides || false);
  const showAnnotations = useStore((s) => s.align?.view?.showAnnotations !== false);
  const showAATrack = useStore((s) => s.align?.view?.showAATrack !== false);
  const runAlignment = useStore((s) => s.runAlignment);
  const clearAlignmentResult = useStore((s) => s.clearAlignmentResult);
  const setAlignSettings = useStore((s) => s.setAlignSettings);
  const setAlignView = useStore((s) => s.setAlignView);
  // Auto-align deps — narrowed to what the alignment MATH actually consumes:
  // the reference + the selected reads (their id + sequence length) and the
  // settings fields. Depending on the whole `inputs` array re-fired runAlignment
  // on unrelated churn (adding a non-selected input, etc.); source inputs are
  // immutable in the align flow (edits go to the working copy, re-aligned
  // in-store), so id+length uniquely pins the alignment work.
  const refId = useStore((s) => s.align?.refId || null);
  const readIds = useStore(useShallow((s) => s.align?.readIds || []));
  const settings = useStore(useShallow((s) => s.align?.settings || {}));
  // Drag-to-resize the input panel (Игорь — разделители панелей должны двигаться).
  const splitRef = useRef(null);
  const { size: inputW, separatorProps: splitProps, dragging: splitDragging } = useResizableSplit({
    axis: 'x', side: 'start', initial: 340, min: 240, keepOther: 380,
    storageKey: 'align-input-w', containerRef: splitRef,
  });
  const inputSig = useStore((s) => {
    const a = s.align;
    if (!a) return '';
    const byId = (id) => a.inputs.find((x) => x.id === id);
    const ref = byId(a.refId);
    if (!ref) return '';
    const reads = (a.readIds || []).map(byId).filter(Boolean);
    return [`${ref.id}:${ref.sequence.length}`, ...reads.map((r) => `${r.id}:${r.sequence.length}`)].join('|');
  });
  const T = STRINGS.align;

  // Авто-выравнивание на ЛЮБОЕ изменение (Игорь — убрать кнопку «Выровнять»):
  // смена референса / снятая-поставленная галка «выровнять» / добавление-удаление
  // входа / смена режима → пере-выравниваем само. Правки референса (working copy)
  // уже пере-выравниваются в сторе (commit/accept/undo/redo/revert), поэтому
  // здесь их не дублируем. Нет валидной пары (реф + ≥1 чтение) → чистим результат.
  useEffect(() => {
    if (refId && readIds.length > 0) runAlignment();
    else clearAlignmentResult();
  }, [refId, readIds, inputSig, settings, runAlignment, clearAlignmentResult]);

  const onModeChange = (e) => setAlignSettings({ mode: e.target.value });

  return (
    <div
      data-testid="align-workspace"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '10px 16px', borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary, #1c1917)' }}>{T.workspaceTitle}</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)' }}>{T.subtitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasResult && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Toggle testid="align-toggle-annotations" label="Фичи" checked={showAnnotations} onChange={(v) => setAlignView({ showAnnotations: v })} title="Показать аннотации/фичи референса" />
              <Toggle testid="align-toggle-aa" label="AA-трек" checked={showAATrack} onChange={(v) => setAlignView({ showAATrack: v })} title="Аминокислотная дорожка (трансляция CDS)" />
              <Toggle testid="align-color-toggle" label="Цвет нт" checked={colorNucleotides} onChange={(v) => setAlignView({ colorNucleotides: v })} title="Раскрасить буквы чтения по нуклеотидам" />
              <Toggle testid="align-toggle-primers" label="Праймеры" checked={false} disabled title="Слой праймеров из Primer Pool — в разработке" />
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary, #78716c)' }}>
            Режим
            <select
              data-testid="align-mode-select"
              value={mode}
              onChange={onModeChange}
              style={{ fontSize: 12, padding: '4px 6px' }}
            >
              {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <div data-testid="align-error" style={{ padding: '8px 16px', fontSize: 12, color: 'var(--danger-text, #b91c1c)' }}>
          {error}
        </div>
      )}

      <div ref={splitRef} style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div
          data-testid="align-input-region"
          style={{ width: inputW, flex: `0 0 ${inputW}px`, overflow: 'auto', padding: 12 }}
        >
          <AlignInputPanel />
        </div>
        <ResizeHandle axis="x" dragging={splitDragging} testid="align-split-handle" {...splitProps} />
        <div data-testid="align-result-region" style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 12 }}>
          <AlignResultView />
        </div>
      </div>
    </div>
  );
}
