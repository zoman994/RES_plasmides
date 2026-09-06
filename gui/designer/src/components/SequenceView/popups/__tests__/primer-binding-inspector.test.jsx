import {
  afterEach, describe, expect, it, vi,
} from "vitest";
import {
  cleanup, fireEvent, render, screen, within,
} from "@testing-library/react";
import SequenceView from "../../index";
import { landingPreviewLines } from "../../SequenceLandingPreview";
import PrimerFromSelectionModal from "../PrimerFromSelectionModal";
import { primerTmReadoutText } from "../PrimerTmReadout";
import { calcTm } from "../../../../tm-calculator.js";
import { tf } from "../../../../i18n";

afterEach(cleanup);

it.each([
  "noncanonical-three-prime-anchor",
  "invalid-three-prime-anchor-evidence",
])("shows the exact refused PCR reason: %s", (reason) => {
  const result = {
    fullDuplex: { status: "not-calculated", tmC: null, reason: "noncanonical-base" },
    threePrimeAnchor: { status: "not-calculated", tmC: null, length: 0 },
    pcr: { status: "refused", reasons: [reason] },
  };
  const text = primerTmReadoutText(result);
  expect(text).toContain(tf(`primer.tm.reason.${reason}`));
  expect(text).not.toContain(tf("primer.tm.reason.short-three-prime-anchor"));
});

function renderAnchored({
  template = "TTTTACGTTGCAACGTTGCAGGGG",
  binding = "ACGTTGCAACGTTGCA",
  anchorSequence = binding,
  tail = "",
  strand = 1,
  segments = [{ start: 4, end: 20 }],
  topology = "linear",
  features = [],
  templateReSites = [],
  onCreate = vi.fn(),
} = {}) {
  render(
    <PrimerFromSelectionModal
      draft={{
        primerId: "primer-1",
        name: "inspection primer",
        direction: strand === -1 ? "reverse" : "forward",
        start: segments[0].start,
        end: segments.reduce(
          (sum, segment) => sum + segment.end - segment.start,
          segments[0].start,
        ),
        tail,
        binding,
        sequence: `${tail}${binding}`,
        bindingModel: "aligned-v1",
      }}
      anchorSites={[{
        id: "site-1",
        target: { entryId: "entry-1", resourceHash: "hash-1", topology },
        location: { kind: segments.length > 1 ? "join" : "single", segments },
        strand,
        annealedSequence: anchorSequence,
        tail,
      }]}
      template={template}
      topology={topology}
      entryId="entry-1"
      documentHash="hash-1"
      features={features}
      templateReSites={templateReSites}
      viewSettings={{
        showBottomStrand: true,
        primerStyle: "filled",
        reOrientation: "vertical",
      }}
      onCreate={onCreate}
      onClose={() => {}}
    />,
  );
  return { onCreate };
}

function templatePreview() {
  return screen.getByTestId("primer-binding-template-preview");
}

describe("primer binding editor — field ownership", () => {
  it("marks an edited nucleotide in the real field without moving focus", () => {
    renderAnchored();
    const editor = screen.getByTestId("primer-modal-seq");
    editor.focus();

    const edited = "ACGTTGCATCGTTGCA";
    fireEvent.change(editor, { target: { value: edited } });

    expect(document.activeElement).toBe(editor);
    expect(editor.value).toBe(edited);
    expect(screen.getByTestId("primer-modal-binding-mirror").textContent).toBe(edited);
    const difference = screen.getByTestId("primer-modal-binding-difference");
    expect(difference.dataset.alignmentOp).toBe("X");
    expect(difference.dataset.queryIndex).toBe("8");
    expect(difference.textContent).toBe("T");
  });

  it("temporarily uses native textarea rendering during IME composition", () => {
    renderAnchored();
    const editor = screen.getByTestId("primer-modal-binding-editor");
    const textarea = screen.getByTestId("primer-modal-seq");
    const mirror = screen.getByTestId("primer-modal-binding-mirror");

    fireEvent.compositionStart(textarea);
    expect(editor.dataset.nativeRendering).toBe("true");
    expect(mirror.hidden).toBe(true);

    fireEvent.compositionEnd(textarea);
    expect(editor.dataset.nativeRendering).toBe("false");
    expect(mirror.hidden).toBe(false);
  });
});

describe("primer binding preview — canonical Sequence Viewer tracks", () => {
  it.each([
    {
      name: "substitution",
      edited: "ACGTTGCATCGTTGCA",
      glyph: "sequence-view-primer-base-mismatch",
      op: "X",
    },
    {
      name: "insertion",
      edited: "ACGTTGCAATCGTTGCA",
      glyph: "sequence-view-primer-insertion",
      op: "I",
    },
    {
      name: "deletion",
      edited: "ACGTTGCACGTTGCA",
      glyph: "sequence-view-primer-deletion-bridge",
      op: "D",
    },
  ])("keeps the primer visible and uses the shared $name glyph", ({ edited, glyph, op }) => {
    renderAnchored();
    fireEvent.change(screen.getByTestId("primer-modal-seq"), {
      target: { value: edited },
    });

    const preview = within(templatePreview());
    expect(preview.getByTestId("sequence-view-primer")).toBeTruthy();
    expect(preview.getByTestId(glyph).dataset.primerAlignmentOp).toBe(op);
  });

  it("renders annotations, strands, primer and template sites with the real tracks", () => {
    renderAnchored({
      template: "TTTTGAATTCACGTTGCAACGTTGCAGGGG",
      binding: "ACGTTGCAACGTTGCA",
      anchorSequence: "ACGTTGCAACGTTGCA",
      segments: [{ start: 10, end: 26 }],
      features: [{
        id: "feature-promoter",
        name: "test promoter",
        type: "promoter",
        level: "region",
        color: "#E8B333",
        start: 8,
        end: 28,
        strand: 1,
      }],
      templateReSites: [{ enzyme: "EcoRI", position: 5 }],
    });

    const preview = within(templatePreview());
    expect(preview.getByTestId("sequence-view-line")).toBeTruthy();
    expect(preview.getByTestId("sequence-view-primer")).toBeTruthy();
    expect(preview.getAllByTestId("sequence-view-strands")).toHaveLength(2);
    expect(preview.getByTestId("sequence-view-annotation").dataset.regionId)
      .toBe("feature-promoter");
    expect(preview.getAllByTestId("sequence-view-re-site")
      .some((site) => site.dataset.enzyme === "EcoRI")).toBe(true);
    expect(preview.getByTestId("sequence-view-restriction").dataset.orientation)
      .toBe("vertical");
  });

  it("keeps a tail-created EcoRI site in the PCR-product row, not the template row", () => {
    renderAnchored({ tail: "GAATTC" });

    const template = within(templatePreview());
    expect(template.queryAllByTestId("sequence-view-re-site")
      .some((site) => site.dataset.enzyme === "EcoRI")).toBe(false);
    const product = within(screen.getByTestId("primer-binding-product-preview"));
    expect(product.getAllByTestId("sequence-view-re-site")
      .some((site) => site.dataset.enzyme === "EcoRI")).toBe(true);
  });

  it("shows a restriction site created by a mismatch inside the binding region", () => {
    const anchor = "GAATTAGCAACGTTGC";
    const edited = "GAATTCGCAACGTTGC";
    renderAnchored({
      template: `TTTT${anchor}GGGG`,
      binding: anchor,
      anchorSequence: anchor,
      segments: [{ start: 4, end: 20 }],
    });

    fireEvent.change(screen.getByTestId("primer-modal-seq"), {
      target: { value: edited },
    });

    const product = within(screen.getByTestId("primer-binding-product-preview"));
    expect(product.getAllByTestId("sequence-view-re-site")
      .some((site) => site.dataset.enzyme === "EcoRI")).toBe(true);
  });

  it("shows imperfect landing biologically without the removed technical prose", () => {
    renderAnchored();
    fireEvent.change(screen.getByTestId("primer-modal-seq"), {
      target: { value: "ACGTTGCAATCGTTGCA" },
    });

    expect(screen.queryByTestId("primer-modal-tm-full")).toBeNull();
    expect(screen.getByTestId("primer-modal-tm-anchor")).toBeTruthy();
    expect(screen.getByTestId("primer-modal-tm-pcr")).toBeTruthy();
    expect(screen.queryByTestId("primer-modal-tm-conditions")).toBeNull();
    expect(screen.queryByText(/SantaLucia|X\/I\/D|вставка в праймере/i)).toBeNull();
  });
});

describe("landingPreviewLines — complete circular and long context", () => {
  it("includes every occupied row of a landing longer than two rows", () => {
    const template = "A".repeat(260);
    const lines = landingPreviewLines(template, {
      segments: [{ start: 10, end: 230 }],
      strand: 1,
      topology: "linear",
    }, 0, 60);

    expect(lines.map((line) => line.start)).toEqual([0, 60, 120, 180]);
  });

  it.each([20, 120])("keeps an explicit origin bridge for a %i bp circle", (length) => {
    const template = "A".repeat(length);
    const lines = landingPreviewLines(template, {
      segments: [{ start: length - 2, end: length }, { start: 0, end: 2 }],
      strand: 1,
      topology: "circular",
      wrapsOrigin: true,
    }, 0, 60);

    expect(lines.some((line) => line.wrapsOrigin === true)).toBe(true);
  });

  it("orders a long origin-crossing landing as high rows, bridge, then low rows", () => {
    const lines = landingPreviewLines("A".repeat(1000), {
      segments: [{ start: 950, end: 1000 }, { start: 0, end: 100 }],
      strand: 1,
      topology: "circular",
      wrapsOrigin: true,
    }, 0, 80);

    expect(lines.map((line) => (line.wrapsOrigin ? "bridge" : line.start)))
      .toEqual([880, "bridge", 0, 80]);
  });
});

describe("existing reverse primer — composed Sequence Viewer path", () => {
  it("saves a terminal trim as physical bases without synthetic deletion gaps", () => {
    const original = "TGTTATCCGCTCACAATTCCCCTATAGTGAG";
    const terminal = "CTATAGTGAG";
    const top = "CTCACTATAGGGGAATTGTGAGCGGATAACA";
    const template = `${"A".repeat(28)}${top}${"C".repeat(20)}`;
    const occurrenceKey = "primer-pesumo-reverse#site-pesumo-reverse";
    const onWritePrimer = vi.fn();

    render(
      <SequenceView
        fragments={[{
          id: "pE-SUMOpro-Kan",
          name: "pE-SUMOpro Kan",
          type: "misc_feature",
          strand: 1,
          sequence: template,
          annotations: [],
        }]}
        primers={[{
          id: "primer-pesumo-reverse",
          name: "pE-SUMOpro Kan reverse primer",
          direction: "reverse",
          tail: "",
          bindingSequence: original,
          sequence: original,
          bindingModel: "aligned-v1",
          sites: [{
            id: "site-pesumo-reverse",
            target: {
              entryId: "pE-SUMOpro-Kan",
              resourceHash: "sha256:pesumo-reverse-trim",
              topology: "circular",
            },
            location: { kind: "single", segments: [{ start: 28, end: 59 }] },
            strand: -1,
            annealedSequence: original,
            tail: "",
          }],
        }]}
        onWritePrimer={onWritePrimer}
        onSequenceEdit={() => {}}
        editable
        circular
        entryId="pE-SUMOpro-Kan"
        documentHash="sha256:pesumo-reverse-trim"
      />,
    );

    const glyph = screen.getAllByTestId("sequence-view-primer")
      .find((node) => node.dataset.primerOccurrenceKey === occurrenceKey);
    fireEvent.doubleClick(glyph);
    fireEvent.change(screen.getByTestId("primer-modal-seq"), {
      target: { value: terminal },
    });

    expect(within(templatePreview())
      .queryByTestId("sequence-view-primer-deletion-bridge")).toBeNull();
    expect(screen.getByTestId("primer-modal-annealing-status").textContent)
      .toMatch(/3′-якорь 10 нт/);
    fireEvent.click(screen.getByTestId("primer-modal-create"));
    expect(onWritePrimer).toHaveBeenCalledWith(expect.objectContaining({
      primerId: "primer-pesumo-reverse",
      direction: "reverse",
      binding: terminal,
      sequence: terminal,
      tm: calcTm(terminal),
      sites: undefined,
    }));
  }, 30_000);
});
