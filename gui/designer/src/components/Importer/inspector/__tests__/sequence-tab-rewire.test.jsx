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

  // Bug-rush #22 (04.05.2026 evening): the ⚙ Settings trigger and
  // SettingsPopover moved out of SequenceTab into SingleInspector's
  // title row («panel below tabs is unwieldy, move it next to the
  // name»). SequenceTab no longer mounts either — this test is
  // covered at the SettingsPopover level instead (see
  // settings-popover.test.jsx Bug-rush #12 / #15 / #19).
});
