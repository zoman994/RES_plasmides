/**
 * zone-layout-rules.test.js — T4.5 K2 (DEC-T4.5-03).
 *
 * Pure lane classification derived from state refs (NOT a node.role
 * flag): Sources = zone container with no incoming junction & not an
 * op output; Finals = zone container with no outgoing junction & not an
 * op input (frozen = strong signal); Intermediate = everything else
 * (pieces, ops, mid containers). Precedence source > final > mid; an
 * isolated single container resolves to source (deterministic).
 */
import { describe, it, expect } from 'vitest';
import {
  collectAllNodes, isSource, isFinal, isIntermediate, classifyZoneNodes,
} from '../lib/zone-layout-rules';

const cnt = (id, over = {}) => ({
  id, kind: 'molecule', name: id, sequence: 'ACGT', zoneId: 'z1', ...over,
});
const pc = (id, over = {}) => ({
  id, kind: 'sourced', name: id, zoneId: 'z1', ranges: [], ...over,
});
const op = (id, over = {}) => ({
  id, kind: 'pcr', status: 'committed', inputs: [], outputs: [],
  inputPieces: [], zoneId: 'z1', position: { x: 0, y: 0 }, ...over,
});

function st(over = {}) {
  return {
    zones: [{ id: 'z1', name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    containers: [], pieces: [], operations: [], junctions: [], positions: {},
    ...over,
  };
}

describe('T4.5 K2 — collectAllNodes', () => {
  it('flattens containers + pieces + operations of the zone', () => {
    const s = st({
      containers: [cnt('c1'), cnt('cX', { zoneId: 'other' })],
      pieces: [pc('p1')],
      operations: [op('o1')],
    });
    const nodes = collectAllNodes(s, 'z1');
    expect(nodes.map((n) => n.id).sort()).toEqual(['c1', 'o1', 'p1']);
    expect(nodes.find((n) => n.id === 'c1').kind).toBe('container');
    expect(nodes.find((n) => n.id === 'p1').kind).toBe('piece');
    expect(nodes.find((n) => n.id === 'o1').kind).toBe('operation');
  });
});

describe('T4.5 K2 — isSource / isFinal / isIntermediate', () => {
  it('container with no incoming junction & not an op output → source', () => {
    const s = st({
      containers: [cnt('src'), cnt('mid')],
      junctions: [{ id: 'j', fromContainerId: 'src', toContainerId: 'mid', kind: 'overlap' }],
    });
    expect(isSource(s, 'z1', 'src')).toBe(true);
    expect(isSource(s, 'z1', 'mid')).toBe(false); // has incoming
  });

  it('container produced by an op (op output) is NOT a source', () => {
    const s = st({
      containers: [cnt('a'), cnt('prod')],
      operations: [op('o1', { inputs: ['a'], outputs: ['prod'] })],
    });
    expect(isSource(s, 'z1', 'prod')).toBe(false);
    expect(isSource(s, 'z1', 'a')).toBe(true);
  });

  it('container with no outgoing junction & not an op input → final; op input → not', () => {
    const s = st({
      containers: [cnt('a'), cnt('fin')],
      operations: [op('o1', { inputs: ['a'], outputs: ['fin'] })],
    });
    expect(isFinal(s, 'z1', 'fin')).toBe(true);
    expect(isFinal(s, 'z1', 'a')).toBe(false); // used as op input
  });

  it('frozen container (executed product) is a final even with an outgoing edge', () => {
    const s = st({
      containers: [cnt('prod', { frozen: true }), cnt('downstream')],
      junctions: [{ id: 'j', fromContainerId: 'prod', toContainerId: 'downstream', kind: 'overlap' }],
    });
    expect(isFinal(s, 'z1', 'prod')).toBe(true);
  });

  it('pieces and operations are always intermediate (never source/final)', () => {
    const s = st({ pieces: [pc('p1')], operations: [op('o1')] });
    expect(isSource(s, 'z1', 'p1')).toBe(false);
    expect(isFinal(s, 'z1', 'p1')).toBe(false);
    expect(isIntermediate(s, 'z1', 'p1')).toBe(true);
    expect(isIntermediate(s, 'z1', 'o1')).toBe(true);
  });
});

describe('T4.5 K2 — classifyZoneNodes (mutually exclusive, precedence)', () => {
  it('partitions a 4-frag DAG into 3 lanes', () => {
    const s = st({
      containers: [cnt('src1'), cnt('src2'), cnt('mid'), cnt('fin', { frozen: true })],
      pieces: [pc('p1')],
      operations: [op('o1', { inputs: ['src1'], outputs: ['mid'] })],
      junctions: [
        { id: 'j1', fromContainerId: 'src2', toContainerId: 'mid', kind: 'overlap' },
        { id: 'j2', fromContainerId: 'mid', toContainerId: 'fin', kind: 'overlap' },
      ],
    });
    const { sources, intermediate, finals } = classifyZoneNodes(s, 'z1');
    expect(sources.map((n) => n.id).sort()).toEqual(['src1', 'src2']);
    expect(finals.map((n) => n.id)).toEqual(['fin']);
    expect(intermediate.map((n) => n.id).sort()).toEqual(['mid', 'o1', 'p1']);
  });

  it('isolated single container resolves to source (deterministic tie-break)', () => {
    const s = st({ containers: [cnt('only')] });
    const { sources, finals, intermediate } = classifyZoneNodes(s, 'z1');
    expect(sources.map((n) => n.id)).toEqual(['only']);
    expect(finals).toEqual([]);
    expect(intermediate).toEqual([]);
  });

  it('every node lands in exactly one lane', () => {
    const s = st({
      containers: [cnt('a'), cnt('b'), cnt('c')],
      operations: [op('o1', { inputs: ['a'], outputs: ['b'] })],
      junctions: [{ id: 'j', fromContainerId: 'b', toContainerId: 'c', kind: 'overlap' }],
    });
    const { sources, intermediate, finals } = classifyZoneNodes(s, 'z1');
    const all = [...sources, ...intermediate, ...finals].map((n) => n.id).sort();
    expect(all).toEqual(['a', 'b', 'c', 'o1']);
  });
});
