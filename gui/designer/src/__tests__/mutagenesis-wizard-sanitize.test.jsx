import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import MutagenesisWizard from '../components/MutagenesisWizard';

// api.js uses fetch — useEffect swallows rejection via .catch(() => {})
beforeEach(() => {
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('no backend in tests')));
});

describe('MutagenesisWizard — sanitize-at-entry contract', () => {
  it('template textarea preserves IUPAC codes (NNK, R/Y/S) on paste', () => {
    render(<MutagenesisWizard onComplete={() => {}} onClose={() => {}} />);
    const textarea = screen.getByPlaceholderText(/paste template/i);

    fireEvent.change(textarea, {
      target: { value: '\uFEFFatg  cccNNKrrySTGA' },
    });

    // Upper-cased, whitespace + BOM stripped, IUPAC preserved
    expect(textarea.value).toBe('ATGCCCNNKRRYSTGA');
  });

  it('template textarea strips truly invalid chars (digits, punctuation)', () => {
    render(<MutagenesisWizard onComplete={() => {}} onClose={() => {}} />);
    const textarea = screen.getByPlaceholderText(/paste template/i);

    fireEvent.change(textarea, { target: { value: 'ATGzzzCCC123!?' } });

    // lowercase atg upcased; z/digits/punctuation dropped; 'z' is NOT IUPAC
    expect(textarea.value).toBe('ATGCCC');
  });

  it('insertSequence input preserves NNK saturation codon', () => {
    render(<MutagenesisWizard onComplete={() => {}} onClose={() => {}} />);

    // Step 1 → fill template → Next
    const templateArea = screen.getByPlaceholderText(/paste template/i);
    fireEvent.change(templateArea, { target: { value: 'ATG'.repeat(50) } });
    fireEvent.click(screen.getByRole('button', { name: /Next: Define Mutations/i }));

    // Step 2 → Add mutation
    fireEvent.click(screen.getByRole('button', { name: /Add mutation/i }));

    // Switch type → insertion (first select on the mutation row)
    const typeSelect = screen.getAllByRole('combobox').find(s =>
      Array.from(s.options).some(o => o.value === 'insertion')
    );
    fireEvent.change(typeSelect, { target: { value: 'insertion' } });

    // Find insertSequence input via its placeholder (contains "6xHis" or "saturation")
    const insertInput = screen.getByPlaceholderText(/6xHis|saturation/i);

    fireEvent.change(insertInput, { target: { value: 'caccatnnkcatcac' } });

    expect(insertInput.value).toBe('CACCATNNKCATCAC');
  });
});
