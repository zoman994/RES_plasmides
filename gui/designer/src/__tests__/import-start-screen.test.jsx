/**
 * ImportStartScreen — surviving multi-mode action assertion (Polish §6).
 *
 * Most of the original suite (MultiFileList rendering / inline-rename / batch
 * toggle, CatalogTree lazy-load, ActionsBar mode="multi") moved into IS-Final
 * dedicated tests:
 *   - multi-inspector.test.jsx    (replaces MultiFileList tests + V35 master)
 *   - catalog-panel.test.jsx      (replaces CatalogTree tests)
 *   - import-start-screen-is-final.test.jsx (orchestrator integration)
 *
 * What remains here is the historical Polish §6 negative-assertion that the
 * legacy Restriction/Мутагенез/Разобрать labels never resurface in the
 * action surface, kept as a regression guard against future ActionsBar
 * additions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ActionsBar from '../components/ImportStartScreen/ActionsBar';

describe('ActionsBar Polish §6 — no legacy entry points (regression guard)', () => {
  it('single-mode dropdown does not contain Restriction/Мутагенез/Разобрать', () => {
    const { getByTestId, queryByText, container } = render(
      <ActionsBar mode="single" onAction={vi.fn()} count={1} hasParsedItem exportEnabled />,
    );
    fireEvent.click(getByTestId('action-secondary-toggle'));
    expect(queryByText('Restriction')).toBeNull();
    expect(queryByText('Мутагенез')).toBeNull();
    expect(queryByText('Разобрать')).toBeNull();
    expect(container.textContent).not.toMatch(/Restriction|Мутагенез|Разобрать/);
  });
});
