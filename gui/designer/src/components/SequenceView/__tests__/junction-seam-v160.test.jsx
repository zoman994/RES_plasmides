/**
 * V160 «визуализировать стык» — the assembly Sequence view renders a JUNCTION
 * SEAM at each internal boundary whose two RE fragments carry an `interlock`
 * (precomputed upstream in AssemblyShellBody). RC-SEP-SEAM (Игорь 25.06 «там букв
 * в принципе не должно быть, дело не в колористике») — the seam is now PURELY
 * VISUAL: compatible = interlocking teeth, incompatible = a tooth + an EMPTY
 * socket («выбитый зуб»), blunt = a flush line. There is NO text badge on screen;
 * the verdict / overhang / enzymes live in a hover TOOLTIP (the seam element's
 * `title`). Geometry (bars/teeth/sockets) is layout-dependent — here we assert the
 * verdict hotspot + tooltip + divider render through the real SequenceTab →
 * SegmentZonesOverlay path, and that NO letters are painted at the seam.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';

afterEach(cleanup);

const SEQ = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; // 32 bp → one line

const zonesWith = (interlock) => ([
  { zoneId: 'a', start: 0, end: 16, color: '#8b5cf6', interlock },
  { zoneId: 'b', start: 16, end: 32, color: '#ec4899' },
]);

const renderZones = (interlock) => render(
  <SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x"
    coloredZones={zonesWith(interlock)} onZoneClick={() => {}} />,
);

const COMPAT = {
  verdict: 'compatible', length: 4, message: 'Совместимы: 5′ AATT', overhang: 'AATT',
  side: 'afterP', topOwner: 'next', botOwner: 'this',
};
const INCOMPAT = {
  verdict: 'incompatible', length: 4, message: 'Несовместимые липкие концы: 5′ AATT ≠ 5′ TCGA',
  overhang: '', side: null, topOwner: null, botOwner: null,
};
const BLUNT = { verdict: 'blunt', length: 0, message: 'Тупые концы — стыкуются в любой ориентации', overhang: '', side: null, topOwner: null, botOwner: null };

describe('V160 — junction seam render (чисто визуальный, текст → тултип)', () => {
  it('compatible interlock → hotspot data-verdict="compatible", overhang в ТУЛТИПЕ, БЕЗ букв', () => {
    renderZones(COMPAT);
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('data-verdict')).toBe('compatible');
    // verdict + overhang живут в тултипе, не на экране.
    expect(seam.getAttribute('title')).toMatch(/AATT/);
    expect(seam.getAttribute('title')).toMatch(/Совместим/i);
    // Игорь 25.06 «там букв в принципе не должно быть» — стык несёт смысл формой, не текстом.
    expect(seam.textContent.trim()).toBe('');
  });

  it('incompatible interlock → data-verdict, БЕЗ букв и без ✕, вердикт в тултипе + нейтральный паз', () => {
    renderZones(INCOMPAT);
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('data-verdict')).toBe('incompatible');
    expect(seam.getAttribute('title')).toMatch(/Несовместим/i);
    // никаких букв на экране, и точно никакого красного ✕-алярма.
    expect(seam.textContent.trim()).toBe('');
    expect(seam.textContent).not.toContain('✕');
    expect(seam.style.color).not.toBe('rgb(220, 38, 38)');
    expect(screen.getByTestId('sequence-view-seam-divider')).toBeTruthy();
  });

  // RC-SEP-SEAM (Игорь 25.06) — an INCOMPATIBLE seam reads as a KNOCKED-OUT TOOTH:
  // a faint tooth on the overhang's strand + an EMPTY dashed socket where the
  // partner's complementary tooth is missing. Both ends are named ONLY in the
  // tooltip — never as on-screen letters. Fed via reOverhangs.right + .left.
  it('incompatible seam → зуб + ПУСТОЙ паз («выбитый зуб»); оба конца ТОЛЬКО в тултипе', () => {
    const zones = [
      {
        zoneId: 'a', start: 0, end: 16, color: '#8b5cf6',
        interlock: { verdict: 'incompatible', message: 'Несовместимые концы: 3′ GGCC ≠ тупой', overhang: '', side: null, length: 0 },
        reOverhangs: { right: { enzyme: 'ApaI', type: '3prime', delta: -4, seq: 'GGCC', label: '3′ GGCC' } },
      },
      {
        zoneId: 'b', start: 16, end: 32, color: '#ec4899',
        reOverhangs: { left: { enzyme: 'AjiI', type: 'blunt', delta: 0, seq: null, label: 'тупой' } },
      },
    ];
    render(<SequenceTab sequence={SEQ} annotations={[]} topology="linear" name="x" coloredZones={zones} onZoneClick={() => {}} />);
    // the overhang tooth — a DISTINCT accent fill (rgba 184,92,62), NOT the zone colour
    // (139,92,246 → не сливается с зоной).
    const tooth = screen.getByTestId('sequence-view-seam-mismatch');
    expect(tooth.style.background).toContain('184, 92, 62');
    expect(tooth.style.background).not.toContain('139, 92, 246');
    // «просто буквы убрать» (Игорь 26.06): NO cover box — the recessed strand's BASES are blanked in
    // StrandsTrack (genuine single-stranded staircase), so there's no socket div over the letters.
    expect(screen.queryByTestId('sequence-view-seam-socket')).toBeNull();
    // both ends are named in the TOOLTIP, not painted on the sequence.
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('title')).toMatch(/GGCC/);
    expect(seam.getAttribute('title')).toMatch(/тупой/);
    expect(seam.textContent.trim()).toBe('');
    expect(seam.textContent).not.toContain('✕');
  });

  it('blunt interlock → data-verdict="blunt", «тупой» в тултипе, БЕЗ букв', () => {
    renderZones(BLUNT);
    const seam = screen.getByTestId('sequence-view-junction-seam');
    expect(seam.getAttribute('data-verdict')).toBe('blunt');
    expect(seam.getAttribute('title')).toMatch(/тупой/i);
    expect(seam.textContent.trim()).toBe('');
  });

  it('unknown / no interlock → NO seam hotspot', () => {
    renderZones({ verdict: 'unknown', length: 0, message: '', overhang: '', side: null, topOwner: null, botOwner: null });
    expect(screen.queryByTestId('sequence-view-junction-seam')).toBeNull();
  });
});
