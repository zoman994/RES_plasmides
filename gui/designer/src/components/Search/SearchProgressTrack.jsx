/**
 * SearchProgressTrack — «this is still running», and nothing more.
 *
 * WHY IT EXISTS. A 1 Mb approximate sweep is a few hundred milliseconds during which the panel says
 * «checking» and then does not move. Static text is indistinguishable from a frozen surface, and a
 * biologist who cannot tell the difference retypes or clicks again — spending another sweep to answer
 * a question the UI should have answered for free. A moving stripe answers it.
 *
 * WHY IT IS NOT A PROGRESS BAR. The engine genuinely does not know how far along it is: the corpus is
 * walked document by document, an exact hit can end a document early, and the two-pass route means
 * the remaining work depends on an answer that has not arrived yet. Any percentage would be invented,
 * and an invented percentage is worse than none — it converts «I don't know» into a promise. So there
 * is no `value`, no `aria-valuenow`, no `role="progressbar"` and no estimate.
 *
 * ACCESSIBILITY. The stripe is `aria-hidden`. The surfaces that mount it already announce the state
 * in a `role="status"` line and set `aria-busy` on the combobox; a second announcement would make a
 * screen reader read the same fact twice, and a decorative bar has nothing of its own to say.
 *
 * MOTION. The animation is a CSS class (`.search-progress-track-fill`, keyframes in `index.css`),
 * never a React timer: a timer would re-render this component for the whole search, spending main
 * thread to report that the worker is busy. Under `prefers-reduced-motion` the same class resolves to
 * a static filled bar — still a visible «working», with nothing moving.
 *
 * Presentational: no props, no store, no worker protocol. Both search surfaces render the same file.
 */
export default function SearchProgressTrack() {
  return (
    <div
      data-testid="search-progress-track"
      aria-hidden="true"
      style={{
        position: 'relative',
        height: 2,
        overflow: 'hidden',
        background: 'var(--surface-3)',
        borderRadius: 1,
      }}
    >
      {/* WIDTH LIVES IN THE STYLESHEET, not here. An inline width would beat the class rule, and the
          reduced-motion branch — which widens the segment to fill the track — would silently do
          nothing: the stripe would stop moving but stay a 38 % stub, which reads as a stalled bar
          rather than as a steady «working». Measured in a real browser before it was moved. */}
      <div
        className="search-progress-track-fill"
        style={{ height: '100%', background: 'var(--accent-500)', borderRadius: 1 }}
      />
    </div>
  );
}
