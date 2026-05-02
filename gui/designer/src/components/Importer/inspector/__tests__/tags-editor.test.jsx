/**
 * Sprint M-B.2 follow-up — TagsEditor unit tests.
 *
 * Library fullscreen got wiped; tags now go on the entry at import time
 * via this editor. Confirm flow promotes the value into LibraryEntry.tags.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../../../store';
import TagsEditor from '../TagsEditor';

beforeEach(() => {
  useStore.setState((s) => {
    s.libraryEntries = {};
    s._libraryHydrated = true;
  });
});

afterEach(cleanup);

describe('M-B.2 follow-up — TagsEditor', () => {
  it('1) renders existing tags as chips with × buttons', () => {
    const onChange = vi.fn();
    render(<TagsEditor tags={['vector', 'bacterial']} onChange={onChange} />);
    expect(screen.getByTestId('importer-tag-vector')).toBeTruthy();
    expect(screen.getByTestId('importer-tag-bacterial')).toBeTruthy();
    fireEvent.click(screen.getByTestId('importer-tag-remove-vector'));
    expect(onChange).toHaveBeenCalledWith(['bacterial']);
  });

  it('2) Enter on input adds the normalized tag', () => {
    const onChange = vi.fn();
    render(<TagsEditor tags={['vector']} onChange={onChange} />);
    const input = screen.getByTestId('importer-tag-input');
    fireEvent.change(input, { target: { value: '  Bacterial  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['vector', 'bacterial']);
  });

  it('3) duplicate input is dropped silently — no onChange fired', () => {
    const onChange = vi.fn();
    render(<TagsEditor tags={['vector']} onChange={onChange} />);
    const input = screen.getByTestId('importer-tag-input');
    fireEvent.change(input, { target: { value: 'vector' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('4) suggestions surface from existing Library tag pool, click adds them', () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { id: 'e1', kind: 'container', tags: ['vector', 'gfp'], payload: {} },
        e2: { id: 'e2', kind: 'container', tags: ['vector', 'bacterial'], payload: {} },
      };
    });
    const onChange = vi.fn();
    render(<TagsEditor tags={[]} onChange={onChange} />);
    expect(screen.getByTestId('importer-tag-suggestion-vector')).toBeTruthy();
    expect(screen.getByTestId('importer-tag-suggestion-bacterial')).toBeTruthy();
    expect(screen.getByTestId('importer-tag-suggestion-gfp')).toBeTruthy();
    fireEvent.click(screen.getByTestId('importer-tag-suggestion-vector'));
    expect(onChange).toHaveBeenCalledWith(['vector']);
  });

  it('5) suggestion already-selected disappears from the suggestion list', () => {
    useStore.setState((s) => {
      s.libraryEntries = {
        e1: { id: 'e1', kind: 'container', tags: ['vector', 'gfp'], payload: {} },
      };
    });
    render(<TagsEditor tags={['vector']} onChange={() => {}} />);
    expect(screen.queryByTestId('importer-tag-suggestion-vector')).toBeNull();
    expect(screen.getByTestId('importer-tag-suggestion-gfp')).toBeTruthy();
  });
});
