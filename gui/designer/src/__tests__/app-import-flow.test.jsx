/**
 * Sprint Import-Start-Screen K8 — App.jsx wiring regression.
 *
 * The OS file-drop on the App root previously routed to setImportDecision()
 * with only the first file. After K8, all dropped files are forwarded to
 * ImportStartScreen via openImportStartScreen({ files: File[] }) so the
 * batch flow becomes possible.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

describe('openImportStartScreen wires all dropped files into ImportStartScreen state', () => {
  beforeEach(() => {
    useStore.setState({
      importStartOpen: false,
      importStartFiles: null,
      importStartCatalogMode: false,
    });
  });

  it('three files → store carries them all + catalogMode false + open=true', () => {
    const files = [
      new File(['ATGCATGC'], 'a.gb', { type: 'text/plain' }),
      new File(['ATGCATGC'], 'b.fasta', { type: 'text/plain' }),
      new File(['ATGCATGC'], 'c.dna', { type: 'application/octet-stream' }),
    ];
    useStore.getState().openImportStartScreen({ files });
    const s = useStore.getState();
    expect(s.importStartOpen).toBe(true);
    expect(s.importStartCatalogMode).toBe(false);
    expect(s.importStartFiles).toHaveLength(3);
    expect(s.importStartFiles.map((f) => f.name)).toEqual(['a.gb', 'b.fasta', 'c.dna']);
  });

  it('catalogMode opens with no files', () => {
    useStore.getState().openImportStartScreen({ catalogMode: true });
    const s = useStore.getState();
    expect(s.importStartOpen).toBe(true);
    expect(s.importStartCatalogMode).toBe(true);
    expect(s.importStartFiles).toBeNull();
  });

  it('K9: empty mode (header 📂 Импорт + QuickStart import) → no files, no catalogMode', () => {
    useStore.getState().openImportStartScreen({});
    const s = useStore.getState();
    expect(s.importStartOpen).toBe(true);
    expect(s.importStartCatalogMode).toBe(false);
    expect(s.importStartFiles).toBeNull();
  });

  it('closeImportStartScreen wipes files + catalogMode', () => {
    useStore.setState({
      importStartOpen: true,
      importStartFiles: [new File(['x'], 'x.gb')],
      importStartCatalogMode: true,
    });
    useStore.getState().closeImportStartScreen();
    const s = useStore.getState();
    expect(s.importStartOpen).toBe(false);
    expect(s.importStartFiles).toBeNull();
    expect(s.importStartCatalogMode).toBe(false);
  });
});
