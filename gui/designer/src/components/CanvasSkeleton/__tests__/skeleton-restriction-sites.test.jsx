/**
 * Restriction sites — clickable + popover + cut visualization.
 *
 * 12.05.2026 — Игорь: «сайты рестрикции должны быть кликабельны и
 * подсвечивать зону разреза и визуализировать липкие либо тупые
 * концы». Reference: SnapGene.
 *
 * Coverage:
 *  - RestrictionTrack rendered with onSiteClick → <g> clickable +
 *    hover cursor; without onSiteClick — display-only (no click).
 *  - highlightedKey="enzyme-position" → highlight rect rendered.
 *  - Click site → onSiteClick(site) fires с site object.
 *  - RestrictionSitePopover renders sticky/blunt kind correctly:
 *    EcoRI (5' overhang AATT) → kind='5overhang', 4 nt overhang text.
 *    PstI (3' overhang TGCA) → kind='3overhang'.
 *    EcoRV (blunt) → kind='blunt'.
 *  - Click «Разрезать здесь» → onCut(cutTopAbs) dispatch.
 *  - ESC / × / backdrop → onCancel.
 */
import 'fake-indexeddb/auto';
import { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import RestrictionTrack from '../../SequenceView/tracks/RestrictionTrack';
import { flattenSites } from '../../SequenceView/lib/feature-map';
import { scanAllSites } from '../../../restriction-db';
import { scanOccurrences } from '../../../lib/restriction-occurrence';
import RestrictionSitePopover from '../editor/RestrictionSitePopover';
import { useSequenceSelection } from '../../../hooks/useSequenceSelection';
import { restrictionSiteKey } from '../../../lib/restriction-occurrence';

afterEach(cleanup);

const wrapInSvg = (jsx) => (
  <svg width={800} height={100}>{jsx}</svg>
);

function CanonicalCutHarness({ site, onCut, onTransport }) {
  const [popoverSite, setPopoverSite] = useState(null);
  const selection = useSequenceSelection({
    reBehavior: 'cut',
    onCutHere: (clicked) => {
      onTransport('hook', restrictionSiteKey(clicked));
      setPopoverSite(clicked);
    },
  });
  return (
    <>
      <RestrictionTrack
        sites={[site]}
        lineStart={0}
        lineLen={150}
        charPx={5}
        labelChars={6}
        reOrientation="horizontal"
        highlightedKey={popoverSite ? restrictionSiteKey(popoverSite) : null}
        onSiteClick={(clicked, event) => {
          onTransport('track', restrictionSiteKey(clicked));
          selection.onRestrictionClick(clicked, event);
        }}
      />
      {popoverSite && (
        <RestrictionSitePopover
          site={popoverSite}
          position={{ x: 200, y: 200 }}
          onCut={(cut) => {
            onTransport('popover', restrictionSiteKey(popoverSite));
            onCut(cut);
          }}
          onCancel={() => setPopoverSite(null)}
        />
      )}
    </>
  );
}

describe('RestrictionTrack — clickable mode (12.05.2026)', () => {
  const sites = [
    { enzyme: 'EcoRI', position: 50 },
    { enzyme: 'BamHI', position: 120 },
  ];

  it('display-only (no onSiteClick) — no cursor / no click reaction', () => {
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="vertical"
      />,
    );
    const sg = screen.getAllByTestId('sequence-view-re-site');
    expect(sg.length).toBe(2);
    // Default cursor.
    expect(sg[0].style.cursor).toBe('default');
  });

  it('clickable mode — cursor pointer + click fires onSiteClick(site)', () => {
    const calls = [];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="vertical"
        onSiteClick={(s) => calls.push(s)}
      />,
    );
    const sg = screen.getAllByTestId('sequence-view-re-site');
    expect(sg[0].style.cursor).toBe('pointer');
    fireEvent.click(sg[0]);
    expect(calls).toEqual([{ enzyme: 'EcoRI', position: 50 }]);
  });

  it('highlightedKey=enzyme-position → marks that site selected (no box/wedges)', () => {
    const calls = [];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="vertical"
        onSiteClick={(s) => calls.push(s)}
        highlightedKey="EcoRI-50"
      />,
    );
    // The «жёлтый овал + стрелки» box was removed (Игорь 22.06); selection is now
    // shown by the label accent + data-highlighted, not a separate overlay group.
    expect(screen.queryByTestId('sequence-view-re-highlight')).toBeNull();
    // Only EcoRI gets data-highlighted="true".
    const sg = screen.getAllByTestId('sequence-view-re-site');
    const ecoRI = sg.find((g) => g.getAttribute('data-enzyme') === 'EcoRI');
    const bamHI = sg.find((g) => g.getAttribute('data-enzyme') === 'BamHI');
    expect(ecoRI.getAttribute('data-highlighted')).toBe('true');
    expect(bamHI.getAttribute('data-highlighted')).toBe('false');
  });
});

describe('RestrictionTrack — hover tooltip (SnapGene-style)', () => {
  it('renders the actual top-strand match and reverse cuts from a custom occurrence', () => {
    const FlipI = { site: 'ACGTTA', cut: [1, 4], isCustom: true };
    const [occurrence] = scanOccurrences('TTTTTTTTTTTAACGTTTT', {
      enzymes: { FlipI },
      names: ['FlipI'],
    });
    render(
      <RestrictionTrack
        sites={[{ enzyme: 'FlipI', position: occurrence.topCut, occurrence }]}
        lineStart={0}
        lineLen={20}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('sequence-view-re-site'));
    expect(screen.getByTestId('sequence-view-re-tooltip-top').textContent).toBe('TAACGT');
    expect(screen.getByTestId('sequence-view-re-tooltip-bottom').textContent).toBe('ATTGCA');
    expect(screen.getByTestId('sequence-view-re-tooltip-cut')
      .getAttribute('data-kind')).toBe('5overhang');
    const topBar = screen.getByTestId('sequence-view-re-tooltip-cut-top');
    const bottomBar = screen.getByTestId('sequence-view-re-tooltip-cut-bottom');
    expect(Number(topBar.getAttribute('x1'))).toBeLessThan(Number(bottomBar.getAttribute('x1')));
  });

  it('Hover EcoRI → tooltip shows name, count=1, recogn pattern, no warning (non-degenerate)', () => {
    const sites = [{ enzyme: 'EcoRI', position: 50 }];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    // No tooltip before hover.
    expect(screen.queryByTestId('sequence-view-re-tooltip')).toBeNull();
    const sg = screen.getAllByTestId('sequence-view-re-site')[0];
    fireEvent.mouseEnter(sg);
    const tip = screen.getByTestId('sequence-view-re-tooltip');
    expect(tip.getAttribute('data-enzyme')).toBe('EcoRI');
    // Position 50 → 1-indexed 51.
    expect(screen.getByTestId('sequence-view-re-tooltip-name').textContent).toMatch(/EcoRI \(51\)/);
    expect(screen.getByTestId('sequence-view-re-tooltip-count').textContent).toBe('1 site');
    // Recognition pattern (top) = GAATTC, bottom complement = CTTAAG.
    expect(screen.getByTestId('sequence-view-re-tooltip-top').textContent).toBe('GAATTC');
    expect(screen.getByTestId('sequence-view-re-tooltip-bottom').textContent).toBe('CTTAAG');
    // EcoRI is non-degenerate → no compatibility warning.
    expect(screen.queryByTestId('sequence-view-re-tooltip-warning')).toBeNull();
    // Cut: EcoRI is 5' overhang (cutFwd=1 < cutRev=5). Two separate
    // vertical bars (one per strand) + overhang highlight.
    const cut = screen.getByTestId('sequence-view-re-tooltip-cut');
    expect(cut.getAttribute('data-kind')).toBe('5overhang');
    const topBar = screen.getByTestId('sequence-view-re-tooltip-cut-top');
    const botBar = screen.getByTestId('sequence-view-re-tooltip-cut-bottom');
    // 5' overhang → top cut is LEFT of bottom cut.
    expect(Number(topBar.getAttribute('x1'))).toBeLessThan(Number(botBar.getAttribute('x1')));
    // Overhang highlight rendered between the two bars.
    expect(screen.getByTestId('sequence-view-re-tooltip-overhang')).toBeTruthy();
  });

  it('PstI (3-prime overhang, cutFwd > cutRev) → cut kind 3overhang, top bar right of bottom bar', () => {
    const sites = [{ enzyme: 'PstI', position: 80 }];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    fireEvent.mouseEnter(screen.getAllByTestId('sequence-view-re-site')[0]);
    const cut = screen.getByTestId('sequence-view-re-tooltip-cut');
    expect(cut.getAttribute('data-kind')).toBe('3overhang');
    const topBar = screen.getByTestId('sequence-view-re-tooltip-cut-top');
    const botBar = screen.getByTestId('sequence-view-re-tooltip-cut-bottom');
    // 3' overhang → top cut is RIGHT of bottom cut.
    expect(Number(topBar.getAttribute('x1'))).toBeGreaterThan(Number(botBar.getAttribute('x1')));
    // Sticky → overhang highlight present.
    expect(screen.getByTestId('sequence-view-re-tooltip-overhang')).toBeTruthy();
  });

  it('EcoRV (blunt) → cut kind blunt, bars aligned at same X, no overhang highlight', () => {
    const sites = [{ enzyme: 'EcoRV', position: 40 }];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    fireEvent.mouseEnter(screen.getAllByTestId('sequence-view-re-site')[0]);
    const cut = screen.getByTestId('sequence-view-re-tooltip-cut');
    expect(cut.getAttribute('data-kind')).toBe('blunt');
    const topBar = screen.getByTestId('sequence-view-re-tooltip-cut-top');
    const botBar = screen.getByTestId('sequence-view-re-tooltip-cut-bottom');
    // Blunt → both bars at exactly the same X.
    expect(topBar.getAttribute('x1')).toBe(botBar.getAttribute('x1'));
    // No overhang highlight for blunt.
    expect(screen.queryByTestId('sequence-view-re-tooltip-overhang')).toBeNull();
  });

  it('Tooltip is portal-rendered to document.body (escapes parent overflow:hidden)', () => {
    const sites = [{ enzyme: 'EcoRI', position: 50 }];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    fireEvent.mouseEnter(screen.getAllByTestId('sequence-view-re-site')[0]);
    const tip = screen.getByTestId('sequence-view-re-tooltip');
    // Portal mounts tooltip directly into document.body, not inside the SVG.
    expect(tip.closest('svg')).toBeNull();
    expect(tip.parentElement).toBe(document.body);
    // Fixed positioning + transform pulls tooltip ABOVE its anchor.
    expect(tip.style.position).toBe('fixed');
    expect(tip.style.transform).toMatch(/translate\(-50%/);
  });

  it('Hover PpuMI (degenerate RGGWCCY) → warning rendered', () => {
    const sites = [{ enzyme: 'PpuMI', position: 100 }];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={300}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    fireEvent.mouseEnter(screen.getAllByTestId('sequence-view-re-site')[0]);
    expect(screen.getByTestId('sequence-view-re-tooltip-top').textContent).toBe('RGGWCCY');
    expect(screen.getByTestId('sequence-view-re-tooltip-bottom').textContent).toBe('YCCWGGR');
    const warn = screen.getByTestId('sequence-view-re-tooltip-warning');
    expect(warn.textContent).toMatch(/Sticky ends from different PpuMI/);
  });

  it('Hover EcoRV (blunt, non-degenerate) → no warning even though degenerate-check would skip', () => {
    const sites = [{ enzyme: 'EcoRV', position: 10 }];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={100}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    fireEvent.mouseEnter(screen.getAllByTestId('sequence-view-re-site')[0]);
    expect(screen.queryByTestId('sequence-view-re-tooltip-warning')).toBeNull();
  });

  it('Multi-site count — 3 BamHI sites → "3 sites"', () => {
    const sites = [
      { enzyme: 'BamHI', position: 30 },
      { enzyme: 'BamHI', position: 120 },
      { enzyme: 'BamHI', position: 280 },
    ];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={400}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    fireEvent.mouseEnter(screen.getAllByTestId('sequence-view-re-site')[0]);
    expect(screen.getByTestId('sequence-view-re-tooltip-count').textContent).toBe('3 sites');
  });

  it('mouseLeave hides tooltip', () => {
    const sites = [{ enzyme: 'EcoRI', position: 50 }];
    render(
      <RestrictionTrack
        sites={sites}
        lineStart={0}
        lineLen={200}
        charPx={8}
        labelChars={6}
        reOrientation="horizontal"
      />,
    );
    const sg = screen.getAllByTestId('sequence-view-re-site')[0];
    fireEvent.mouseEnter(sg);
    expect(screen.getByTestId('sequence-view-re-tooltip')).toBeTruthy();
    fireEvent.mouseLeave(sg);
    expect(screen.queryByTestId('sequence-view-re-tooltip')).toBeNull();
  });
});

describe('RestrictionSitePopover — sticky/blunt visualization', () => {
  it('renders reverse/custom geometry from the occurrence without catalog state', () => {
    const FlipI = { site: 'ACGTTA', cut: [1, 4], isCustom: true };
    const [occurrence] = scanOccurrences('TTTTTTTTTTTAACGTTTT', {
      enzymes: { FlipI },
      names: ['FlipI'],
    });
    const calls = [];

    render(<RestrictionSitePopover
      site={{ enzyme: 'FlipI', position: occurrence.topCut, occurrence }}
      position={{ x: 200, y: 100 }}
      onCut={(cut) => calls.push(cut)}
      onCancel={() => {}}
    />);

    expect(screen.getByTestId('skeleton-re-popover-cuts').textContent).toContain('TAACGT');
    const visual = screen.getByTestId('skeleton-re-popover-visual');
    expect(visual.getAttribute('data-top-cut-offset')).toBe('2');
    expect(visual.getAttribute('data-bottom-cut-offset')).toBe('5');
    fireEvent.click(screen.getByTestId('skeleton-re-popover-cut'));
    expect(calls).toEqual([12]);
  });

  it('uses the canonical top cut from the real scan → flatten chain', () => {
    const sequence = `${'A'.repeat(100)}GAATTC${'T'.repeat(40)}`;
    const grouped = scanAllSites(sequence, { circular: false, minSiteLen: 6 });
    const [site] = flattenSites(grouped, { enzymes: ['EcoRI'] });
    const calls = [];

    expect(site.position).toBe(101);
    render(
      <RestrictionSitePopover
        site={site}
        position={{ x: 200, y: 200 }}
        onCut={(cut) => calls.push(cut)}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('skeleton-re-popover-cut'));
    expect(calls).toEqual([101]);
  });

  it('keeps one occurrence through scan → track → hook → popover → cut', () => {
    const sequence = `${'A'.repeat(100)}GAATTC${'T'.repeat(40)}`;
    const [site] = flattenSites(
      scanAllSites(sequence, { circular: false, minSiteLen: 6 }),
      { enzymes: ['EcoRI'] },
    );
    const cuts = [];
    const transport = [];

    expect(site.position).toBe(101);
    render(<CanonicalCutHarness
      site={site}
      onCut={(cut) => cuts.push(cut)}
      onTransport={(stage, key) => transport.push([stage, key])}
    />);
    fireEvent.click(screen.getByTestId('sequence-view-re-site'));
    expect(screen.getByTestId('skeleton-re-popover')).toBeTruthy();
    fireEvent.click(screen.getByTestId('skeleton-re-popover-cut'));

    expect(cuts).toEqual([101]);
    expect(transport).toEqual([
      ['track', site.occurrence.occurrenceKey],
      ['hook', site.occurrence.occurrenceKey],
      ['popover', site.occurrence.occurrenceKey],
    ]);
  });

  it('EcoRI (5\' overhang AATT) → kind 5overhang + 4 nt overhang', () => {
    const site = { enzyme: 'EcoRI', position: 100 };
    render(<RestrictionSitePopover site={site} position={{ x: 200, y: 200 }} onCut={() => {}} onCancel={() => {}} />);
    const pop = screen.getByTestId('skeleton-re-popover');
    expect(pop.getAttribute('data-kind')).toBe('5overhang');
    expect(screen.getByTestId('skeleton-re-popover-kind').textContent).toMatch(/5'-липкие/);
    expect(screen.getByTestId('skeleton-re-popover-kind').textContent).toMatch(/4 nt/);
    // Visual contains overhang text on staircase.
    const vis = screen.getByTestId('skeleton-re-popover-visual').textContent;
    expect(vis).toMatch(/AATT/);
  });

  it('PstI (3\' overhang TGCA) → kind 3overhang', () => {
    const site = { enzyme: 'PstI', position: 50 };
    render(<RestrictionSitePopover site={site} position={{ x: 200, y: 200 }} onCut={() => {}} onCancel={() => {}} />);
    const pop = screen.getByTestId('skeleton-re-popover');
    expect(pop.getAttribute('data-kind')).toBe('3overhang');
    expect(screen.getByTestId('skeleton-re-popover-kind').textContent).toMatch(/3'-липкие/);
  });

  it('EcoRV (blunt) → kind blunt', () => {
    const site = { enzyme: 'EcoRV', position: 30 };
    render(<RestrictionSitePopover site={site} position={{ x: 200, y: 200 }} onCut={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('skeleton-re-popover').getAttribute('data-kind')).toBe('blunt');
    expect(screen.getByTestId('skeleton-re-popover-kind').textContent).toMatch(/[Тт]упые/);
  });

  it('Cut button → onCut(site.position + cut[0]) absolute', () => {
    const calls = [];
    // EcoRI cut [1, 5] at site.position=100 → top-strand cut abs = 101.
    const site = { enzyme: 'EcoRI', position: 100 };
    render(
      <RestrictionSitePopover
        site={site}
        position={{ x: 200, y: 200 }}
        onCut={(p) => calls.push(p)}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('skeleton-re-popover-cut'));
    expect(calls).toEqual([101]);
  });

  it('ESC closes popover (onCancel)', () => {
    const cancels = [];
    const site = { enzyme: 'EcoRI', position: 100 };
    render(
      <RestrictionSitePopover
        site={site}
        position={{ x: 200, y: 200 }}
        onCut={() => {}}
        onCancel={() => cancels.push('cancel')}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(cancels).toEqual(['cancel']);
  });

  it('× button closes popover', () => {
    const cancels = [];
    const site = { enzyme: 'EcoRI', position: 100 };
    render(
      <RestrictionSitePopover
        site={site}
        position={{ x: 200, y: 200 }}
        onCut={() => {}}
        onCancel={() => cancels.push('cancel')}
      />,
    );
    fireEvent.click(screen.getByTestId('skeleton-re-popover-close'));
    expect(cancels).toEqual(['cancel']);
  });

  it('Unknown enzyme — returns null (no crash)', () => {
    const { container } = render(
      <RestrictionSitePopover
        site={{ enzyme: 'FakeEnz', position: 0 }}
        position={{ x: 0, y: 0 }}
        onCut={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.querySelector('[data-testid="skeleton-re-popover"]')).toBeNull();
  });
});
