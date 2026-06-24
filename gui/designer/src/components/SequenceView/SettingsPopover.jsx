/**
 * SettingsPopover — ⚙ icon trigger + 5-control popover for the
 * SequenceView (Sprint M-B.3, K7 / DEC-SQV-06 candidate).
 *
 * Controls (5 + threshold conditional + Reset):
 *   1. Bottom strand visibility — checkbox
 *   2. AA frames mode — radio: Auto / Single relevant only / All 6 frames
 *   3. Auto threshold slider — visible ONLY when framesMode === 'auto',
 *      range 0.5..0.95 step 0.05
 *   4. Primer style — radio: Filled / Outline-only
 *   5. RE labels orientation — radio: Vertical / Horizontal
 *   6. Reset to defaults button
 *
 * State + persistence: settings come from `uiSlice.sequenceView`. Updates
 * call `setSequenceViewSetting(key, value)` which mutates the slice and
 * writes to localStorage under `bodgegene-ui-sequenceview`.
 *
 * Accessibility:
 *   - Closes on Escape, mousedown outside, blur of focus trap.
 *   - Trigger button is `aria-haspopup="dialog"`.
 *   - All controls have explicit <label>.
 *
 * Why a controlled popover (mounted by SequenceTab) and not a global
 * modal? Settings are CONTEXT-LOCAL — they're meant to be tweaked while
 * the biolog stares at the sequence. A floating panel anchored to the
 * ⚙ button beats a Settings modal that hides the very view it
 * configures.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store";
import {
  selectSequenceViewSettings,
  SEQUENCE_VIEW_DEFAULTS,
  FRAME_KEYS,
} from "../../store/uiSlice";
import { STRINGS } from "../../lib/strings";

const S = STRINGS.importer.sequenceView;

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ x: number, y: number }} [props.anchor] — viewport coords for
 *   the top-left corner of the popover (relative to a positioned ancestor).
 * @param {{ current: HTMLElement | null }} [props.triggerRef] — optional
 *   ref to the ⚙ button so the popover can re-anchor in viewport space
 *   and clamp its max height to fit between trigger.bottom and the
 *   viewport bottom (bug-rush #12 — biolog «окно с настройками теряется
 *   за меню пуск»).
 */
export default function SettingsPopover({ open, onClose, anchor, triggerRef }) {
  const settings = useStore(selectSequenceViewSettings);
  const setSetting = useStore((s) => s.setSequenceViewSetting);
  const setFrame = useStore((s) => s.setVisibleFrame);
  const reset = useStore((s) => s.resetSequenceViewSettings);
  const popoverRef = useRef(null);
  const [viewportFit, setViewportFit] = useState(null); // { left, top, maxHeight } | null

  // Bug-rush #12: when triggerRef is provided we render `position:
  // fixed` based on the trigger's viewport rect and clamp maxHeight
  // so the bottom of the popover never falls under the OS taskbar
  // / browser bottom chrome. Recompute on open + window resize.
  useLayoutEffect(() => {
    if (!open) return undefined;
    if (!triggerRef || !triggerRef.current) {
      setViewportFit(null);
      return undefined;
    }
    const recompute = () => {
      const el = triggerRef.current;
      if (!el) return;
      let r;
      try { r = el.getBoundingClientRect(); } catch { return; }
      const SAFE_BOTTOM = 80; // taskbar + breathing room
      const top = r.bottom + 4;
      const maxH = Math.max(180, (window.innerHeight || 800) - top - SAFE_BOTTOM);
      setViewportFit({
        left: r.left,
        top,
        maxHeight: maxH,
      });
    };
    recompute();
    window.addEventListener('resize', recompute);
    // PERF — listener used to be `(scroll, recompute, true)`, which
    // forces the browser to wait for our handler before emitting the
    // scroll. On long sequences that's a perceptible jitter. Passive
    // capture lets the browser scroll first and call us afterwards.
    const scrollOpts = { capture: true, passive: true };
    window.addEventListener('scroll', recompute, scrollOpts);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, scrollOpts);
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    // Bug-rush #15 (04.05.2026 evening): «окно настройки должно
    // закрываться при клике вне окна». Pre-fix this listener was
    // `mousedown` which gets suppressed when SequenceView's own
    // pointerdown calls e.preventDefault() — the synthetic
    // mousedown never fires, so clicks inside the sequence area
    // never closed the popover. Switch to `pointerdown` (capture
    // phase) so the listener wins regardless. Also exclude the
    // trigger button explicitly: tapping the ⚙ should round-trip
    // through the parent's toggle, not «outside-click close →
    // toggle reopen».
    const onOutsidePointer = (e) => {
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      if (triggerRef && triggerRef.current && triggerRef.current.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutsidePointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutsidePointer, true);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const isAuto = settings.framesMode === "auto";
  const showFrameCheckboxes = settings.framesMode !== "single";
  const visibleFrames = settings.visibleFrames || {};
  const style = viewportFit
    ? {
      // Bug-rush #12: triggerRef-driven viewport-fixed placement so
      // the popover top tracks the ⚙ button's screen position and
      // the maxHeight stays inside the visible viewport regardless
      // of OS chrome (Windows taskbar, browser footer).
      position: "fixed",
      top: viewportFit.top,
      left: viewportFit.left,
      zIndex: 200,
      minWidth: 280,
      maxWidth: 340,
      maxHeight: viewportFit.maxHeight,
      overflowY: "auto",
      background: "var(--surface-1, #ffffff)",
      border: "0.5px solid var(--border-default, #d1d5db)",
      borderRadius: "var(--radius-lg, 8px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      padding: 12,
      fontSize: 12,
      color: "var(--text-primary, #111827)",
    }
    : {
      // Legacy positioning — used by tests / fixtures that don't
      // pass a triggerRef.
      position: "absolute",
      top: anchor?.y ?? 32,
      left: anchor?.x ?? 0,
      zIndex: 200,
      minWidth: 280,
      maxWidth: 340,
      maxHeight: "calc(100vh - 142px)",
      overflowY: "auto",
      background: "var(--surface-1, #ffffff)",
      border: "0.5px solid var(--border-default, #d1d5db)",
      borderRadius: "var(--radius-lg, 8px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      padding: 12,
      fontSize: 12,
      color: "var(--text-primary, #111827)",
    };

  // Bug-rush #14 (04.05.2026 evening): biolog screenshot shows the
  // SequenceView caret line bleeding through the popover. Cause:
  // popover's z-index 200 sits inside the sticky-header parent
  // (z-index 5), which forms its own stacking context — so the
  // popover never wins against sibling z-indices in the document
  // root context. Portal to document.body escapes every parent
  // stacking context and lets `position: fixed` actually fix.
  const node = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={S.settingsTitle}
      data-testid="sequence-view-settings-popover"
      style={style}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>{S.settingsTitle}</strong>
        <button
          type="button"
          aria-label={S.closeAria}
          onClick={onClose}
          data-testid="sequence-view-settings-close"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
            color: "var(--text-tertiary, #9ca3af)",
          }}
        >
          ×
        </button>
      </header>

      {/* 1. Bottom strand */}
      <label
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          data-testid="sequence-view-setting-bottom-strand"
          checked={!!settings.showBottomStrand}
          onChange={(e) => setSetting("showBottomStrand", !!e.target.checked)}
        />
        <span>
          <span style={{ fontWeight: 500 }}>{S.showBottomStrandLabel}</span>
          <br />
          <span style={{ fontSize: 11, color: "var(--text-tertiary, #9ca3af)" }}>
            {S.showBottomStrandHint}
          </span>
        </span>
      </label>

      {/* 1.b — Bug-rush #19: scroll-on-feature-click toggle. */}
      <label
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          data-testid="sequence-view-setting-scroll-on-feature-click"
          checked={settings.scrollOnFeatureClick !== false}
          onChange={(e) => setSetting("scrollOnFeatureClick", !!e.target.checked)}
        />
        <span>
          <span style={{ fontWeight: 500 }}>{S.scrollOnFeatureClickLabel}</span>
          <br />
          <span style={{ fontSize: 11, color: "var(--text-tertiary, #9ca3af)" }}>
            {S.scrollOnFeatureClickHint}
          </span>
        </span>
      </label>

      {/* 2. AA frames mode */}
      <fieldset
        data-testid="sequence-view-setting-frames-mode"
        style={{ border: "none", padding: 0, margin: "0 0 10px 0" }}
      >
        <legend style={{ fontWeight: 500, marginBottom: 4 }}>{S.framesModeLabel}</legend>
        {[
          { value: "auto", label: S.framesModeAuto },
          { value: "single", label: S.framesModeSingle },
          { value: "all", label: S.framesModeAll },
        ].map((opt) => (
          <label
            key={opt.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="sv-frames-mode"
              value={opt.value}
              data-testid={`sequence-view-setting-frames-mode-${opt.value}`}
              checked={settings.framesMode === opt.value}
              onChange={() => setSetting("framesMode", opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      {/* 2.b — RC-B1 (Игорь 24.06): manual reading-frame override. Pins AA
          translation to a forward frame (+1/+2/+3) across the whole sequence,
          ignoring CDS auto-pick — «динамично указать рамку считывания». */}
      <fieldset
        data-testid="sequence-view-setting-override-frame"
        style={{ border: "none", padding: 0, margin: "0 0 10px 0" }}
      >
        <legend style={{ fontWeight: 500, marginBottom: 4 }}>Рамка считывания</legend>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { value: null, label: "авто", key: "auto" },
            { value: 0, label: "+1", key: "0" },
            { value: 1, label: "+2", key: "1" },
            { value: 2, label: "+3", key: "2" },
          ].map((opt) => (
            <label
              key={opt.key}
              style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: "var(--font-mono, monospace)" }}
            >
              <input
                type="radio"
                name="sv-override-frame"
                data-testid={`sequence-view-setting-override-frame-${opt.key}`}
                checked={(settings.overrideFrame ?? null) === opt.value}
                onChange={() => setSetting("overrideFrame", opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-tertiary, #9ca3af)", margin: "4px 0 0" }}>
          Зафиксировать рамку трансляции (минуя авто-выбор по CDS).
        </p>
      </fieldset>

      {/* 3. Auto threshold slider — only visible in 'auto' mode */}
      {isAuto && (
        <div
          data-testid="sequence-view-setting-auto-threshold"
          style={{ marginBottom: 10 }}
        >
          <label style={{ display: "block", fontWeight: 500, marginBottom: 2 }}>
            {S.autoThresholdLabel(settings.autoThreshold || 0.8)}
          </label>
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.05}
            value={settings.autoThreshold || 0.8}
            data-testid="sequence-view-setting-auto-threshold-slider"
            onChange={(e) => setSetting("autoThreshold", Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <p style={{ fontSize: 11, color: "var(--text-tertiary, #9ca3af)", margin: "4px 0 0" }}>
            {S.autoThresholdHint}
          </p>
        </div>
      )}

      {/* 3a. Per-frame visibility (only when mode could resolve to hybrid) */}
      {showFrameCheckboxes && (
        <fieldset
          data-testid="sequence-view-setting-visible-frames"
          style={{ border: "none", padding: 0, margin: "0 0 10px 0" }}
        >
          <legend style={{ fontWeight: 500, marginBottom: 4 }}>{S.visibleFramesLabel}</legend>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "2px 8px",
            }}
          >
            {FRAME_KEYS.map((key) => (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "1px 0",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                  fontSize: 11,
                }}
              >
                <input
                  type="checkbox"
                  data-testid={`sequence-view-setting-frame-${key}`}
                  checked={visibleFrames[key] !== false}
                  onChange={(e) => setFrame(key, !!e.target.checked)}
                />
                {key}
              </label>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-tertiary, #9ca3af)", margin: "4px 0 0" }}>
            {S.visibleFramesHint}
          </p>
        </fieldset>
      )}

      {/* 4. Primer style */}
      <fieldset
        data-testid="sequence-view-setting-primer-style"
        style={{ border: "none", padding: 0, margin: "0 0 10px 0" }}
      >
        <legend style={{ fontWeight: 500, marginBottom: 4 }}>{S.primerStyleLabel}</legend>
        {[
          { value: "filled", label: S.primerStyleFilled },
          { value: "outline", label: S.primerStyleOutline },
        ].map((opt) => (
          <label
            key={opt.value}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", cursor: "pointer" }}
          >
            <input
              type="radio"
              name="sv-primer-style"
              value={opt.value}
              data-testid={`sequence-view-setting-primer-style-${opt.value}`}
              checked={settings.primerStyle === opt.value}
              onChange={() => setSetting("primerStyle", opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      {/* 5. RE orientation */}
      <fieldset
        data-testid="sequence-view-setting-re-orientation"
        style={{ border: "none", padding: 0, margin: "0 0 10px 0" }}
      >
        <legend style={{ fontWeight: 500, marginBottom: 4 }}>{S.reOrientationLabel}</legend>
        {[
          { value: "vertical", label: S.reOrientationVertical },
          { value: "horizontal", label: S.reOrientationHorizontal },
        ].map((opt) => (
          <label
            key={opt.value}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", cursor: "pointer" }}
          >
            <input
              type="radio"
              name="sv-re-orientation"
              value={opt.value}
              data-testid={`sequence-view-setting-re-orientation-${opt.value}`}
              checked={settings.reOrientation === opt.value}
              onChange={() => setSetting("reOrientation", opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      {/* 6. Predictions (Sprint M-X.1 K5) */}
      <fieldset
        data-testid="sequence-view-setting-predictions"
        style={{ border: "none", padding: 0, margin: "0 0 10px 0" }}
      >
        <legend style={{ fontWeight: 500, marginBottom: 4 }}>{S.predictionsLabel}</legend>
        {[
          { key: "cds", label: S.predictionsCds },
          { key: "promoter", label: S.predictionsPromoter },
          { key: "terminator", label: S.predictionsTerminator },
          { key: "sgRNA", label: S.predictionsSgrna },
        ].map((opt) => (
          <label
            key={opt.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 0",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              data-testid={`sequence-view-setting-prediction-${opt.key}`}
              checked={!!(settings.predictions && settings.predictions[opt.key])}
              onChange={(e) =>
                setSetting(`predictions.${opt.key}`, !!e.target.checked)
              }
            />
            {opt.label}
          </label>
        ))}
        <div style={{ marginTop: 6 }}>
          <label style={{ display: "block", fontWeight: 500, marginBottom: 2 }}>
            {S.predictionsThresholdLabel(
              settings.predictions ? settings.predictions.threshold : 0.7,
            )}
          </label>
          <input
            type="range"
            min={0.5}
            max={1.0}
            step={0.05}
            value={settings.predictions ? settings.predictions.threshold : 0.7}
            data-testid="sequence-view-setting-predictions-threshold"
            onChange={(e) =>
              setSetting("predictions.threshold", Number(e.target.value))
            }
            style={{ width: "100%" }}
          />
          <p style={{ fontSize: 11, color: "var(--text-tertiary, #9ca3af)", margin: "4px 0 0" }}>
            {S.predictionsThresholdHint}
          </p>
        </div>
      </fieldset>

      {/* 7. Reset */}
      <button
        type="button"
        data-testid="sequence-view-settings-reset"
        onClick={() => reset()}
        style={{
          marginTop: 4,
          width: "100%",
          padding: "6px 10px",
          fontSize: 12,
          background: "var(--surface-2, #f3f4f6)",
          border: "0.5px solid var(--border-default, #d1d5db)",
          borderRadius: "var(--radius-md, 6px)",
          cursor: "pointer",
        }}
      >
        {S.resetButton}
      </button>
    </div>
  );

  // Portal to document.body (when DOM is available — happy-dom in
  // tests has document, jsdom has document, SSR doesn't).
  if (typeof document !== "undefined" && document.body) {
    return createPortal(node, document.body);
  }
  return node;
}

export { SEQUENCE_VIEW_DEFAULTS };
