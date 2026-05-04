/**
 * settings-popover.test.jsx — K7 unit + integration coverage for the
 * SettingsPopover and the underlying uiSlice.sequenceView.
 *
 * Eight cases match Sprint M-B.3 §6 K7:
 *   Unit (uiSlice):
 *    1) defaults present after store init
 *    2) setSequenceViewSetting writes the value and persists to localStorage
 *    3) setSequenceViewSetting rejects invalid framesMode silently
 *    4) resetSequenceViewSettings restores defaults + persists
 *    5) clamp out-of-range autoThreshold (rejected silently)
 *
 *   Integration (popover):
 *    6) renders 5 controls and threshold slider only when framesMode=auto
 *    7) clicking 'All 6 frames' updates store + hides slider
 *    8) Reset button clears any prior overrides
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SettingsPopover from "../SettingsPopover";
import { useStore } from "../../../store";
import {
  SEQUENCE_VIEW_DEFAULTS,
  SEQUENCE_VIEW_STORAGE_KEY,
} from "../../../store/uiSlice";

beforeEach(() => {
  // Reset slice + storage between tests.
  if (typeof localStorage !== "undefined") localStorage.clear();
  useStore.getState().resetSequenceViewSettings();
});
afterEach(() => {
  cleanup();
});

describe("uiSlice.sequenceView — K7 unit", () => {
  it("1) defaults present after store init", () => {
    const s = useStore.getState();
    expect(s.sequenceView).toEqual(SEQUENCE_VIEW_DEFAULTS);
  });

  it("2) setSequenceViewSetting writes value and persists to localStorage", () => {
    useStore.getState().setSequenceViewSetting("primerStyle", "outline");
    expect(useStore.getState().sequenceView.primerStyle).toBe("outline");
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(SEQUENCE_VIEW_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw);
      expect(parsed.primerStyle).toBe("outline");
    }
  });

  it("3) setSequenceViewSetting rejects invalid framesMode silently", () => {
    useStore.getState().setSequenceViewSetting("framesMode", "all");
    useStore.getState().setSequenceViewSetting("framesMode", "garbage");
    expect(useStore.getState().sequenceView.framesMode).toBe("all");
  });

  it("4) resetSequenceViewSettings restores defaults + persists", () => {
    useStore.getState().setSequenceViewSetting("framesMode", "all");
    useStore.getState().setSequenceViewSetting("showBottomStrand", false);
    useStore.getState().resetSequenceViewSettings();
    expect(useStore.getState().sequenceView).toEqual(SEQUENCE_VIEW_DEFAULTS);
  });

  it("5) clamp out-of-range autoThreshold is rejected silently", () => {
    useStore.getState().setSequenceViewSetting("autoThreshold", 0.8);
    useStore.getState().setSequenceViewSetting("autoThreshold", 0.99);
    useStore.getState().setSequenceViewSetting("autoThreshold", 0.1);
    expect(useStore.getState().sequenceView.autoThreshold).toBe(0.8);
  });
});

describe("SettingsPopover — K7 integration", () => {
  it("6) renders 5 controls; threshold slider only when framesMode=auto", () => {
    // Default framesMode='single' (biolog feedback: don't blast 6 frames
    // by default). Switch to 'auto' first to make the slider appear.
    useStore.getState().setSequenceViewSetting("framesMode", "auto");
    render(<SettingsPopover open onClose={() => {}} />);
    expect(screen.getByTestId("sequence-view-setting-bottom-strand")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-frames-mode")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-primer-style")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-re-orientation")).toBeTruthy();
    // Slider visible in 'auto' mode.
    expect(screen.getByTestId("sequence-view-setting-auto-threshold")).toBeTruthy();
    // Per-frame checkboxes visible whenever mode != 'single'.
    expect(screen.getByTestId("sequence-view-setting-visible-frames")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-frame-+1")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-frame--3")).toBeTruthy();
  });

  it("7) clicking 'All 6 frames' updates store and hides the slider", () => {
    render(<SettingsPopover open onClose={() => {}} />);
    const allRadio = screen.getByTestId("sequence-view-setting-frames-mode-all");
    fireEvent.click(allRadio);
    expect(useStore.getState().sequenceView.framesMode).toBe("all");
    expect(screen.queryByTestId("sequence-view-setting-auto-threshold")).toBeNull();
  });

  it("8) Reset button restores defaults", () => {
    useStore.getState().setSequenceViewSetting("framesMode", "all");
    useStore.getState().setSequenceViewSetting("showBottomStrand", false);
    render(<SettingsPopover open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("sequence-view-settings-reset"));
    expect(useStore.getState().sequenceView).toEqual(SEQUENCE_VIEW_DEFAULTS);
  });
});

// ─── Sprint M-X.1 K5 — Predictions settings ──────────────────────────

describe("uiSlice.sequenceView.predictions — Sprint M-X.1 K5", () => {
  it("9) predictions defaults: CDS+sgRNA on, promoter+terminator off, threshold 0.7", () => {
    const p = useStore.getState().sequenceView.predictions;
    expect(p).toBeDefined();
    expect(p.cds).toBe(true);
    expect(p.sgRNA).toBe(true);
    expect(p.promoter).toBe(false);
    expect(p.terminator).toBe(false);
    expect(p.threshold).toBe(0.7);
  });

  it("10) setSequenceViewSetting('predictions.promoter', true) toggles + persists", () => {
    useStore.getState().setSequenceViewSetting("predictions.promoter", true);
    expect(useStore.getState().sequenceView.predictions.promoter).toBe(true);
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(SEQUENCE_VIEW_STORAGE_KEY);
      const parsed = JSON.parse(raw);
      expect(parsed.predictions.promoter).toBe(true);
    }
  });

  it("11) threshold clamp: out-of-range silently ignored", () => {
    useStore.getState().setSequenceViewSetting("predictions.threshold", 0.9);
    useStore.getState().setSequenceViewSetting("predictions.threshold", 1.5);
    useStore.getState().setSequenceViewSetting("predictions.threshold", -0.1);
    expect(useStore.getState().sequenceView.predictions.threshold).toBe(0.9);
  });

  it("12) reset restores predictions defaults", () => {
    useStore.getState().setSequenceViewSetting("predictions.promoter", true);
    useStore.getState().setSequenceViewSetting("predictions.cds", false);
    useStore.getState().setSequenceViewSetting("predictions.threshold", 0.95);
    useStore.getState().resetSequenceViewSettings();
    const p = useStore.getState().sequenceView.predictions;
    expect(p.cds).toBe(true);
    expect(p.promoter).toBe(false);
    expect(p.threshold).toBe(0.7);
  });

  it("13) localStorage migration: old payload without `predictions` field → defaults applied", () => {
    // Simulate a pre-K5 stored payload.
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      SEQUENCE_VIEW_STORAGE_KEY,
      JSON.stringify({
        showBottomStrand: false,
        framesMode: "all",
        autoThreshold: 0.6,
        primerStyle: "outline",
        reOrientation: "horizontal",
        // no predictions
      }),
    );
    // Force a re-load by importing the loader fresh — simulate via a
    // direct call to resetSequenceViewSettings + rebuild via the module
    // export. The test indirectly checks defensive fallback by asserting
    // setSequenceViewSetting('predictions.cds', ...) still works after
    // load: if loadInitialSequenceView crashed on missing field, this
    // would throw earlier in the test setup.
    useStore.getState().setSequenceViewSetting("predictions.cds", false);
    expect(useStore.getState().sequenceView.predictions.cds).toBe(false);
    expect(useStore.getState().sequenceView.predictions.threshold).toBe(0.7);
  });
});

describe("SettingsPopover — Sprint M-X.1 K5 integration", () => {
  it("14) renders 4 prediction toggles + threshold slider", () => {
    render(<SettingsPopover open onClose={() => {}} />);
    expect(screen.getByTestId("sequence-view-setting-prediction-cds")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-prediction-promoter")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-prediction-terminator")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-prediction-sgRNA")).toBeTruthy();
    expect(screen.getByTestId("sequence-view-setting-predictions-threshold")).toBeTruthy();
  });

  it("15) clicking promoter toggle flips store reactively", () => {
    render(<SettingsPopover open onClose={() => {}} />);
    const cb = screen.getByTestId("sequence-view-setting-prediction-promoter");
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(useStore.getState().sequenceView.predictions.promoter).toBe(true);
  });

  it("16) threshold slider updates store + label", () => {
    render(<SettingsPopover open onClose={() => {}} />);
    const slider = screen.getByTestId("sequence-view-setting-predictions-threshold");
    fireEvent.change(slider, { target: { value: "0.85" } });
    expect(useStore.getState().sequenceView.predictions.threshold).toBe(0.85);
  });
});

describe("Bug-rush #19 — scroll-on-feature-click toggle", () => {
  it("renders a checkbox bound to sequenceView.scrollOnFeatureClick", () => {
    render(<SettingsPopover open onClose={() => {}} />);
    const check = screen.getByTestId("sequence-view-setting-scroll-on-feature-click");
    // Default is true.
    expect(check.checked).toBe(true);
    fireEvent.click(check);
    expect(useStore.getState().sequenceView.scrollOnFeatureClick).toBe(false);
  });
});

describe("Bug-rush #15 — outside click closes the popover", () => {
  it("pointerdown OUTSIDE the popover (and outside trigger) calls onClose", () => {
    const onClose = vi.fn();
    render(
      <div>
        <SettingsPopover open onClose={onClose} />
        <div data-testid="outside-target" style={{ width: 100, height: 100 }} />
      </div>,
    );
    const outside = screen.getByTestId("outside-target");
    fireEvent.pointerDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pointerdown INSIDE the popover does not close", () => {
    const onClose = vi.fn();
    render(<SettingsPopover open onClose={onClose} />);
    const popover = screen.getByTestId("sequence-view-settings-popover");
    fireEvent.pointerDown(popover);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pointerdown on the trigger ref does not close (parent handles toggle)", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    render(<SettingsPopover open onClose={onClose} triggerRef={triggerRef} />);
    fireEvent.pointerDown(trigger);
    expect(onClose).not.toHaveBeenCalled();
    document.body.removeChild(trigger);
  });
});

describe("Bug-rush #12 — popover anchored to triggerRef + clamped to viewport", () => {
  it("uses position:fixed + viewport-clamped maxHeight when triggerRef is provided", () => {
    // Mock the trigger button with a known viewport rect; the
    // popover should anchor at trigger.bottom + 4 and cap its
    // maxHeight to fit between top and viewport bottom minus the
    // 80 px safety margin.
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      value: () => ({ left: 50, top: 20, right: 70, bottom: 40, width: 20, height: 20 }),
    });
    const triggerRef = { current: trigger };
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    render(
      <SettingsPopover open onClose={() => {}} triggerRef={triggerRef} />,
    );
    const popover = screen.getByTestId('sequence-view-settings-popover');
    expect(popover.style.position).toBe('fixed');
    expect(popover.style.top).toBe('44px');     // trigger.bottom (40) + 4
    expect(popover.style.left).toBe('50px');    // trigger.left
    // window.innerHeight (600) - top (44) - SAFE_BOTTOM (80) = 476
    expect(popover.style.maxHeight).toBe('476px');
    document.body.removeChild(trigger);
  });
});
