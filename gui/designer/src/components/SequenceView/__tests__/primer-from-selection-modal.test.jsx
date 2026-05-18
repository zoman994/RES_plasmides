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
import PrimerFromSelectionModal from "../popups/PrimerFromSelectionModal";

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

  it("Create → onCreate({name, sequence(cleaned), direction})", () => {
    const onCreate = vi.fn();
    render(<PrimerFromSelectionModal draft={draft} onCreate={onCreate} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("primer-modal-name"), { target: { value: "  myP  " } });
    fireEvent.change(screen.getByTestId("primer-modal-seq"), { target: { value: "atgc aaa\nggg" } });
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onCreate).toHaveBeenCalledWith({
      name: "myP", sequence: "ATGCAAAGGG", direction: "forward",
    });
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
    expect(onCreate).toHaveBeenCalledWith({
      name: "", sequence: "ATGCAAAGGGCC", direction: "forward",
    });
  });
});
