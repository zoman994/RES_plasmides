/**
 * zone-frame-op-click-k4.test.jsx — M-CANVAS-FIX.1 K4 (V139).
 *
 * The reaction diamond inside a zone was click-dead: ZoneGraphContent accepts
 * onOperationClick and wires it to the OperationNode, but ZoneFrame never
 * passed one (works in CanvasGraphView, which does). K4 makes ZoneFrame supply
 * the handler — «живой ромб + настройка лёгкая» (Игорь §0.5).
 *
 * `.2` (Игорь 11.06): CanvasLayoutView now HOSTS the in-zone op popup and passes
 * its own onOperationClick down. ZoneFrame PREFERS that prop (→ inline
 * OpKindPicker/OpPopupRouter, parity with CanvasGraphView) and only falls back
 * to the editor route (OPEN_EDITOR_OP_TAB) when no handler is supplied
 * (standalone mounts / these isolated tests).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ZoneFrame from '../canvas/ZoneFrame';

// Capture the props ZoneFrame hands to ZoneGraphContent without rendering the
// real graph (the wiring under test is "ZoneFrame supplies onOperationClick").
let captured = null;
vi.mock('../canvas/ZoneGraphContent', () => ({
  default: (props) => { captured = props; return null; },
}));

afterEach(() => { captured = null; cleanup(); });

const STATE = {
  containers: [], operations: [], pieces: [], junctions: [], positions: {},
  zones: [{ id: 'z', name: 'Z', viewMode: 'graph', bounds: { x: 0, y: 0, width: 400, height: 300 } }],
};
const ZONE = STATE.zones[0];

describe('K4 — live reaction diamond in a zone (V139)', () => {
  it('ZoneFrame supplies onOperationClick to ZoneGraphContent', () => {
    render(<ZoneFrame zone={ZONE} state={STATE} dispatch={() => {}} />);
    expect(captured).toBeTruthy();
    expect(typeof captured.onOperationClick).toBe('function');
  });

  it('clicking a diamond opens that operation editor (OPEN_EDITOR_OP_TAB)', () => {
    const dispatch = vi.fn();
    render(<ZoneFrame zone={ZONE} state={STATE} dispatch={dispatch} />);
    captured.onOperationClick({ id: 'op7', kind: 'pcr' });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_EDITOR_OP_TAB', operationId: 'op7' }),
    );
  });

  it('a null/absent operation is a no-op (defensive)', () => {
    const dispatch = vi.fn();
    render(<ZoneFrame zone={ZONE} state={STATE} dispatch={dispatch} />);
    captured.onOperationClick(null);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('.2 — prefers a passed onOperationClick (in-zone popup host) over the editor route', () => {
    const dispatch = vi.fn();
    const onOperationClick = vi.fn();
    render(
      <ZoneFrame zone={ZONE} state={STATE} dispatch={dispatch} onOperationClick={onOperationClick} />,
    );
    const op = { id: 'op9', kind: 'gibson' };
    const evt = { clientX: 5, clientY: 6 };
    captured.onOperationClick(op, evt);
    // Routed to the host (which opens OpKindPicker/OpPopupRouter), with the
    // click coords for anchoring — NOT the OPEN_EDITOR_OP_TAB fallback.
    expect(onOperationClick).toHaveBeenCalledWith(op, evt);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_EDITOR_OP_TAB' }),
    );
  });
});
