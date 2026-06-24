import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useStore } from '../../../store';
import AppShell from '../../AppShell';

afterEach(cleanup);

describe('align workspace routing', () => {
  it('mounts AlignWorkspace when workspace.active is "align"', async () => {
    useStore.setState((s) => { s.workspace = { active: 'align', history: [], context: {} }; });
    render(<AppShell />);
    // AlignWorkspace is React.lazy → the dynamic import + transform can exceed the
    // default 1000 ms findBy timeout when vite-node is cold / the machine is under
    // load (pre-existing V146 flake; the assertion is just «the lazy chunk mounts»).
    expect(await screen.findByTestId('align-workspace', {}, { timeout: 5000 })).toBeTruthy();
  });
});
