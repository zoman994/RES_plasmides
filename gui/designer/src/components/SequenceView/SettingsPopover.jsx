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

import { useEffect, useRef } from "react";
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
 */
export default function SettingsPopover({ open, onClose, anchor }) {
  const settings = useStore(selectSequenceViewSettings);
  const setSetting = useStore((s) => s.setSequenceViewSetting);
  const setFrame = useStore((s) => s.setVisibleFrame);
  const reset = useStore((s) => s.resetSequenceViewSettings);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const onMouseDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isAuto = settings.framesMode === "auto";
  const showFrameCheckboxes = settings.framesMode !== "single";
  const visibleFrames = settings.visibleFrames || {};
  const style = {
    position: "absolute",
    top: anchor?.y ?? 32,
    left: anchor?.x ?? 0,
    // Bumped 50 → 200 so the popover sits ABOVE the importer footer
    // (ActionsBar / SessionSummary) — биолог 03.05.2026 evening:
    // «нижняя часть выпадающего окна с настройками недоступна и
    // скрывается под панелью».
    zIndex: 200,
    minWidth: 280,
    maxWidth: 340,
    // Cap height to viewport with internal scroll, so taller-than-screen
    // popover content doesn't extend below the visible area. `42px`
    // budget covers the topbar + sticky tab header above the popover
    // anchor; `100px` covers the importer footer below.
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

  return (
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

      {/* 6. Reset */}
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
}

export { SEQUENCE_VIEW_DEFAULTS };
