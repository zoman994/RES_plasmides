/**
 * pieces-to-dag-preview — live derived source→reaction→fragment graph from pieces
 * (Игорь 22.06.2026 «живой вывод из кусков»).
 */
import { describe, it, expect } from 'vitest';
import { derivePiecesToGraph, opKindForMethod, synthLigation } from '../lib/pieces-to-dag-preview';
import { RE_ENZYMES } from '../../../restriction-db';

const SEQ = 'ATGCATGCATGCATGCATGC'; // 20 bp
const container = (id, name) => ({
  id, kind: 'molecule', name, sequence: SEQ, length: SEQ.length, topology: { circular: true }, annotations: [],
});
const zone = { id: 'z1', name: 'Assembly', topology: { circular: false } };

function stateWith(pieces) {
  return { containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone], pieces };
}

const sourcedPiece = (id, sourceId, method, params, createdAt) => ({
  id,
  zoneId: 'z1',
  kind: 'sourced',
  ranges: [{ sourceId, start: 0, end: 10, orientation: 'forward' }],
  acquisitionMethod: method,
  acquisitionParams: params || {},
  createdAt,
});

describe('opKindForMethod', () => {
  it('restriction → cut, everything else → pcr', () => {
    expect(opKindForMethod('restriction')).toBe('cut');
    expect(opKindForMethod('undefined')).toBe('pcr');
    expect(opKindForMethod('numeric')).toBe('pcr');
  });
});

describe('derivePiecesToGraph', () => {
  it('a restriction piece → source → Cut → fragment, wired', () => {
    const state = stateWith([
      sourcedPiece('p1', 'c1', 'restriction', { enzymes: ['EcoRI'], cutSites: [{ position: 5 }] }, 1),
    ]);
    const { containers, operations } = derivePiecesToGraph(state, zone);
    // one source + one fragment
    const src = containers.find((c) => c.id === 'dag-src-c1');
    const frag = containers.find((c) => c.id === 'dag-frag-p1');
    expect(src).toBeTruthy();
    expect(frag).toBeTruthy();
    expect(frag.sequence).toBe(SEQ.slice(0, 10));
    // one cut op wiring source → fragment
    expect(operations).toHaveLength(1);
    const op = operations[0];
    expect(op.kind).toBe('cut');
    expect(op.inputs).toEqual(['dag-src-c1']);
    expect(op.outputs).toEqual(['dag-frag-p1']);
    expect(op.params.enzymes).toEqual(['EcoRI']);
  });

  it('a non-restriction sourced piece → PCR op', () => {
    const state = stateWith([sourcedPiece('p1', 'c1', 'undefined', {}, 1)]);
    const { operations } = derivePiecesToGraph(state, zone);
    expect(operations[0].kind).toBe('pcr');
  });

  it('two pieces sharing one source → source node deduped (1 source, 2 ops, 2 fragments)', () => {
    const state = stateWith([
      sourcedPiece('p1', 'c1', 'restriction', {}, 1),
      sourcedPiece('p2', 'c1', 'restriction', {}, 2),
    ]);
    const { containers, operations } = derivePiecesToGraph(state, zone);
    expect(containers.filter((c) => c.id === 'dag-src-c1')).toHaveLength(1);
    expect(containers.filter((c) => c._role === 'fragment')).toHaveLength(2);
    expect(operations).toHaveLength(2);
    expect(operations.every((o) => o.inputs[0] === 'dag-src-c1')).toBe(true);
  });

  it('a manual/synthesis piece (no source) → standalone fragment, no op', () => {
    const state = stateWith([{
      id: 'pS', zoneId: 'z1', kind: 'synthesis', sequence: 'GGGGCCCC', name: 'synth', createdAt: 1,
    }]);
    const { containers, operations } = derivePiecesToGraph(state, zone);
    expect(operations).toHaveLength(0);
    const frag = containers.find((c) => c.id === 'dag-frag-pS');
    expect(frag).toBeTruthy();
    expect(frag.sequence).toBe('GGGGCCCC');
  });

  it('no zone / no state → empty graph', () => {
    expect(derivePiecesToGraph(null, zone)).toEqual({ containers: [], operations: [] });
    expect(derivePiecesToGraph(stateWith([]), null)).toEqual({ containers: [], operations: [] });
  });

  // RC-CLOSE-GATE (Игорь 25.06) — the CLOSURE/ring-forming step was invisible in
  // the LIVE DAG (it only materialised after «Реализовать»). A circular assembly
  // must now show the само-замыкание op + its circular product before realising.
  const circZone = { id: 'z1', name: 'Assembly', topology: { circular: true } };

  it('a CIRCULAR single-fragment assembly → fragment + closure op + circular product', () => {
    const state = {
      containers: [container('c1', 'pUC')], zones: [circZone],
      pieces: [sourcedPiece('p1', 'c1', 'restriction', { enzymes: ['EcoRI'], cutSites: [{ position: 5 }] }, 1)],
    };
    const { containers, operations } = derivePiecesToGraph(state, circZone);
    // chain still has source → Cut → fragment …
    expect(containers.find((c) => c.id === 'dag-frag-p1')).toBeTruthy();
    // … PLUS a circular product and a self-closure op фрагмент → product.
    const product = containers.find((c) => c._role === 'product');
    expect(product).toBeTruthy();
    expect(product.topology.circular).toBe(true);
    const closeOp = operations.find((o) => o.params && o.params.selfClosure);
    expect(closeOp).toBeTruthy();
    expect(closeOp.inputs).toEqual(['dag-frag-p1']);
    expect(closeOp.outputs).toEqual([product.id]);
  });

  it('a CIRCULAR multi-fragment assembly → closure op consumes ALL fragments', () => {
    const state = {
      containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [circZone],
      pieces: [sourcedPiece('p1', 'c1', 'restriction', {}, 1), sourcedPiece('p2', 'c2', 'restriction', {}, 2)],
    };
    const { containers, operations } = derivePiecesToGraph(state, circZone);
    const product = containers.find((c) => c._role === 'product');
    const closeOp = operations.find((o) => o.outputs && o.outputs[0] === product.id);
    expect(closeOp.inputs).toEqual(['dag-frag-p1', 'dag-frag-p2']);
    expect(closeOp.params.selfClosure).toBe(false);
  });

  it('a LINEAR assembly emits NO closure/product (unchanged — product appears after Реализовать)', () => {
    const state = stateWith([sourcedPiece('p1', 'c1', 'restriction', {}, 1)]);
    const { containers, operations } = derivePiecesToGraph(state, zone);
    expect(containers.find((c) => c._role === 'product')).toBeUndefined();
    expect(operations.find((o) => o.params && o.params.selfClosure != null)).toBeUndefined();
  });

  // V169 (Игорь 26.06) — the live DAG must NOT draw a valid Gibson→ring for an
  // impossible RE assembly: the method is RE-ligation (not Gibson), and incompatible
  // ends mark the product «не собирается» (reuses VirtualBlock disconnected).
  const reSingle = (id, sourceId, enzyme, createdAt) => ({
    id, zoneId: 'z1', kind: 'sourced',
    ranges: [{ sourceId, start: 0, end: 10, orientation: 'forward' }],
    acquisitionMethod: 'restriction',
    acquisitionParams: { single: true, enzymes: [enzyme], cutSites: [{ position: 5 }] },
    createdAt,
  });
  const reState = (e1, e2) => ({
    containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [circZone],
    pieces: [reSingle('p1', 'c1', e1, 1), reSingle('p2', 'c2', e2, 2)],
  });

  it('V169 — two RE fragments circular → closure op is RE-ligation (ligate), NOT Gibson', () => {
    const { operations } = derivePiecesToGraph(reState('EcoRI', 'EcoRI'), circZone);
    const closeOp = operations.find((o) => o.params && o.params.selfClosure === false);
    expect(closeOp.params.method).toBe('restriction');
    expect(closeOp.kind).toBe('ligate');
  });

  it('V169 — compatible RE ends (EcoRI×EcoRI) → product is NOT blocked', () => {
    const { containers, operations } = derivePiecesToGraph(reState('EcoRI', 'EcoRI'), circZone);
    const product = containers.find((c) => c._role === 'product');
    expect(product._virtualState).toBeUndefined();
    const closeOp = operations.find((o) => o.outputs && o.outputs[0] === product.id);
    expect(closeOp.status).toBe('committed');
  });

  it('V169 — INCOMPATIBLE RE ends (EcoRI×SalI) → product disconnected + closure op failed', () => {
    const { containers, operations } = derivePiecesToGraph(reState('EcoRI', 'SalI'), circZone);
    const product = containers.find((c) => c._role === 'product');
    expect(product._virtualState).toBe('disconnected');
    expect(Array.isArray(product._virtualWarnings)).toBe(true);
    expect(product._virtualWarnings[0]).toMatch(/Несовместим/i);
    const closeOp = operations.find((o) => o.outputs && o.outputs[0] === product.id);
    expect(closeOp.status).toBe('failed');
  });

  // VERT-READINESS (Игорь 27.06) — the card border encodes ASSEMBLY READINESS: each
  // fragment carries `_readiness` ('ready'|'check'|'incompatible') from its two adjacent
  // junctions' interlock verdicts (same model as the V169 gate).
  it('VERT — circular RE with COMPATIBLE ends → fragments _readiness "ready"', () => {
    const { containers } = derivePiecesToGraph(reState('EcoRI', 'EcoRI'), circZone);
    const frags = containers.filter((c) => c._role === 'fragment');
    expect(frags.length).toBeGreaterThan(0);
    expect(frags.every((f) => f._readiness === 'ready')).toBe(true);
  });

  it('VERT — circular RE with INCOMPATIBLE ends → fragments _readiness "incompatible"', () => {
    const { containers } = derivePiecesToGraph(reState('EcoRI', 'SalI'), circZone);
    const frags = containers.filter((c) => c._role === 'fragment');
    expect(frags.length).toBeGreaterThan(0);
    expect(frags.every((f) => f._readiness === 'incompatible')).toBe(true);
  });

  // VERT-READINESS bio-correction (Игорь 27.06): «стыки 1 рестриктазой собираются если
  // перевернуть фрагмент; тупые RE-концы лигируются». Two fragments each {blunt-left,
  // GGCC(3′)-right}: in the given order seg0.right(GGCC) faces seg1.left(blunt) — a naive
  // fixed-orientation check would say incompatible, but FLIPPING seg1 mates GGCC↔GGCC (and
  // the blunt ends ligate). So readiness must be 'ready', NOT 'incompatible'.
  const reTwo = (id, sourceId, eLeft, eRight, createdAt) => ({
    id, zoneId: 'z1', kind: 'sourced',
    ranges: [{ sourceId, start: 0, end: 10, orientation: 'forward' }],
    acquisitionMethod: 'restriction',
    acquisitionParams: { enzymes: [eLeft, eRight], cutSites: [{ position: 0 }, { position: 10 }] },
    createdAt,
  });

  it('VERT — flip/blunt: matching sticky end + blunt end → fragments "ready" (not incompatible)', () => {
    const state = {
      containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone],
      pieces: [reTwo('p1', 'c1', 'SmaI', 'ApaI', 1), reTwo('p2', 'c2', 'SmaI', 'ApaI', 2)],
    };
    const { containers } = derivePiecesToGraph(state, zone);
    const frags = containers.filter((c) => c._role === 'fragment');
    expect(frags.length).toBe(2);
    expect(frags.every((f) => f._readiness === 'ready')).toBe(true);
  });

  it('VERT — two fully BLUNT fragments → "ready" (blunt RE ends ligate)', () => {
    const state = {
      containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone],
      pieces: [reSingle('p1', 'c1', 'SmaI', 1), reSingle('p2', 'c2', 'EcoRV', 2)],
    };
    const { containers } = derivePiecesToGraph(state, zone);
    const frags = containers.filter((c) => c._role === 'fragment');
    expect(frags.every((f) => f._readiness === 'ready')).toBe(true);
  });

  // VERT-1 (Игорь 26.06) — vertical DAG «хвосты из карточки»: each derived fragment
  // carries terminalStagger geometry (which strand protrudes + overhang seq + 5′/3′)
  // so the card can draw its physical sticky ends. SAME model as the seam staircase
  // and the compatibility gate, so the tails can never disagree with the verdict.
  it('VERT-1 — a restriction fragment carries _stagger (protruding strand + overhang)', () => {
    const { containers } = derivePiecesToGraph(reState('EcoRI', 'EcoRI'), circZone);
    const frag = containers.find((c) => c.id === 'dag-frag-p1');
    expect(frag._stagger).toBeTruthy();
    // EcoRI is a 5′ overhang → LEFT end top strand protrudes, RIGHT end bottom protrudes.
    expect(frag._stagger.left.protruding).toBe('top');
    expect(frag._stagger.right.protruding).toBe('bottom');
    expect(frag._stagger.left.seq).toBeTruthy();
    expect(frag._stagger.left.type).toBe('5prime');
  });

  it('VERT-1 — a synthesis (non-RE) fragment has no _stagger', () => {
    const state = stateWith([{
      id: 'pS', zoneId: 'z1', kind: 'synthesis', sequence: 'GGGGCCCC', name: 'synth', createdAt: 1,
    }]);
    const { containers } = derivePiecesToGraph(state, zone);
    const frag = containers.find((c) => c.id === 'dag-frag-pS');
    expect(frag._stagger == null).toBe(true);
  });

  // Ф2 (Игорь 27.06 «притянуть одну к другой → автоматически показывает стык; только
  // совместимые концы») — derive emits per-junction descriptors {fromId,toId,verdict}
  // between adjacent assembly fragments so the vertical DAG can magnet-snap compatible
  // ends together and draw the seam. Verdict is orientation-aware (flip + blunt),
  // reusing the same feasRank as the readiness border.
  it('Ф2/Ф5 — 2 совместимых фрагмента авто-замыкаются → внутренний + замыкающий стык', () => {
    const state = {
      containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone],
      pieces: [reSingle('p1', 'c1', 'EcoRI', 1), reSingle('p2', 'c2', 'EcoRI', 2)],
    };
    const { assemblyJunctions } = derivePiecesToGraph(state, zone);
    expect(Array.isArray(assemblyJunctions)).toBe(true);
    // авто-кольцо (Ф5): внутренний стык p1→p2 + замыкающий p2→p1
    expect(assemblyJunctions).toHaveLength(2);
    const internal = assemblyJunctions.find((j) => !j.closure);
    expect(internal).toMatchObject({
      fromId: 'dag-frag-p1', toId: 'dag-frag-p2', verdict: 'compatible',
    });
    expect(assemblyJunctions.every((j) => j.verdict === 'compatible')).toBe(true);
  });

  it('Ф2 — circular adds the closure junction (last→first)', () => {
    const { assemblyJunctions } = derivePiecesToGraph(reState('EcoRI', 'EcoRI'), circZone);
    expect(assemblyJunctions).toHaveLength(2);
    expect(assemblyJunctions.map((j) => `${j.fromId}->${j.toId}`)).toEqual(
      expect.arrayContaining(['dag-frag-p1->dag-frag-p2', 'dag-frag-p2->dag-frag-p1']),
    );
    expect(assemblyJunctions.every((j) => j.verdict === 'compatible')).toBe(true);
  });

  it('Ф2 — incompatible ends (EcoRI×SalI) → junction verdict "incompatible"', () => {
    const { assemblyJunctions } = derivePiecesToGraph(reState('EcoRI', 'SalI'), circZone);
    expect(assemblyJunctions.length).toBeGreaterThan(0);
    expect(assemblyJunctions.every((j) => j.verdict === 'incompatible')).toBe(true);
  });

  // Ф4.2 (Игорь 27.06 «где переворот фрагмента?») — orientFragments назначает rc, и
  // фрагмент рисуется ПЕРЕВЁРНУТЫМ: помечен _reversed, его липкий конец свапнут (GGCC
  // переезжает на сторону, обращённую к стыку).
  it('Ф4.2 — фрагмент, требующий переворота, помечен _reversed + конец свапнут', () => {
    const state = {
      containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone],
      pieces: [reTwo('p1', 'c1', 'SmaI', 'ApaI', 1), reTwo('p2', 'c2', 'SmaI', 'ApaI', 2)],
    };
    const { containers } = derivePiecesToGraph(state, zone);
    const f1 = containers.find((c) => c.id === 'dag-frag-p1');
    const f2 = containers.find((c) => c.id === 'dag-frag-p2');
    expect(f1._reversed).toBe(false);
    expect(f2._reversed).toBe(true);
    // forward: тупой конец слева → stagger.left null; reversed: GGCC переехал налево.
    expect(f1._stagger.left).toBeNull();
    expect(f2._stagger.left).toBeTruthy();
  });

  // Ф4.3 (Игорь 27.06 «свёл объекты → реакция → продукт со слепленными нуклеотидами;
  // показать восстановленный сайт») — synthLigation = операция лигирования + продукт.
  it('Ф4.3 — synthLigation: операция + продукт (overhang раз) + восстановленный сайт', () => {
    const a = { id: 'fa', sequence: 'AAAAGGGCC' };
    const b = { id: 'fb', sequence: 'GGCCTTTT' };
    const { op, product } = synthLigation(a, b, { overhang: 'GGCC', enzyme: 'ApaI' }, RE_ENZYMES);
    expect(op.kind).toBe('ligate');
    expect(op.inputs).toEqual(['fa', 'fb']);
    expect(op.outputs).toEqual([product.id]);
    // Ф5 — concat без дедупа overhang (движковая конвенция): AAAAGGGCC + GGCCTTTT
    expect(product.sequence).toBe('AAAAGGGCCGGCCTTTT');
    expect(product._role).toBe('product');
    const site = product.annotations.find((x) => /ApaI/.test(x.name || ''));
    expect(site).toBeTruthy();
    // site annotated near the seam, valid coords within the product
    expect(site.start).toBeGreaterThanOrEqual(0);
    expect(site.end).toBeGreaterThan(site.start);
    expect(site.end).toBeLessThanOrEqual(product.sequence.length);
    expect(site.end - site.start).toBe('GGGCCC'.length);
  });

  // Ф4.4 (Игорь 27.06 «собираться должно в кольцо») — RE-фрагменты с совместимыми концами
  // с обеих сторон лигируются в КОЛЬЦЕВУЮ плазмиду, не линейный концат.
  it('Ф4.4 — synthLigation circular → продукт-плазмида', () => {
    const a = { id: 'fa', sequence: 'AAAAGGGCC' };
    const b = { id: 'fb', sequence: 'GGCCTTTT' };
    const { product } = synthLigation(a, b, { overhang: 'GGCC', enzyme: 'ApaI' }, RE_ENZYMES, { circular: true });
    expect(product.topology.circular).toBe(true);
    expect(product.name).toMatch(/плазмид/i);
  });

  it('Ф4.4 — derive: два {SmaI,ApaI} замыкаются в кольцо (ringCloses)', () => {
    const state = {
      containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone],
      pieces: [reTwo('p1', 'c1', 'SmaI', 'ApaI', 1), reTwo('p2', 'c2', 'SmaI', 'ApaI', 2)],
    };
    expect(derivePiecesToGraph(state, zone).ringCloses).toBe(true);
  });

  it('Ф4.4 — derive: несовместимая пара (EcoRI×SalI) не замыкается', () => {
    const state = {
      containers: [container('c1', 'pUC'), container('c2', 'pGEX')], zones: [zone],
      pieces: [reSingle('p1', 'c1', 'EcoRI', 1), reSingle('p2', 'c2', 'SalI', 2)],
    };
    expect(derivePiecesToGraph(state, zone).ringCloses).toBe(false);
  });

  // Игорь 27.06 «полученная плазмида должна наследовать разметку фичей».
  it('Ф4.4 — продукт наследует фичи фрагментов с пересчётом координат', () => {
    const a = { id: 'fa', sequence: 'AAAAGGGCC', annotations: [{ id: 'pa', name: 'promA', start: 0, end: 4 }] };
    const b = { id: 'fb', sequence: 'GGCCTTTT', annotations: [{ id: 'pb', name: 'cdsB', start: 4, end: 8 }] };
    const { product } = synthLigation(a, b, { overhang: 'GGCC', enzyme: 'ApaI' }, RE_ENZYMES);
    const fa = product.annotations.find((x) => x.name === 'promA');
    const fb = product.annotations.find((x) => x.name === 'cdsB');
    expect(fa).toBeTruthy();
    expect(fa.start).toBe(0);
    expect(fa.end).toBe(4);
    // Ф5 — b offset = aLen(9) (concat); cdsB [4,8] → [13,17]
    expect(fb.start).toBe(13);
    expect(fb.end).toBe(17);
  });
});
