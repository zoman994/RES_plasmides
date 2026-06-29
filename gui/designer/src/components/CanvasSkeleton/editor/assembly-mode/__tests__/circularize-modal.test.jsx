/**
 * circularize-modal.test.jsx — RC-SEP (Игорь 25.06). The modal is now the CLOSURE-
 * REACTION picker ONLY: topology is a header toggle, internal junctions are the strip
 * ромбы. It offers the ring-forming chemistries (Gibson / Golden Gate / KLD / RE sticky)
 * + blunt ligation — NOT overlap PCR (for a ring, overlap homology IS Gibson). No
 * topology toggle, no «применить ко всем». onConfirm({ method, enzyme }).
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import CircularizeModal from '../CircularizeModal';

afterEach(cleanup);

const draftN = (n) => ({
  name: 'x', topology: { circular: true }, segments: Array.from({ length: n }, (_, i) => ({ id: `s${i}` })),
});

describe('CircularizeModal — closure-reaction picker (RC-SEP)', () => {
  it('renders the dialog titled «Реакция замыкания кольца» (no topology toggle)', () => {
    render(<CircularizeModal draft={draftN(3)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-modal').textContent).toMatch(/Реакция замыкания/);
    expect(screen.queryByTestId('circularize-topology-linear')).toBeNull();
    expect(screen.queryByTestId('circularize-topology-circular')).toBeNull();
  });

  it('offers the closure reactions: Gibson / Golden Gate / RE / blunt (+ KLD); NOT overlap PCR', () => {
    render(<CircularizeModal draft={draftN(3)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-method-gibson')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-golden_gate')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-restriction')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-direct_ligation')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-kld')).toBeTruthy();
    // overlap PCR stitches a LINEAR product → not a ring-closing reaction.
    expect(screen.queryByTestId('circularize-method-overlap_pcr')).toBeNull();
  });

  it('KLD is disabled for a multi-fragment ring (self-closure is 1-fragment)', () => {
    render(<CircularizeModal draft={draftN(3)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-method-kld').disabled).toBe(true);
  });

  it('KLD is enabled for a single-fragment self-closure', () => {
    render(<CircularizeModal draft={draftN(1)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-method-kld').disabled).toBe(false);
  });

  it('confirm reports { method, enzyme } (enzyme null for a non-enzyme method)', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(3)} closureMethod="gibson" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ method: 'gibson', enzyme: null });
  });

  it('multi-fragment ring defaults to Gibson when no closureMethod given', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(2)} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ method: 'gibson', enzyme: null });
  });

  it('single-fragment defaults to KLD', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(1)} onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ method: 'kld', enzyme: null });
  });

  it('Golden Gate shows a Type IIS enzyme picker; the choice rides onConfirm', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(3)} closureMethod="golden_gate" onConfirm={onConfirm} onCancel={vi.fn()} />);
    const sel = screen.getByTestId('circularize-enzyme');
    expect(sel.value).toBe('BsaI'); // default
    fireEvent.change(sel, { target: { value: 'BsmBI' } });
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ method: 'golden_gate', enzyme: 'BsmBI' });
  });

  it('RE-лигирование shows a restriction-enzyme picker (default EcoRI)', () => {
    render(<CircularizeModal draft={draftN(3)} closureMethod="restriction" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-enzyme').value).toBe('EcoRI');
  });

  it('Gibson shows NO enzyme picker', () => {
    render(<CircularizeModal draft={draftN(3)} closureMethod="gibson" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId('circularize-enzyme')).toBeNull();
  });

  it('cancel + Escape both call onCancel', () => {
    const onCancel = vi.fn();
    render(<CircularizeModal draft={draftN(2)} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('circularize-cancel'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  // C4 — live biovalidation badge reflects the method × real fragment sequences.
  it('Golden Gate with an internal BsaI site → validation badge warns', () => {
    const draft = {
      name: 'x', topology: { circular: true },
      segments: [{ id: 'a', label: 'a', sequence: 'AAAGGTCTCAAAATTTT' }, { id: 'b', label: 'b', sequence: 'TTTTAAAACCCC' }],
    };
    render(<CircularizeModal draft={draft} closureMethod="golden_gate" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-validation').getAttribute('data-level')).toBe('warn');
  });

  it('Gibson with distinct, long-enough fragments → validation badge ok', () => {
    const draft = {
      name: 'x', topology: { circular: true },
      segments: [{ id: 'a', label: 'a', sequence: 'AAAACCCCGGGGTTTTAAAA' }, { id: 'b', label: 'b', sequence: 'TTTTGGGGCCCCAAAATTTT' }],
    };
    render(<CircularizeModal draft={draft} closureMethod="gibson" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-validation').getAttribute('data-level')).toBe('ok');
  });
});
