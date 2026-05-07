/**
 * NeutralEdge — Sprint M-C.1 K2 component test (DEC-MC1-02).
 *
 * Solid neutral line, no markers, no dasharray. The component is a
 * thin wrapper around BaseEdge from @xyflow/react — we mount it
 * directly and assert that it returns a valid path element with the
 * expected stroke. Going through ReactFlow's full flow renderer
 * happy-dom tends to skip path rendering due to layout effects, so
 * we test the BaseEdge wrapper in isolation.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Position } from '@xyflow/react';
import NeutralEdge from '../NeutralEdge';

afterEach(() => cleanup());

describe('M-C.1 K2 — NeutralEdge', () => {
  it('renders an SVG path with the neutral stroke colour', () => {
    const { container } = render(
      <svg>
        <NeutralEdge
          id="e1"
          sourceX={0}
          sourceY={0}
          targetX={200}
          targetY={0}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          selected={false}
        />
      </svg>,
    );
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    // Neutral stroke colour from the design tokens (CSS var fallback chain).
    const stroke = path.getAttribute('stroke') || path.style.stroke || '';
    expect(stroke).toMatch(/var\(--text-secondary|#57534e/);
  });

  it('renders selected edge with accent stroke', () => {
    const { container } = render(
      <svg>
        <NeutralEdge
          id="e2"
          sourceX={0}
          sourceY={0}
          targetX={200}
          targetY={0}
          sourcePosition={Position.Right}
          targetPosition={Position.Left}
          selected={true}
        />
      </svg>,
    );
    const path = container.querySelector('path');
    expect(path).toBeTruthy();
    const stroke = path.getAttribute('stroke') || path.style.stroke || '';
    expect(stroke).toMatch(/var\(--accent-500|#d97706/);
  });
});
