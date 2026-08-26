/**
 * primer-from-selection-modal.test.jsx — Игорь 18.05.2026: «окно с
 * редактированием праймера, имени и RC».
 */
import {
  describe, it, expect, afterEach, vi,
} from "vitest";
import {
  render, screen, cleanup, fireEvent,
} from "@testing-library/react";
import { useState } from "react";
import PrimerFromSelectionModal from "../popups/PrimerFromSelectionModal";
import SequenceView from "../index";
import { runHotkeyResolver } from "../../../lib/hotkeys";
import { evaluatePrimerWarnings } from "../../../lib/primer-live-workflow";
import { tf } from "../../../i18n";

afterEach(cleanup);

const draft = { direction: "forward", start: 4, end: 16, sequence: "ATGCAAAGGGCC" };

describe("PrimerFromSelectionModal", () => {
  it("pre-fills the selected DNA; name starts empty", () => {
    render(<PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId("primer-modal-seq").value).toBe("ATGCAAAGGGCC");
    expect(screen.getByTestId("primer-modal-name").value).toBe("");
  });

  it("pre-fills the name when opened from an existing primer (double-click)", () => {
    render(
      <PrimerFromSelectionModal
        draft={{ ...draft, name: "myFwd" }}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("primer-modal-name").value).toBe("myFwd");
  });

  it("RC toggle flips direction and reverse-complements the field", () => {
    render(<PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={() => {}} />);
    const rc = screen.getByTestId("primer-modal-rc");
    expect(rc.textContent).toMatch(/Forward/);
    fireEvent.click(rc);
    expect(rc.textContent).toMatch(/Reverse/);
    // ATGCAAAGGGCC → RC → GGCCCTTTGCAT
    expect(screen.getByTestId("primer-modal-seq").value).toBe("GGCCCTTTGCAT");
  });

  it("RC toggle explicitly flips the saved source anchor", () => {
    const onCreate = vi.fn();
    const anchor = [{
      id: "s1",
      target: { entryId: "e1", resourceHash: "h1", topology: "linear" },
      location: { kind: "single", segments: [{ start: 4, end: 16 }] },
      strand: 1,
      annealedSequence: "ATGCAAAGGGCC",
      tail: "",
    }];
    render(
      <PrimerFromSelectionModal
        draft={{ ...draft, primerId: "p1", binding: draft.sequence, tail: "" }}
        anchorSites={anchor}
        template={`NNNN${draft.sequence}NNNN`}
        topology="linear"
        entryId="e1"
        documentHash="h1"
        onCreate={onCreate}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("primer-modal-rc"));
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      direction: "reverse",
      sites: [expect.objectContaining({
        strand: -1,
        annealedSequence: "GGCCCTTTGCAT",
        location: anchor[0].location,
      })],
    }));
  });

  it("labels create and edit commits truthfully", () => {
    const { rerender } = render(
      <PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByTestId("primer-modal-create").textContent).toBe("Создать");
    rerender(
      <PrimerFromSelectionModal
        draft={{ ...draft, primerId: "p1", name: "existing" }}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("primer-modal-create").textContent).toBe("Сохранить");
  });

  it("returns focus to the trigger after close", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="open-primer" onClick={() => setOpen(true)}>open</button>
          {open && (
            <PrimerFromSelectionModal
              draft={draft}
              onCreate={() => setOpen(false)}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByTestId("open-primer");
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByTestId("primer-modal-name"));
    fireEvent.click(screen.getByTestId("primer-modal-cancel"));
    expect(document.activeElement).toBe(trigger);
  });

  it("Create → onCreate({name, sequence(cleaned), direction})", () => {
    const onCreate = vi.fn();
    render(<PrimerFromSelectionModal draft={draft} onCreate={onCreate} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("primer-modal-name"), { target: { value: "  myP  " } });
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: "atgc aaa\nggg" } });
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    // K13 added tail/binding to the payload; use objectContaining to
    // pin only the contract this test cares about.
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: "myP", sequence: "ATGCAAAGGG", direction: "forward",
      bindingModel: "aligned-v1",
    }));
  });

  it("closes on Esc and on backdrop click", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={onClose} />,
    );
    // Esc handled by the modal's own React keydown (NOT a window
    // listener — that would be killed by the backdrop's stopPropagation
    // and also take out bubble-phase window hotkeys; Игорь «отвалились
    // хоткеи» regression).
    fireEvent.keyDown(screen.getByTestId("primer-from-selection-modal"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("primer-from-selection-modal")); // backdrop
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // Regression — Игорь 18.05.2026 «отвалились хоткеи»: the backdrop
  // stopPropagation must NOT rely on / break a window keydown listener.
  // Esc closes via the in-component handler; a non-Esc key is still
  // contained (does not leak to a host/window bubble handler).
  it("Esc closes without a window listener; stopPropagation still contains keys", () => {
    const onClose = vi.fn();
    const hostKeyDown = vi.fn();
    render(
      <div onKeyDown={hostKeyDown}>
        <PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={onClose} />
      </div>,
    );
    const modal = screen.getByTestId("primer-from-selection-modal");
    fireEvent.keyDown(modal, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByTestId("primer-modal-name"), { key: "A", code: "KeyA" });
    expect(hostKeyDown).not.toHaveBeenCalled(); // still isolated from host
  });

  // Regression — Игорь 18.05.2026: «модалка появляется в центре
  // последовательности и до неё надо скролить; ввод имени неактивен».
  // Root cause: rendered with position:absolute inside SequenceView's
  // scroll/pointer subtree. Fix: portal to document.body + fixed.
  it("renders as a viewport-fixed modal portaled to document.body", () => {
    render(<PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={() => {}} />);
    const backdrop = screen.getByTestId("primer-from-selection-modal");
    // Bug 1: must be fixed (not absolute → scrolled away inside viewer)
    // and a direct child of <body> (escapes the viewer stacking ctx).
    expect(backdrop.style.position).toBe("fixed");
    expect(backdrop.parentElement).toBe(document.body);
  });

  it("auto-focuses the name input so it is immediately typeable (bug: input inactive)", () => {
    render(<PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={() => {}} />);
    const nameInput = screen.getByTestId("primer-modal-name");
    expect(document.activeElement).toBe(nameInput);
    fireEvent.change(nameInput, { target: { value: "P1" } });
    expect(nameInput.value).toBe("P1");
  });

  // Regression — Игорь 18.05.2026: «имя так же не печатается». React
  // bubbles events through the COMPONENT tree, not the DOM; the portal
  // does NOT lift keydown out of SequenceView's `<div onKeyDown>`
  // (which preventDefaults IUPAC letters in editable mode). The modal
  // must stop keydown propagation so host keyboard handlers never see
  // (and never preventDefault) typing inside it.
  it("does not leak keydown to a host onKeyDown handler (sequence-edit swallow guard)", () => {
    const hostKeyDown = vi.fn();
    render(
      <div onKeyDown={hostKeyDown}>
        <PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={() => {}} />
      </div>,
    );
    // 'A' is an IUPAC base — exactly the key SequenceView's root
    // handler preventDefaults in editable mode.
    fireEvent.keyDown(screen.getByTestId("primer-modal-name"), { key: "A", code: "KeyA" });
    fireEvent.keyDown(screen.getByTestId("primer-modal-seq"), { key: "T", code: "KeyT" });
    expect(hostKeyDown).not.toHaveBeenCalled();
  });

  // Regression — Игорь 18.05.2026: «модалка "прозрачная" для клика,
  // кнопки не жмутся». pointerdown/up from the portal bubble (React
  // tree) into SequenceView's onRootPointerDown which steals the
  // interaction. Modal must stop pointer propagation; buttons must
  // still fire their own onClick.
  it("does not leak pointer events to a host handler; buttons still fire", () => {
    const hostPointerDown = vi.fn();
    const hostPointerUp = vi.fn();
    const onCreate = vi.fn();
    render(
      <div onPointerDown={hostPointerDown} onPointerUp={hostPointerUp}>
        <PrimerFromSelectionModal draft={draft} onCreate={onCreate} onClose={() => {}} />
      </div>,
    );
    const createBtn = screen.getByTestId("primer-modal-create");
    fireEvent.pointerDown(createBtn);
    fireEvent.pointerUp(createBtn);
    fireEvent.click(createBtn);
    expect(hostPointerDown).not.toHaveBeenCalled();
    expect(hostPointerUp).not.toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: "", sequence: "ATGCAAAGGGCC", direction: "forward",
    }));
  });
});

/**
 * PRIMER-LIVE-1B — the modal is also the EDIT surface («E» / double-click on an
 * existing primer), and an edit has to land on the record it was opened from.
 *
 * Reported 23.08.2026 from the browser (pUC19): the dialog itself turned out
 * to be fine — the "nothing types" report was a focus loss, and the keystrokes
 * went into the editable sequence behind the dialog. What the same session did
 * expose is upstream of the modal: SequenceView seeds the edit draft from the
 * drawn hit but drops its identity (`id`), its 5'-tail/binding split and its
 * record fields, and the submit handler forwards no `primerId`. Downstream,
 * `useEntryPrimers.onWritePrimer` edits in place ONLY when a `primerId`
 * arrives — without one it mints a fresh uuidv7. So «rename this primer»
 * silently produced a second, tail-less copy of it.
 *
 * These run against the real SequenceView + the real window-capture hotkey
 * resolver App.jsx installs, because the defect lives in that wiring, not in
 * the dialog component.
 */
describe("PRIMER-LIVE-1B — «E» / double-click edits the primer it was opened from", () => {
  const HOST_SEQ = "ATGGCC".repeat(20) + "TTAGCATCGATTGCACTAGT" + "ATGGCC".repeat(20);
  const HOST_FRAGMENT = {
    id: "frag-1", name: "pUC19-ish", type: "CDS", sequence: HOST_SEQ, strand: 1, annotations: [],
  };
  // A TAILED primer: the overhang is not part of the genomic footprint, so an
  // edit that forgets the split silently absorbs the tail into the binding.
  const BINDING = "TTAGCATCGATT"; // [120,132)
  const TAILED = {
    id: "prm-1",
    name: "primer",
    direction: "forward",
    tail: "GAATTC",
    bindingSequence: BINDING,
    sequence: `GAATTC${BINDING}`,
    modifications: ["5Phos"],
  };

  let detachGlobalHotkeys = null;
  afterEach(() => {
    if (detachGlobalHotkeys) { detachGlobalHotkeys(); detachGlobalHotkeys = null; }
  });

  // App.jsx installs exactly this — ONE window keydown listener, capture phase.
  // «E» only reaches the viewer through it, so the proof goes through it too.
  function attachGlobalHotkeys() {
    const onKeyDown = (e) => runHotkeyResolver(e);
    window.addEventListener("keydown", onKeyDown, true);
    detachGlobalHotkeys = () => window.removeEventListener("keydown", onKeyDown, true);
  }

  function renderHost(primer = TAILED) {
    attachGlobalHotkeys();
    const onWritePrimer = vi.fn();
    const onSequenceEdit = vi.fn();
    render(
      <SequenceView
        fragments={[HOST_FRAGMENT]}
        caretAnchor={120}
        caretPos={132}
        primers={[primer]}
        onWritePrimer={onWritePrimer}
        onSequenceEdit={onSequenceEdit}
        editable
        entryId="e1"
        documentHash="h1"
      />,
    );
    return { onWritePrimer, onSequenceEdit };
  }

  // Select the drawn occurrence, then edit it with the real «E» hotkey.
  function openEditModal() {
    fireEvent.click(screen.getAllByTestId("sequence-view-primer")[0]);
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
    return screen.getByTestId("primer-modal-name");
  }

  it("submits the id of the primer being edited (not a fresh record)", () => {
    const { onWritePrimer } = renderHost();
    openEditModal();
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onWritePrimer).toHaveBeenCalledTimes(1);
    // useEntryPrimers edits in place only when `primerId` names the record;
    // without it the write mints a new uuidv7 → a duplicate primer.
    expect(onWritePrimer.mock.calls[0][0].primerId).toBe("prm-1");
  });

  it("seeds the dialog with the stored 5'-tail / binding split", () => {
    renderHost();
    openEditModal();
    expect(screen.getByTestId("primer-modal-tail").value).toBe("GAATTC");
    expect(screen.getByTestId("primer-modal-seq").value).toBe(BINDING);
    expect(screen.getByTestId("primer-modal-name").value).toBe("primer");
  });

  it("a rename keeps the tail, the binding and the record's own fields", () => {
    const { onWritePrimer } = renderHost();
    const nameInput = openEditModal();
    fireEvent.change(nameInput, { target: { value: "M13-fwd" } });
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onWritePrimer.mock.calls[0][0]).toMatchObject({
      primerId: "prm-1",
      name: "M13-fwd",
      tail: "GAATTC",
      binding: BINDING,
      sequence: `GAATTC${BINDING}`,
      direction: "forward",
      modifications: ["5Phos"],
    });
  });

  it("an ordinary edit does not re-anchor the primer", () => {
    const { onWritePrimer } = renderHost();
    openEditModal();
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    // `sites` is the anchor. useEntryPrimers only overwrites it when the
    // caller really re-anchored; a rename must leave the landing — and the
    // mismatch warning computed from it — exactly where it was.
    expect(onWritePrimer.mock.calls[0][0].sites).toBeUndefined();
  });

  it("a deliberate same-length substitution stays the same anchored record", () => {
    const { onWritePrimer } = renderHost();
    openEditModal();
    // one base swapped, same length: the biolog means it, and it must remain
    // an edit of this primer at this landing rather than a new oligo.
    const mutated = `${BINDING.slice(0, 5)}A${BINDING.slice(6)}`;
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: mutated } });
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onWritePrimer.mock.calls[0][0]).toMatchObject({
      primerId: "prm-1", start: 120, end: 132, binding: mutated,
    });
    expect(onWritePrimer.mock.calls[0][0].sites).toBeUndefined();
  });

  // Green on arrival — kept as the host-level guard for the containment the
  // modal already implements (its backdrop stops keydown before the viewer's
  // root handler, which preventDefaults IUPAC letters in editable mode).
  // Recorded as existing behaviour, NOT as a RED for this package.
  it("typing inside the dialog does not reach the viewer's sequence editor", () => {
    const { onSequenceEdit } = renderHost();
    const nameInput = openEditModal();
    nameInput.focus();
    for (const ch of "ACGT") {
      const notPrevented = fireEvent.keyDown(nameInput, { key: ch, code: `Key${ch}` });
      expect(notPrevented).toBe(true); // nothing cancels the character
    }
    expect(onSequenceEdit).not.toHaveBeenCalled();
  });
});

/**
 * PRIMER-LIVE-1B — a deliberate substitution has to be VISIBLE.
 *
 * `editPrimerInPlace` keeps the anchor and rewrites the binding, which is the
 * right storage rule — and it is why the mismatch had nowhere to show up: the
 * selection panel only answers for the current selection, and the dialog said
 * nothing at all. The warning is non-blocking by contract: a changed base is a
 * deliberate act as often as a slip, so it is reported and the oligo is
 * created exactly as written.
 */
describe("PRIMER-LIVE-1B — the dialog shows a substitution while it is typed", () => {
  const LANDING = "ACGTTGCAACGTTGCA";
  const SITES = [{
    id: "s1",
    target: { entryId: "e1", resourceHash: "h1", topology: "linear" },
    location: { kind: "single", segments: [{ start: 0, end: 16 }] },
    strand: 1,
    annealedSequence: LANDING,
    tail: "",
  }];

  const renderAnchored = (over = {}) => {
    const onCreate = vi.fn();
    render(
      <PrimerFromSelectionModal
        draft={{
          primerId: "prm-1", direction: "forward", start: 0, end: 16,
          name: "primer", tail: "", binding: LANDING, sequence: LANDING,
        }}
        anchorSites={SITES}
        template={LANDING}
        topology="linear"
        entryId="e1"
        documentHash="h1"
        onCreate={onCreate}
        onClose={() => {}}
        {...over}
      />,
    );
    return { onCreate };
  };

  it("says nothing while the oligo still matches its landing", () => {
    renderAnchored();
    expect(screen.queryByTestId("primer-modal-mismatch")).toBeNull();
  });

  it("names the position as soon as one base is changed, numbered from 1", () => {
    renderAnchored();
    const mutated = "ACGTTGCATCGTTGCA"; // 0-based index 8 A→T
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: mutated } });
    const warn = screen.getByTestId("primer-modal-mismatch");
    // The resolver counts from 0; the viewer numbers bases from 1, and this
    // text is read against the viewer. The shift belongs to the string only.
    expect(warn.textContent).toMatch(/\b9\b/);
    expect(warn.textContent).not.toMatch(/\b8\b/);
  });

  it("keeps the stored positions 0-based — only the text is shifted", () => {
    // Same record, same template, asked of the owner directly: the number the
    // resolver reports must stay a template index, or every other consumer
    // (overlays, product resolution) would be off by one.
    const mutated = "ACGTTGCATCGTTGCA";
    const [warning] = evaluatePrimerWarnings(
      {
        id: "prm-1", direction: "forward", tail: "",
        sequence: mutated, bindingSequence: mutated, sites: SITES,
      },
      { template: LANDING, topology: "linear", entryId: "e1", documentHash: "h1" },
    ).filter((w) => w.code === "mismatch");
    expect(warning.positions).toEqual([8]);
  });

  it("keeps creation allowed — the warning is never a veto", () => {
    const { onCreate } = renderAnchored();
    const mutated = "ACGTTGCATCGTTGCA";
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: mutated } });
    expect(screen.getByTestId("primer-modal-mismatch")).toBeTruthy();
    const createBtn = screen.getByTestId("primer-modal-create");
    expect(createBtn.disabled).toBeFalsy();
    fireEvent.click(createBtn);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      binding: mutated, sequence: mutated,
    }));
  });

  it("a 5'-tail is an overhang, not a mismatch against the template", () => {
    renderAnchored();
    fireEvent.change(screen.getByTestId("primer-modal-tail"), { target: { value: "GAATTC" } });
    expect(screen.queryByTestId("primer-modal-mismatch")).toBeNull();
  });

  it("stays silent for an unanchored draft (create-from-selection)", () => {
    renderAnchored({ anchorSites: null });
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: "TTTTTTTTTTTTTTTT" } });
    expect(screen.queryByTestId("primer-modal-mismatch")).toBeNull();
  });
});

// The same thing end-to-end: select the drawn landing, «E», change one base,
// and the warning must appear against the stretch the primer is ANCHORED to —
// while the submit still edits that same record and still does not re-anchor it.
describe("PRIMER-LIVE-1B — substitution on a real anchored primer, real host", () => {
  const HOST_SEQ = "ATGGCC".repeat(20) + "TTAGCATCGATTGCACTAGT" + "ATGGCC".repeat(20);
  const BINDING = "TTAGCATCGATT"; // [120,132)
  const ANCHORED = {
    id: "prm-1",
    name: "primer",
    direction: "forward",
    tail: "",
    bindingSequence: BINDING,
    sequence: BINDING,
    schemaVersion: 2,
    sites: [{
      id: "s1",
      target: { entryId: "e1", resourceHash: "h1", topology: "linear" },
      location: { kind: "single", segments: [{ start: 120, end: 132 }] },
      strand: 1,
      annealedSequence: BINDING,
      tail: "",
    }],
  };

  let detach = null;
  afterEach(() => { if (detach) { detach(); detach = null; } });

  function renderHost() {
    const onKeyDown = (e) => runHotkeyResolver(e);
    window.addEventListener("keydown", onKeyDown, true);
    detach = () => window.removeEventListener("keydown", onKeyDown, true);
    const onWritePrimer = vi.fn();
    render(
      <SequenceView
        fragments={[{
          id: "frag-1", name: "pUC19-ish", type: "CDS", sequence: HOST_SEQ,
          strand: 1, annotations: [],
        }]}
        caretAnchor={120}
        caretPos={132}
        primers={[ANCHORED]}
        onWritePrimer={onWritePrimer}
        onSequenceEdit={() => {}}
        editable
        entryId="e1"
        documentHash="h1"
      />,
    );
    fireEvent.click(screen.getAllByTestId("sequence-view-primer")[0]);
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
    return { onWritePrimer };
  }

  it("opens clean, then warns at the template position of the changed base", () => {
    renderHost();
    expect(screen.queryByTestId("primer-modal-mismatch")).toBeNull();
    const mutated = `A${BINDING.slice(1)}`; // index 0 T→A → template position 120
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: mutated } });
    const warn = screen.getByTestId("primer-modal-mismatch");
    // Template index 120 → base 121 as the viewer numbers it.
    expect(warn.textContent).toMatch(/\b121\b/);
    expect(warn.textContent).not.toMatch(/\b120\b/);
  });

  it("submits the substitution as an edit of the same record, still anchored", () => {
    const { onWritePrimer } = renderHost();
    const mutated = `A${BINDING.slice(1)}`;
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: mutated } });
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    const payload = onWritePrimer.mock.calls[0][0];
    expect(payload).toMatchObject({
      primerId: "prm-1", binding: mutated, start: 120, end: 132,
    });
    // The landing travelled into the dialog for DISPLAY only. Writing it back
    // would re-anchor the primer onto the stretch it no longer matches, and
    // the warning would erase itself the moment it was saved.
    expect(payload.sites).toBeUndefined();
  });
});

/**
 * PRIMER-LIVE-1B correction — what the dialog opens WITH, and what it lets
 * through.
 *
 * A projected source hit is not the record. Its `bindingSequence` is
 * `site.annealedSequence` — the stretch captured when the landing was declared
 * — and its `tail` is null on every segment that is not the 5' one. Seeding
 * the editable fields from the hit therefore reopens a saved substitution
 * showing the OLD exact binding, with no mismatch, and submitting from that
 * state would quietly undo the base the biolog changed on purpose.
 *
 * Separately: the backdrop contains keydown and pointer events but not paste,
 * and React routes portal events through the COMPONENT tree — so Ctrl+V in a
 * dialog field reached the viewer's root `onPaste`, which preventDefault()s and
 * edits the plasmid behind the dialog.
 */
describe("PRIMER-LIVE-1B correction — the dialog opens on the record, not the drawing", () => {
  const HOST_SEQ = "ATGGCC".repeat(20) + "TTAGCATCGATTGCACTAGT" + "ATGGCC".repeat(20);
  const ANNEALED = "TTAGCATCGATT";          // what the template actually reads at [120,132)
  const EDITED = "ATAGCATCGATT";            // same length, index 0 T->A -> template pos 120
  const TAIL = "GAATTC";

  // Saved state after a deliberate substitution: the record carries the edited
  // oligo, the anchor still carries the pre-edit snapshot (an ordinary edit
  // must not re-anchor), and the landing still projects from the site.
  const SAVED = {
    id: "prm-1",
    name: "primer",
    direction: "forward",
    tail: TAIL,
    bindingSequence: EDITED,
    sequence: `${TAIL}${EDITED}`,
    schemaVersion: 2,
    modifications: ["5Phos"],
    sites: [{
      id: "s1",
      target: { entryId: "e1", resourceHash: "h1", topology: "linear" },
      location: { kind: "single", segments: [{ start: 120, end: 132 }] },
      strand: 1,
      annealedSequence: ANNEALED,
      tail: TAIL,
    }],
  };

  let detach = null;
  afterEach(() => { if (detach) { detach(); detach = null; } });

  function renderHost(primer = SAVED) {
    const onKeyDown = (e) => runHotkeyResolver(e);
    window.addEventListener("keydown", onKeyDown, true);
    detach = () => window.removeEventListener("keydown", onKeyDown, true);
    const onWritePrimer = vi.fn();
    const onSequenceEdit = vi.fn();
    render(
      <SequenceView
        fragments={[{
          id: "frag-1", name: "pUC19-ish", type: "CDS", sequence: HOST_SEQ,
          strand: 1, annotations: [],
        }]}
        caretAnchor={120}
        caretPos={132}
        primers={[primer]}
        onWritePrimer={onWritePrimer}
        onSequenceEdit={onSequenceEdit}
        editable
        entryId="e1"
        documentHash="h1"
      />,
    );
    fireEvent.click(screen.getAllByTestId("sequence-view-primer")[0]);
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
    return { onWritePrimer, onSequenceEdit };
  }

  it("reopens a saved substitution showing the CURRENT oligo, not the anchor snapshot", () => {
    renderHost();
    expect(screen.getByTestId("primer-modal-seq").value).toBe(EDITED);
    expect(screen.getByTestId("primer-modal-tail").value).toBe(TAIL);
    expect(screen.getByTestId("primer-modal-name").value).toBe("primer");
  });

  it("shows the mismatch immediately on reopen, before anything is typed", () => {
    renderHost();
    const warn = screen.getByTestId("primer-modal-mismatch");
    expect(warn.textContent).toMatch(/\b121\b/); // template index 120, numbered from 1
  });

  it("submitting without retyping keeps the substitution and the record identity", () => {
    const { onWritePrimer } = renderHost();
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    const payload = onWritePrimer.mock.calls[0][0];
    expect(payload).toMatchObject({
      primerId: "prm-1",
      binding: EDITED,
      tail: TAIL,
      sequence: `${TAIL}${EDITED}`,
      direction: "forward",
      modifications: ["5Phos"],
    });
    expect(payload.sites).toBeUndefined(); // still not re-anchored
  });

  it("Ctrl+V in a dialog field never edits the plasmid behind it", () => {
    const { onSequenceEdit } = renderHost();
    const nameInput = screen.getByTestId("primer-modal-name");
    nameInput.focus();
    const notPrevented = fireEvent.paste(nameInput, {
      clipboardData: { getData: () => "GGGG" },
    });
    expect(onSequenceEdit).not.toHaveBeenCalled();
    // The field's own native paste must still happen — containing the event
    // is not the same as cancelling it.
    expect(notPrevented).toBe(true);
  });

  it("the same holds for the tail and binding textareas", () => {
    const { onSequenceEdit } = renderHost();
    for (const id of ["primer-modal-tail", "primer-modal-seq"]) {
      const el = screen.getByTestId(id);
      el.focus();
      const notPrevented = fireEvent.paste(el, {
        clipboardData: { getData: () => "ACGTACGT" },
      });
      expect(notPrevented).toBe(true);
    }
    expect(onSequenceEdit).not.toHaveBeenCalled();
  });
});

// Guard, green on arrival both before and after this correction: `tail` is
// null on a non-5' segment of an origin-crossing primer, so the record has to
// supply it. Kept because the record-precedence rule above is now what
// guarantees it, and a future reshuffle would otherwise break it silently.
describe("PRIMER-LIVE-1B correction — a wrapping primer is one landing, two arrows", () => {
  const HOST_SEQ = "ATGGCC".repeat(20) + "TTAGCATCGATTGCACTAGT" + "ATGGCC".repeat(20);
  const TAIL = "GAATTC";
  const WRAP_BINDING = HOST_SEQ.slice(254, 260) + HOST_SEQ.slice(0, 6);

  let detach = null;
  afterEach(() => { if (detach) { detach(); detach = null; } });

  it("keeps the stored tail when the segment that carries none is clicked", () => {
    const onKeyDown = (e) => runHotkeyResolver(e);
    window.addEventListener("keydown", onKeyDown, true);
    detach = () => window.removeEventListener("keydown", onKeyDown, true);
    render(
      <SequenceView
        fragments={[{
          id: "frag-1", name: "pUC19-ish", type: "CDS", sequence: HOST_SEQ,
          strand: 1, annotations: [],
        }]}
        caretAnchor={254}
        caretPos={260}
        primers={[{
          id: "prm-wrap",
          name: "wrapper",
          direction: "forward",
          tail: TAIL,
          bindingSequence: WRAP_BINDING,
          sequence: `${TAIL}${WRAP_BINDING}`,
          schemaVersion: 2,
          sites: [{
            id: "sw",
            target: { entryId: "e1", resourceHash: "h1", topology: "circular" },
            location: {
              kind: "split",
              segments: [{ start: 254, end: 260 }, { start: 0, end: 6 }],
            },
            strand: 1,
            annealedSequence: WRAP_BINDING,
            tail: TAIL,
          }],
        }]}
        onWritePrimer={() => {}}
        onSequenceEdit={() => {}}
        editable
        circular
        entryId="e1"
        documentHash="h1"
      />,
    );
    const glyphs = screen.getAllByTestId("sequence-view-primer");
    expect(glyphs.length).toBeGreaterThan(1); // two arrows, one landing
    fireEvent.click(glyphs[glyphs.length - 1]); // the one that carries no tail
    fireEvent.keyDown(document.body, { key: "e", code: "KeyE" });
    expect(screen.getByTestId("primer-modal-tail").value).toBe(TAIL);
    expect(screen.getByTestId("primer-modal-seq").value).toBe(WRAP_BINDING);
  });
});

/**
 * SEQ-VIS-1 contract A — the dialog opens the legacy record already split.
 *
 * The record the user actually has stores `AAAAAAAA` + a 31-nt anchor in one
 * `bindingSequence` with `tail:''`. Showing that verbatim asks the biolog to do
 * the arithmetic themselves, and Save would write the same ambiguous shape
 * back. The anchor fixes the landing length, so the dialog can — and must —
 * present the overhang and the landing as the two things they are, then
 * canonicalise them on save without touching the primer id or its anchor.
 */
describe("SEQ-VIS-1 — legacy split in the edit dialog", () => {
  const ANCHOR = "ACGTTGCAACGTTGCAACGTTGCAACGTTGC";   // 31 nt
  const POLY_A = "AAAAAAAA";
  const TPL = `${"T".repeat(10)}${ANCHOR}${"T".repeat(59)}`; // anchor at [10,41)
  const SITES = [{
    id: "s1",
    target: { entryId: "E1", resourceHash: "sha256:seqvis-v1", topology: "linear" },
    location: { kind: "single", segments: [{ start: 10, end: 41 }] },
    strand: 1,
    annealedSequence: ANCHOR,
    tail: "",
  }];

  const openLegacy = (over = {}) => {
    const onCreate = vi.fn();
    render(
      <PrimerFromSelectionModal
        draft={{
          primerId: "p1", direction: "forward", start: 10, end: 41,
          name: "SUMO-fwd",
          tail: "",
          binding: `${POLY_A}${ANCHOR}`,
          sequence: `${POLY_A}${ANCHOR}`,
          ...over,
        }}
        anchorSites={SITES}
        template={TPL}
        topology="linear"
        entryId="E1"
        documentHash="sha256:seqvis-v1"
        onCreate={onCreate}
        onClose={() => {}}
      />,
    );
    return { onCreate };
  };

  it("opens with the overhang in the tail field and the landing in the binding field", () => {
    openLegacy();
    expect(screen.getByTestId("primer-modal-tail").value).toBe(POLY_A);
    expect(screen.getByTestId("primer-modal-seq").value).toBe(ANCHOR);
  });

  it("says nothing about a mismatch — an overhang is not a disagreement", () => {
    openLegacy();
    expect(screen.queryByTestId("primer-modal-mismatch")).toBeNull();
  });

  it("still reports a substitution that sits behind the overhang", () => {
    const mut = `${ANCHOR.slice(0, 30)}A`; // last base of the landing
    openLegacy({ binding: `${POLY_A}${mut}`, sequence: `${POLY_A}${mut}` });
    // template index 40, numbered from 1 for the reader
    expect(screen.getByTestId("primer-modal-mismatch").textContent).toMatch(/\b41\b/);
  });

  it("Save canonicalises tail / binding / sequence without moving the anchor", () => {
    const { onCreate } = openLegacy();
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      name: "SUMO-fwd",
      tail: POLY_A,
      binding: ANCHOR,
      sequence: `${POLY_A}${ANCHOR}`,
      direction: "forward",
      bindingModel: "aligned-v1",
    });
  });
});

describe("SEQ-VIS-1 correction — unreadable anchored edits are blocked", () => {
  const ANCHOR = "ACGTTGCAACGTTGCA";
  const SITES = [{
    id: "s1",
    target: { entryId: "e1", resourceHash: "h1", topology: "linear" },
    location: { kind: "single", segments: [{ start: 0, end: ANCHOR.length }] },
    strand: 1,
    annealedSequence: ANCHOR,
    tail: "",
  }];

  const renderBlocked = (draftOver) => {
    const onCreate = vi.fn();
    render(
      <PrimerFromSelectionModal
        draft={{
          primerId: "p1", direction: "forward", start: 0, end: ANCHOR.length,
          name: "blocked", tail: "", binding: ANCHOR, sequence: ANCHOR,
          ...draftOver,
        }}
        anchorSites={SITES}
        template={ANCHOR}
        topology="linear"
        entryId="e1"
        documentHash="h1"
        onCreate={onCreate}
        onClose={() => {}}
      />,
    );
    return onCreate;
  };

  it("shows tail/binding conflict and preserves the contradictory record on unchanged Save", () => {
    const onCreate = renderBlocked({
      tail: "GAATTC", binding: ANCHOR, sequence: `TTTTTT${ANCHOR}`,
    });
    expect(screen.getByTestId("primer-modal-blocked").textContent)
      .toBe(tf("pcr.product.blocked.tail-binding-conflict"));
    const save = screen.getByTestId("primer-modal-create");
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows unsupported indel and blocks unchanged Save", () => {
    const short = ANCHOR.slice(2);
    const onCreate = renderBlocked({ binding: short, sequence: short });
    expect(screen.getByTestId("primer-modal-blocked").textContent)
      .toBe(tf("pcr.product.blocked.indel-unsupported"));
    const save = screen.getByTestId("primer-modal-create");
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("moves a readable legacy record into aligned editing and saves a live deletion", () => {
    const onCreate = renderBlocked({});
    const binding = screen.getByTestId("primer-modal-seq");
    const save = screen.getByTestId("primer-modal-create");

    expect(save.disabled).toBe(false);
    fireEvent.change(binding, { target: { value: ANCHOR.slice(1) } });
    expect(screen.queryByTestId("primer-modal-blocked")).toBeNull();
    expect(screen.getByTestId("primer-modal-alignment-summary").textContent)
      .toMatch(/посадка 16.*делеции −1/);
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      binding: ANCHOR.slice(1), sequence: ANCHOR.slice(1),
      bindingModel: "aligned-v1",
    }));
  });

  it("opens an already aligned-v1 deletion without a veto", () => {
    const short = ANCHOR.slice(2);
    const onCreate = renderBlocked({
      bindingModel: "aligned-v1", binding: short, sequence: short,
    });
    expect(screen.queryByTestId("primer-modal-blocked")).toBeNull();
    expect(screen.getByTestId("primer-modal-alignment-summary").textContent)
      .toMatch(/посадка 16.*делеции −2/);
    const save = screen.getByTestId("primer-modal-create");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      binding: short, bindingModel: "aligned-v1",
    }));
  });

  it("shows an aligned-v1 insertion live and keeps Save enabled", () => {
    const onCreate = renderBlocked({ bindingModel: "aligned-v1" });
    const inserted = `${ANCHOR.slice(0, 8)}A${ANCHOR.slice(8)}`;
    fireEvent.change(screen.getByTestId("primer-modal-seq"), {
      target: { value: inserted },
    });
    expect(screen.queryByTestId("primer-modal-blocked")).toBeNull();
    expect(screen.getByTestId("primer-modal-alignment-summary").textContent)
      .toMatch(/посадка 16.*вставки \+1.*делеции −0/);
    const save = screen.getByTestId("primer-modal-create");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      binding: inserted, bindingModel: "aligned-v1",
    }));
  });

  it("keeps a same-length substitution as a non-blocking mismatch", () => {
    const onCreate = renderBlocked({});
    const mutated = `T${ANCHOR.slice(1)}`;
    fireEvent.change(screen.getByTestId("primer-modal-seq"), {
      target: { value: mutated },
    });

    expect(screen.getByTestId("primer-modal-mismatch")).toBeTruthy();
    expect(screen.queryByTestId("primer-modal-blocked")).toBeNull();
    const save = screen.getByTestId("primer-modal-create");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      binding: mutated, sequence: mutated,
    }));
  });
});

describe("SEQ-VIS-1 correction — real host edits the clicked source occurrence", () => {
  const CURRENT = "TTAGCATCGATT";
  const TAIL = "GAATTC";
  const HOST_SEQ = `${"A".repeat(20)}${CURRENT}${"C".repeat(40)}`;

  it("ignores a foreign first site and opens from the clicked current later site", () => {
    const onWritePrimer = vi.fn();
    render(
      <SequenceView
        fragments={[{
          id: "frag-1", name: "host", type: "CDS", sequence: HOST_SEQ,
          strand: 1, annotations: [],
        }]}
        primers={[{
          id: "p-clicked", name: "clicked", direction: "forward",
          tail: null, bindingSequence: CURRENT, sequence: `${TAIL}${CURRENT}`,
          modifications: ["5Phos"],
          sites: [{
            id: "foreign-first",
            target: { entryId: "OTHER", resourceHash: "h1", topology: "linear" },
            location: { kind: "single", segments: [{ start: 0, end: 8 }] },
            strand: 1, annealedSequence: "AAAAAAAA", tail: null,
          }, {
            id: "current-later",
            target: { entryId: "e1", resourceHash: "h1", topology: "linear" },
            location: { kind: "single", segments: [{ start: 20, end: 32 }] },
            strand: 1, annealedSequence: CURRENT, tail: null,
          }],
        }]}
        onWritePrimer={onWritePrimer}
        onSequenceEdit={() => {}}
        editable
        entryId="e1"
        documentHash="h1"
      />,
    );
    fireEvent.doubleClick(screen.getByTestId("sequence-view-primer"));
    expect(screen.getByTestId("primer-modal-tail").value).toBe(TAIL);
    expect(screen.getByTestId("primer-modal-seq").value).toBe(CURRENT);
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onWritePrimer).toHaveBeenCalledWith(expect.objectContaining({
      primerId: "p-clicked", tail: TAIL, binding: CURRENT,
      modifications: ["5Phos"], sites: undefined,
    }));
  });
});
