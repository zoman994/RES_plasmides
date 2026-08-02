/**
 * sequence-tab-rewire.test.jsx — K8 integration coverage.
 *
 * Asserts that the M-B.3 K8 rewire mounts the new SequenceView (not the
 * old SequenceMapView), exposes a ⚙ Settings trigger in the header, and
 * renders the SettingsPopover on click.
 */
import {
  describe, it, expect, vi, afterEach, beforeEach,
} from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useStore } from "../../../../store";
import SequenceTab from "../tabs/SequenceTab";

// We don't need the real popover internals; just verify that clicking
// the ⚙ trigger toggles the dialog mount. The props ARE captured, so the
// overlay wiring below can be asserted at the seam.
const viewProps = { current: null };
vi.mock("../../../SequenceView", () => ({
  default: (props) => {
    viewProps.current = props;
    return <div data-testid="mock-sequence-view" />;
  },
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

// ── U5-A · TWO highlight channels, one overlay ────────────────────────────────────────────────
/**
 * The overlay paints two independent things and must never make their owners fight:
 *   • `uiSlice.searchHits` — the in-molecule Ctrl+F find-all list (entry-scoped);
 *   • `navHits` — the locus a GLOBAL search jump landed on, owned by the inspector's navigation
 *     consumer, because a caret cannot express an origin wrap or a `both`-strand hit.
 * SequenceTab is the seam where they meet, so it merges rather than choosing.
 */
describe("SequenceTab — Ctrl+F hits and the global-nav locus both reach the overlay", () => {
  const ctrlF = { location: { segments: [{ start: 4, end: 12 }], strand: "+", wrapsOrigin: false }, metrics: { identityBps: 10000 } };
  const nav = { location: { segments: [{ start: 300, end: 320 }, { start: 0, end: 4 }], strand: "-", wrapsOrigin: true }, metrics: { identityBps: 9500 } };

  const mount = (props) => render(
    <SequenceTab
      sequence={SEQUENCE}
      annotations={[]}
      topology="circular"
      name="overlay-test"
      entryId="e1"
      {...props}
    />,
  );

  beforeEach(() => {
    viewProps.current = null;
    useStore.setState((s) => { s.searchHits = { entryId: null, query: "", hits: [] }; });
  });

  it("merges both channels — neither replaces the other", () => {
    useStore.setState((s) => { s.searchHits = { entryId: "e1", query: "MOTIF", hits: [ctrlF] }; });
    mount({ navHits: [nav] });
    expect(viewProps.current.searchHits).toEqual([ctrlF, nav]);
  });

  it("delivers the global locus even with no Ctrl+F search open", () => {
    mount({ navHits: [nav] });
    expect(viewProps.current.searchHits).toEqual([nav]);
  });

  it("delivers Ctrl+F alone when no jump highlight exists, and stays stable-empty otherwise", () => {
    useStore.setState((s) => { s.searchHits = { entryId: "e1", query: "MOTIF", hits: [ctrlF] }; });
    mount({});
    expect(viewProps.current.searchHits).toEqual([ctrlF]);
    cleanup();
    mount({});
    expect(viewProps.current.searchHits).toEqual([ctrlF]);
  });

  it("ignores Ctrl+F hits belonging to a DIFFERENT entry, but not the jump highlight", () => {
    // The slice is entry-scoped; stale hits from the previously inspected molecule must not smear
    // over this one. `navHits` is already keyed by the navigation owner, so it passes through.
    useStore.setState((s) => { s.searchHits = { entryId: "other", query: "MOTIF", hits: [ctrlF] }; });
    mount({ navHits: [nav] });
    expect(viewProps.current.searchHits).toEqual([nav]);
  });
});
