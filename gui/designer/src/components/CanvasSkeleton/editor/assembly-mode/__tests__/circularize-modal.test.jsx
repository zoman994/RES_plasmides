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

  it('confirm reports {circular, method, applyToAll, enzyme} (enzyme null for a non-enzyme method)', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(3)} assemblyMethod="overlap_pcr" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('circularize-topology-circular'));
    fireEvent.click(screen.getByTestId('circularize-method-gibson'));
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({
      circular: true, method: 'gibson', applyToAll: true, enzyme: null,
    });
  });

  it('unchecking «применить ко всем» reports applyToAll:false', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(2, true)} assemblyMethod="gibson" onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId('circularize-apply-all')); // uncheck
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({
      circular: true, method: 'gibson', applyToAll: false, enzyme: null,
    });
  });

  // F — Golden Gate / RE-лигирование now expose an enzyme picker (no enzyme
  // picker before = the chosen chemistry could never be realised). overlap/Gibson
  // show none. The chosen enzyme rides onConfirm.
  it('Golden Gate shows a Type IIS enzyme picker; the choice rides onConfirm', () => {
    const onConfirm = vi.fn();
    render(<CircularizeModal draft={draftN(3, true)} assemblyMethod="golden_gate" onConfirm={onConfirm} onCancel={vi.fn()} />);
    const sel = screen.getByTestId('circularize-enzyme');
    expect(sel).toBeTruthy();
    expect(sel.value).toBe('BsaI'); // default
    fireEvent.change(sel, { target: { value: 'BsmBI' } });
    fireEvent.click(screen.getByTestId('circularize-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({
      circular: true, method: 'golden_gate', applyToAll: true, enzyme: 'BsmBI',
    });
  });

  it('RE-лигирование shows a restriction-enzyme picker (default EcoRI)', () => {
    render(<CircularizeModal draft={draftN(3, true)} assemblyMethod="restriction" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-enzyme').value).toBe('EcoRI');
  });

  it('Gibson / overlap show NO enzyme picker', () => {
    render(<CircularizeModal draft={draftN(3, true)} assemblyMethod="gibson" onConfirm={vi.fn()} onCancel={vi.fn()} />);
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
    render(<CircularizeModal draft={draft} assemblyMethod="golden_gate" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-validation').getAttribute('data-level')).toBe('warn');
  });

  it('Gibson with distinct, long-enough fragments → validation badge ok', () => {
    const draft = {
      name: 'x', topology: { circular: true },
      segments: [{ id: 'a', label: 'a', sequence: 'AAAACCCCGGGGTTTTAAAA' }, { id: 'b', label: 'b', sequence: 'TTTTGGGGCCCCAAAATTTT' }],
    };
    render(<CircularizeModal draft={draft} assemblyMethod="gibson" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('circularize-validation').getAttribute('data-level')).toBe('ok');
  });
});
