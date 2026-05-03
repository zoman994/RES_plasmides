/**
 * sequence-tab-rewire.test.jsx — K8 integration coverage.
 *
 * Asserts that the M-B.3 K8 rewire mounts the new SequenceView (not the
 * old SequenceMapView), exposes a ⚙ Settings trigger in the header, and
 * renders the SettingsPopover on click.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SequenceTab from "../tabs/SequenceTab";

// We don't need the real popover internals; just verify that clicking
// the ⚙ trigger toggles the dialog mount.
vi.mock("../../../SequenceView", () => ({
  default: () => <div data-testid="mock-sequence-view" />,
}));
vi.mock("../../../SequenceView/SettingsPopover", () => ({
  default: ({ open }) =>
    open ? <div data-testid="mock-settings-popover" /> : null,
  SEQUENCE_VIEW_DEFAULTS: {},
}));

afterEach(cleanup);

const SEQUENCE = "ATGC".repeat(80);

describe("SequenceTab — K8 SequenceView rewire", () => {
  it("mounts the new SequenceView (not SequenceMapView)", () => {
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={[]}
        topology="circular"
        name="rewire-test"
        fileKey="rewire.gb"
        onUpdateEdits={() => {}}
      />,
    );
    expect(screen.getByTestId("mock-sequence-view")).toBeTruthy();
  });

  it("⚙ Settings trigger toggles SettingsPopover mount", () => {
    render(
      <SequenceTab
        sequence={SEQUENCE}
        annotations={[]}
        topology="circular"
        name="rewire-test"
        fileKey="rewire.gb"
        onUpdateEdits={() => {}}
      />,
    );
    const trigger = screen.getByTestId("importer-sequence-view-settings-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("mock-settings-popover")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("mock-settings-popover")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByTestId("mock-settings-popover")).toBeNull();
  });
});
