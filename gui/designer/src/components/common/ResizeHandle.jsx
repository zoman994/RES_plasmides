/**
 * ResizeHandle — the draggable divider rendered BETWEEN two split panes. Spread
 * the `separatorProps` from `useResizableSplit` onto it. A thin (7px) hit-strip
 * with a 1px centre line that reads as the panel border at rest and glows in the
 * accent colour on hover / during a drag. Horizontal split (axis 'x') → a
 * vertical line with a col-resize cursor; vertical split (axis 'y') → a
 * horizontal line with a row-resize cursor.
 */
import { useState } from 'react';

export default function ResizeHandle({
  axis = 'x',
  dragging = false,
  testid = 'resize-handle',
  title = 'Потяните, чтобы изменить размер · двойной клик — сброс',
  ...separatorProps
}) {
  const [hover, setHover] = useState(false);
  const active = hover || dragging;
  const horizontal = axis === 'x'; // vertical divider line

  return (
    <div
      {...separatorProps}
      data-testid={testid}
      title={title}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        flex: '0 0 auto',
        alignSelf: 'stretch',
        width: horizontal ? 7 : 'auto',
        height: horizontal ? 'auto' : 7,
        cursor: horizontal ? 'col-resize' : 'row-resize',
        position: 'relative',
        background: 'transparent',
        touchAction: 'none',
        userSelect: 'none',
        zIndex: 6,
        outline: 'none',
      }}
    >
      {/* centre line — panel border at rest, accent when active */}
      <div
        style={{
          position: 'absolute',
          inset: horizontal ? '0 3px' : '3px 0',
          background: active ? 'var(--accent-500, #f59e0b)' : 'var(--border-subtle, #e7e5e4)',
          opacity: active ? 0.9 : 1,
          transition: 'background 80ms linear',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
