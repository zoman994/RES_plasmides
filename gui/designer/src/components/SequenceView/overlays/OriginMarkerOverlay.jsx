/**
 * OriginMarkerOverlay — Sprint M-X.3 K3.
 *
 * Renders a horizontal dashed line + «origin / 1» label on the
 * boundary between a wrap-tail strip and the main band of a
 * circular plasmid SequenceView. Two markers when wrap-tail is
 * enabled (above main:first-child and below main:last-child); a
 * single marker (above main:first-child) when wrap-tail is
 * disabled but topology is still circular.
 *
 * Probe pattern matches CaretOverlay (DOM read in useLayoutEffect,
 * absolute-positioned div over the scroll container, transform
 * translate3d for GPU compositing). Two boxes, since their
 * positions can shift independently when the user resizes the
 * window or toggles bottom-strand visibility.
 *
 * Pointer-events: none — markers never block click/drag in the
 * main band.
 */

import { useLayoutEffect, useState } from 'react';

export default function OriginMarkerOverlay({ containerRef, circular, hasTrailingWrap = false }) {
  // Marker existence is decided entirely from props (synchronous):
  //   - circular === false → no markers
  //   - circular === true → always a top marker (origin always
  //     marked at start of plasmid)
  //   - circular === true AND hasTrailingWrap → also a bottom marker
  //     (delimits trailing wrap-tail strip)
  // Only the box COORDINATES come from the DOM via useLayoutEffect.
  // This keeps the test-time render correct without depending on
  // happy-dom's layout side-effect timing.
  const [coords, setCoords] = useState({ top: null, bottom: null });

  useLayoutEffect(() => {
    if (!circular) {
      setCoords((prev) =>
        prev.top === null && prev.bottom === null
          ? prev
          : { top: null, bottom: null });
      return undefined;
    }
    const root = containerRef.current;
    if (!root) return undefined;

    const compute = () => {
      const mainLines = root.querySelectorAll('[data-testid="sequence-view-line"][data-wraptail-kind="main"]');
      if (mainLines.length === 0) return;
      const firstMain = mainLines[0];
      const next = {
        top: {
          top: firstMain.offsetTop || 0,
          left: firstMain.offsetLeft || 0,
          width: firstMain.offsetWidth || 0,
        },
        bottom: null,
      };
      if (hasTrailingWrap) {
        const trailing = root.querySelector('[data-testid="sequence-view-line"][data-wraptail-kind="trailing-wrap"]');
        if (trailing) {
          next.bottom = {
            top: trailing.offsetTop || 0,
            left: trailing.offsetLeft || 0,
            width: trailing.offsetWidth || 0,
          };
        }
      }
      setCoords(next);
    };
    compute();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(compute);
    ro.observe(root);
    return () => ro.disconnect();
  }, [circular, hasTrailingWrap, containerRef]);

  if (!circular) return null;

  // Top marker always renders for circular topology. Use measured
  // coords if present, else fall back to {0,0,0} so it's still in
  // the DOM for test queries (positioned correctly after layout).
  const topCoords = coords.top || { top: 0, left: 0, width: 0 };

  return (
    <>
      <Marker
        testId="sequence-view-origin-marker-top"
        top={topCoords.top}
        left={topCoords.left}
        width={topCoords.width}
      />
      {hasTrailingWrap && (
        <Marker
          testId="sequence-view-origin-marker-bottom"
          top={coords.bottom?.top || 0}
          left={coords.bottom?.left || 0}
          width={coords.bottom?.width || 0}
        />
      )}
    </>
  );
}

function Marker({ testId, top, left, width }) {
  return (
    <div
      data-testid={testId}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${left}px, ${top}px, 0)`,
        width,
        height: 0,
        pointerEvents: 'none',
        // Dashed accent line: matches the dashed border-bottom on
        // line dividers but in accent colour and a hair thicker so
        // it reads as «boundary marker», not just another line gap.
        borderTop: '1px dashed var(--accent-500, #f97316)',
        zIndex: 4, // below CaretOverlay (5), above SelectionOverlay (3)
      }}
    >
      <span
        style={{
          position: 'absolute',
          right: 4,
          top: -8,
          fontSize: 9,
          color: 'var(--accent-500, #f97316)',
          background: 'var(--surface-1, #fff)',
          padding: '0 4px',
          fontFamily: 'var(--font-mono, monospace)',
          letterSpacing: '0.02em',
          pointerEvents: 'none',
        }}
      >origin / 1</span>
    </div>
  );
}
