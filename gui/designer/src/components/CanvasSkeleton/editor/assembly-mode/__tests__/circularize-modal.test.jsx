/**
 * circularize-modal.test.jsx — M-CIRCULARIZE C1. The «замкнуть в плазмиду»
 * modal: topology segmented control + closure-method cards (biologically
 * filtered by topology) + «применить ко всем стыкам» → onConfirm.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import CircularizeModal from '../CircularizeModal';

afterEach(cleanup);

const draftN = (n, circular = false) => ({
  name: 'x', topology: { circular }, segments: Array.from({ length: n }, () => ({})),
});

describe('CircularizeModal', () => {
  it('renders the dialog with the topology segmented control', () => {
    render(<CircularizeModal draft={draftN(3)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-modal')).toBeTruthy();
    expect(screen.getByTestId('circularize-topology-linear')).toBeTruthy();
    expect(screen.getByTestId('circularize-topology-circular')).toBeTruthy();
  });

  it('circular topology offers the closure reactions (Gibson/GG/RE/overlap + blunt)', () => {
    render(<CircularizeModal draft={draftN(3, true)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-method-gibson')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-golden_gate')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-restriction')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-overlap_pcr')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-direct_ligation')).toBeTruthy();
  });

  it('linear topology offers only the internal-fuse methods (no Gibson/GG)', () => {
    render(<CircularizeModal draft={draftN(3, false)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-method-overlap_pcr')).toBeTruthy();
    expect(screen.getByTestId('circularize-method-restriction')).toBeTruthy();
    expect(screen.queryByTestId('circularize-method-gibson')).toBeNull();
    expect(screen.queryByTestId('circularize-method-golden_gate')).toBeNull();
  });

  it('KLD is disabled for a multi-fragment circular assembly (self-closure is 1-fragment)', () => {
    render(<CircularizeModal draft={draftN(3, true)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-method-kld').disabled).toBe(true);
  });

  it('KLD is enabled for a single-fragment circular assembly (self-closure)', () => {
    render(<CircularizeModal draft={draftN(1, true)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-method-kld').disabled).toBe(false);
  });

  it('confirm reports {circular, method, applyToAll}', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(3)} assemblyMethod="overlap_pcr" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('circularize-topology-circular'));
    fireEvent.click(screen.getByTestId('circularize-method-gibson'));
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ circular: true, method: 'gibson', applyToAll: true });
  });

  it('unchecking «применить ко всем» reports applyToAll:false', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(2, true)} assemblyMethod="gibson" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('circularize-apply-all')); // uncheck
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ circular: true, method: 'gibson', applyToAll: false });
  });

  it('cancel + Escape both call onCancel', () => {
    const onCancel = vi.fn();
    render(<CircularizeModal draft={draftN(2)} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('circularize-cancel'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
