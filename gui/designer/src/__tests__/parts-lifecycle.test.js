import { describe, it, expect, beforeEach } from 'vitest';
import { groupByLifecycle, formatProductName } from '../parts-grouping';
import { useStore } from '../store';

// ═══ A. groupByLifecycle ═══

describe('groupByLifecycle', () => {
  const activeProjectId = 'proj_1';

  const parts = [
    { id: 'p1', name: 'Draft-this', status: 'draft', origin: { projectId: 'proj_1' } },
    { id: 'p2', name: 'Draft-other', status: 'draft', origin: { projectId: 'proj_2' } },
    { id: 'p3', name: 'Verified', status: 'verified' },
    { id: 'p4', name: 'Archived', status: 'archived' },
    { id: 'p5', name: 'NoStatus', type: 'CDS' }, // legacy, no status
    { id: 'p6', name: 'Draft-noOrigin', status: 'draft' }, // draft but no origin
  ];

  it('draft + origin.projectId === active → thisProject', () => {
    const { thisProject } = groupByLifecycle(parts, activeProjectId);
    expect(thisProject.map(p => p.id)).toEqual(['p1']);
  });

  it('verified → library', () => {
    const { library } = groupByLifecycle(parts, activeProjectId);
    expect(library.map(p => p.id)).toContain('p3');
  });

  it('parts without status → library (backward compat)', () => {
    const { library } = groupByLifecycle(parts, activeProjectId);
    expect(library.map(p => p.id)).toContain('p5');
  });

  it('draft + origin.projectId !== active → otherProjects', () => {
    const { otherProjects } = groupByLifecycle(parts, activeProjectId);
    expect(otherProjects.map(p => p.id)).toEqual(['p2']);
  });

  it('archived → excluded from all groups', () => {
    const { thisProject, library, otherProjects } = groupByLifecycle(parts, activeProjectId);
    const allIds = [...thisProject, ...library, ...otherProjects].map(p => p.id);
    expect(allIds).not.toContain('p4');
  });

  it('draft without origin → not in thisProject or otherProjects', () => {
    const { thisProject, otherProjects } = groupByLifecycle(parts, activeProjectId);
    expect(thisProject.map(p => p.id)).not.toContain('p6');
    expect(otherProjects.map(p => p.id)).not.toContain('p6');
  });
});

// ═══ B. formatProductName ═══

describe('formatProductName', () => {
  it('formats as "{projectName} — {assemblyName}"', () => {
    expect(formatProductName('Проект 1', 'Сборка 3')).toBe('Проект 1 — Сборка 3');
  });

  it('handles empty strings', () => {
    expect(formatProductName('', 'Asm')).toBe(' — Asm');
  });
});

// ═══ C. origin.assemblyId in addPart ═══

describe('addPart origin.assemblyId', () => {
  beforeEach(() => {
    useStore.setState({
      parts: [],
      activeProjectId: 'proj_1',
      projectName: 'Test Project',
      activeId: 'asm_42',
    });
  });

  it('addPart() sets origin.assemblyId from activeId', () => {
    useStore.getState().addPart({
      name: 'TestPart', type: 'CDS', sequence: 'ATGC', length: 4, source: 'manual',
    });
    const added = useStore.getState().parts[0];
    expect(added.origin.assemblyId).toBe('asm_42');
    expect(added.origin.projectId).toBe('proj_1');
    expect(added.origin.projectName).toBe('Test Project');
    expect(added.origin.createdAt).toBeDefined();
  });

  it('addPart() with provided origin does not overwrite', () => {
    const customOrigin = { projectId: 'proj_X', projectName: 'Custom', assemblyId: 'asm_X', createdAt: '2025-01-01' };
    useStore.getState().addPart({
      name: 'Custom', type: 'CDS', sequence: 'ATGC', length: 4, origin: customOrigin,
    });
    const added = useStore.getState().parts[0];
    expect(added.origin).toEqual(customOrigin);
  });
});

// ═══ D. restorePart with targetStatus ═══

describe('restorePart with targetStatus', () => {
  beforeEach(() => {
    useStore.setState({
      parts: [
        { id: 'p1', name: 'Archived', status: 'archived', type: 'CDS' },
        { id: 'p2', name: 'Draft', status: 'draft', type: 'CDS' },
      ],
    });
  });

  it('restorePart(id) defaults to draft', () => {
    useStore.getState().restorePart('p1');
    expect(useStore.getState().parts.find(p => p.id === 'p1').status).toBe('draft');
  });

  it('restorePart(id, "verified") sets verified + verifiedDate', () => {
    useStore.getState().restorePart('p1', 'verified');
    const p = useStore.getState().parts.find(x => x.id === 'p1');
    expect(p.status).toBe('verified');
    expect(p.verifiedDate).toBeDefined();
  });

  it('restorePart on non-archived part is noop', () => {
    useStore.getState().restorePart('p2');
    expect(useStore.getState().parts.find(p => p.id === 'p2').status).toBe('draft');
  });
});
