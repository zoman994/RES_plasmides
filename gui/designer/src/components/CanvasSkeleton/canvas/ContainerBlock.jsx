/**
 * ContainerBlock — placeholder / filled блок на canvas.
 *
 * 12.05.2026 — Игорь: «не квадратные — прямоугольные. стандартизированные.
 * переиспользовать кодовую базу V0.5».
 *
 * Размер: фиксированные 240×60 (4:1 pill, same as v0.5 PartBlock compact).
 * Палитра / glyphs / стиль pill: переиспользованы v0.5 primitives —
 *   - `getFragColor` + `isMarker` из `../theme` (палитра Okabe-Ito).
 *   - `SBOLIcon` из `../sbol-glyphs` (SBOL Visual 3.0 glyphs).
 * Layout калькирован с v0.5 PartBlock compact mode (rounded-md card,
 * SBOL glyph слева, name в середине, bp counter справа).
 *
 * Circular topology обозначается suffix-меткой `· circular`, не
 * отдельным размером/формой (Игорь: «плазмида показывается только
 * значком»).
 *
 * Placeholder (V2 paradigma): dashed border + большой «+».
 *
 * Click → highlight; placeholder click открывает picker. Double-click
 * filled → editor.
 */
import { memo } from 'react';
import { Icon } from '../../icons/Icon';
import { getFragColor, isMarker, FEATURE_COLORS } from '../../../theme';
import { SBOLIcon } from '../../../sbol-glyphs';
import {
  BLOCK_LINEAR_W,
  BLOCK_LINEAR_H,
} from './canvas-layout';
import { isPlaceholderContainer } from '../fixture-canvas-skeleton';
import { isOligonucleotideKind } from './container-kind-registry';
import OligonucleotideBlock from './OligonucleotideBlock';
import MiniPlasmidMap from './MiniPlasmidMap';
import VirtualOutputBadge from './VirtualOutputBadge';
import { virtualStroke } from './junction-styles';

// F4 DEC-CANVAS-PROD-04 — virtual product preview block (4 states).
function VirtualBlock({ container, virtualState, virtualWarnings, onClick, onDoubleClick }) {
  const stroke = virtualStroke(virtualState);
  const isDisc = virtualState === 'disconnected';
  return (
    <div
      data-testid={`skeleton-block-${container.id}`}
      data-kind="virtual"
      data-virtual-state={virtualState}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'relative',
        width: 240,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 14px',
        boxSizing: 'border-box',
        borderRadius: isDisc ? '50% 50% 50% 50% / 60% 60% 60% 60%' : 8,
        border: `2px ${virtualState === 'valid' ? 'solid' : 'dashed'} ${stroke}`,
        background: virtualState === 'valid' ? 'var(--surface-2)' : 'transparent',
        opacity: virtualState === 'valid' ? 0.7 : 1,
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <VirtualOutputBadge virtualState={virtualState} warnings={virtualWarnings} />
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <Icon
          name={virtualState === 'disconnected' ? 'warning' : virtualState === 'incomplete' ? 'hourglass' : 'check'}
          size={15}
        />
      </span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{container.name}</div>
        <div style={{ fontSize: 10.5 }}>
          {virtualState === 'incomplete' && '…настройте операцию'}
          {virtualState === 'disconnected' && (virtualWarnings?.[0] || 'стык не настроен')}
          {virtualState === 'valid' && `preview · ${(container.sequence || '').length} bp`}
        </div>
      </span>
    </div>
  );
}

function ContainerBlock({
  container,
  highlighted,
  dragOver,
  onClick,
  onDoubleClick,
  onPlaceholderClick,
  virtualState,
  virtualWarnings,
  // V75 — PCR primer/flank overlay for the MiniPlasmidMap. Passed by
  // CanvasLayoutView only when this container is the template of the
  // currently-selected PCR op; undefined otherwise (no overlay).
  pcrPrimers,
  pcrFlank,
}) {
  if (virtualState) {
    return (
      <VirtualBlock
        container={container}
        virtualState={virtualState}
        virtualWarnings={virtualWarnings}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  if (isPlaceholderContainer(container)) {
    return (
      <PlaceholderBlock
        container={container}
        highlighted={highlighted}
        dragOver={dragOver}
        onClick={onPlaceholderClick || onClick}
      />
    );
  }
  // K10 — dispatch on container.kind via registry.
  if (isOligonucleotideKind(container)) {
    return (
      <OligonucleotideBlock
        container={container}
        highlighted={highlighted}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
    );
  }
  return (
    <FilledBlock
      container={container}
      highlighted={highlighted}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      pcrPrimers={pcrPrimers}
      pcrFlank={pcrFlank}
    />
  );
}

function PlaceholderBlock({ container, highlighted, dragOver, onClick }) {
  return (
    <div
      data-testid={`skeleton-block-${container.id}`}
      data-kind="placeholder"
      data-highlighted={highlighted ? 'true' : 'false'}
      data-drag-over={dragOver ? 'true' : 'false'}
      onClick={onClick}
      style={{
        width: BLOCK_LINEAR_W,
        height: BLOCK_LINEAR_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: 'pointer',
        userSelect: 'none',
        background: dragOver ? 'var(--accent-50, #fef3c7)' : 'transparent',
        border: '2px dashed ' + (
          dragOver
            ? 'var(--accent-500, #d97706)'
            : highlighted
              ? 'var(--accent-500, #d97706)'
              : 'var(--border-default, #d6d3d1)'
        ),
        borderRadius: 6,
        color: dragOver || highlighted
          ? 'var(--accent-700, #b45309)'
          : 'var(--text-tertiary, #a8a29e)',
        transition: 'background 80ms ease, border-color 80ms ease, color 80ms ease',
      }}
    >
      <span
        data-testid={`skeleton-placeholder-plus-${container.id}`}
        style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
      ><Icon name="plus" size={22} /></span>
      <span style={{ fontSize: 11 }}>
        Пусто · click / drop запчасть
      </span>
    </div>
  );
}

/**
 * inferType — определяет visual type контейнера для glyph + color.
 *  - Имя содержит marker keyword (AmpR, KanR, …) → 'marker'.
 *  - Topology circular → 'rep_origin' (plasmid backbone).
 *  - Annotation первого `level: 'region'` с типом — её type.
 *  - Иначе 'misc_feature'.
 */
function inferType(container) {
  if (!container) return 'misc_feature';
  if (isMarker(container.name)) return 'marker';
  const ann = (container.annotations || []).find((a) => a && (a.level === 'region' || a.level === undefined) && a.type);
  if (ann?.type && FEATURE_COLORS[ann.type]) return ann.type;
  if (container.topology?.circular) return 'rep_origin';
  return 'misc_feature';
}

function FilledBlock({ container, highlighted, onClick, onDoubleClick, pcrPrimers, pcrFlank }) {
  const length = container?.length || (container?.sequence || '').length || 0;
  const isCircular = !!container?.topology?.circular;
  const type = inferType(container);
  const color = container?.customColor || getFragColor(type, 0);

  // R10: derived visual state from container.origin.
  // linearizedFromCircular — linear container whose parent was circular
  // и был линеаризован Cut'ом. Render как "broken circle" (continuity
  // с parent'ом, биолог видит «эта плёл была circular, разрезали»).
  const origin = container?.origin || {};
  const linearizedFromCircular = !isCircular
    && origin.kind === 'op_cut'
    && origin.parentWasCircular === true
    && origin.isExcised !== true;
  // excised — small fragment вырезанный rest-enzyme'ом из плазмиды.
  // Render dim чтобы биолог сразу видел что это «обрезок».
  const excised = origin.kind === 'op_cut' && origin.isExcised === true;

  return (
    <div
      data-testid={`skeleton-block-${container.id}`}
      data-kind={isCircular ? 'circular' : 'linear'}
      data-highlighted={highlighted ? 'true' : 'false'}
      data-type={type}
      data-frozen={container?.frozen ? 'true' : 'false'}
      data-linearized={linearizedFromCircular ? 'true' : 'false'}
      data-excised={excised ? 'true' : 'false'}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'relative',
        width: BLOCK_LINEAR_W,
        height: BLOCK_LINEAR_H,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '6px 10px',
        cursor: 'pointer',
        userSelect: 'none',
        background: `${color}1A`,
        border: '2px solid ' + (highlighted ? 'var(--accent-500, #d97706)' : color),
        borderRadius: 6,
        boxShadow: highlighted
          ? '0 0 0 4px rgba(217,119,6,0.18)'
          : '0 1px 2px rgba(0,0,0,0.06)',
        transition: 'box-shadow 100ms ease, border-color 100ms ease',
        opacity: container?.frozen ? 0.85 : (excised ? 0.72 : 1),
      }}
      title={`${container.name} · ${length} bp · ${isCircular ? 'circular' : (linearizedFromCircular ? 'linear (cut from circular)' : 'linear')}${container?.frozen ? ' · 🔒 frozen' : ''}${excised ? ' · вырезан' : ''}`}
    >
      {/* K9 — lock mini-overlay для frozen контейнеров. */}
      {container?.frozen && (
        <span
          data-testid={`skeleton-block-${container.id}-lock`}
          aria-label="frozen"
          style={{
            position: 'absolute',
            top: -8,
            right: -8,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#7f1d1d',
            color: '#fff',
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            zIndex: 2,
          }}
        ><Icon name="lock" size={11} /></span>
      )}
      {/* Row 1 — SBOL glyph + name + bp. V68: own divider-fenced band —
          the MiniPlasmidMap V66 leader-labels (Row 2, overflow:hidden)
          can never bleed up into the name. */}
      <div
        data-testid={`skeleton-block-${container.id}-name`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          paddingBottom: 4,
          marginBottom: 2,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          data-testid={`skeleton-topology-icon-${container.id}`}
          style={{
            display: 'inline-flex',
            flexShrink: 0,
            transform: container?.strand === -1 ? 'scaleX(-1)' : 'none',
          }}
        >
          <SBOLIcon type={type} size={14} color={color} />
        </span>
        <span style={{
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>{container.name || 'untitled'}</span>
        <span style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          flexShrink: 0,
        }}>{length} bp</span>
      </div>

      {/* Row 2 — MiniPlasmidMap визуал плазмиды (circle / linear / broken-circle) */}
      <div
        data-testid={`skeleton-block-${container.id}-map`}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // V68 — clip the overflow:visible map SVG so its V66 leader
          // labels stay inside the map row and never reach the name band.
          overflow: 'hidden',
        }}
      >
        <MiniPlasmidMap
          length={length}
          annotations={container?.annotations || []}
          circular={isCircular}
          linearizedFromCircular={linearizedFromCircular}
          cutPosition={origin.cutPosition || 0}
          excised={excised}
          frozen={container?.frozen}
          primers={pcrPrimers || []}
          flank={pcrFlank || null}
          width={210}
          height={90}
          testId={`skeleton-block-${container.id}-svg`}
        />
      </div>

      {/* Row 3 — state badge (circular / linear / linearized / excised) */}
      <div
        style={{
          fontSize: 9.5,
          color: 'var(--text-tertiary)',
          letterSpacing: 0.2,
          flexShrink: 0,
          lineHeight: 1.1,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span
          data-testid={`skeleton-block-${container.id}-status`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
        >
          {isCircular && <><Icon name="circular" size={11} /> plasmid</>}
          {!isCircular && linearizedFromCircular && <><Icon name="digest" size={11} /> linearized</>}
          {!isCircular && !linearizedFromCircular && excised && '⊟ excised fragment'}
          {!isCircular && !linearizedFromCircular && !excised && '— linear'}
        </span>
        {origin?.enzymes && Array.isArray(origin.enzymes) && origin.enzymes.length > 0 && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 9 }}>
            {origin.enzymes.join('+')}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(ContainerBlock);
