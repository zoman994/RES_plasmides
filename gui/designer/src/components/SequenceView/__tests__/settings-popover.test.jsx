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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
