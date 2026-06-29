/**
 * build-selection-menu-items — extra items for the SequenceView
 * selection context menu (create/edit/delete region, annotate, blast,
 * primer fwd/rev). Extracted verbatim from SequenceView/index.jsx
 * (size-budget decomposition, 2026-05-16) — pure builder, behavior
 * unchanged; returns the items array or null.
 */
import { STRINGS } from "../../../lib/strings";
import { generateAnnotationId } from "../../../lib/annotation-edit.js";
import { TRANSLATABLE_TYPES } from "../constants.js";

const ANN_EDIT_STRINGS = STRINGS.importer.annotationEdit;

export function buildSelectionMenuItems({
  contextMenu,
  caretAnchor,
  caretPos,
  annotations,
  setContextMenu,
  onEditKeyDown,
  onAnnotationEdit,
  onOpenAnnotator,
  onBlastSelection,
  onWritePrimer,
  onCreatePiece,
  // SPEC_COMMON_FEATURES DEC-CF-05 — consumer-gated «Add to common features».
  // Rides the same matchedRegion rail as edit/del; absent prop ⇒ no item, so
  // Annotator-preview / Assembly / PCR viewers are unaffected by construction.
  onPromoteToCommon,
  // FEAT-EXTRACT — consumer-gated «extract this feature to a new Library entry»
  // (spliced cDNA / protein). Same matchedRegion rail; absent prop ⇒ no item.
  onExtractFeature,
}) {
  // Build extra context-menu items lazily so we don't
  // re-allocate on every render. K3 wires «Создать
  // аннотацию» / «Удалить аннотацию» / «Редактировать»
  // here — biolog can right-click on a selection and reach
  // the same edit ops as the H / Del / E hotkeys. K9 will
  // append «Аннотировать выделение...» as a separator-
  // delimited group.
  if (!contextMenu) return null;
  const a = (typeof caretAnchor === "number" && Number.isFinite(caretAnchor)) ? caretAnchor : null;
  const f = (typeof caretPos === "number" && Number.isFinite(caretPos)) ? caretPos : null;
  if (a == null || f == null || a === f) return null;
  const selStart = Math.min(a, f);
  const selEnd = Math.max(a, f);
  const matchedRegion = annotations.find(
    (x) => x && x.level === "region" && x.start === selStart && x.end === selEnd,
  );
  const items = [];
  items.push({
    key: "create",
    label: ANN_EDIT_STRINGS.contextMenuCreateRegion,
    onClick: () => {
      const menuX = contextMenu.x;
      const menuY = contextMenu.y;
      setContextMenu(null);
      // Open the create popup at the menu's last position
      // (where the biolog right-clicked) instead of
      // synthesizing an H-key dispatch — that route would
      // anchor the popup near the line's right edge,
      // which is far from where the cursor was. Direct
      // call into useSelectionEdit's setter would be
      // cleaner; until that surface is exposed, the H
      // pathway falls back to the line-edge anchor which
      // is still better than the corner.
      onEditKeyDown({
        key: "h",
        preventDefault: () => {},
        _ctxAnchor: { x: menuX, y: menuY },
      });
    },
  });
  if (matchedRegion) {
    items.push({
      key: "edit",
      label: ANN_EDIT_STRINGS.contextMenuEditRegion,
      onClick: () => {
        setContextMenu(null);
        onEditKeyDown({ key: "e", preventDefault: () => {} });
      },
    });
    items.push({
      key: "delete",
      label: ANN_EDIT_STRINGS.contextMenuDeleteRegion,
      onClick: () => {
        setContextMenu(null);
        // Bug-rush #6 — imported annotations may have no id;
        // resolve to the deterministic backfill so the
        // dispatch lands on the right entry.
        const id = matchedRegion.id || generateAnnotationId(matchedRegion);
        onAnnotationEdit?.({ kind: "delete", id });
      },
    });
    // SPEC_COMMON_FEATURES DEC-CF-05 — «Add to common features». Gated on the
    // matched region (so we have a name/type/range to promote) AND the
    // consumer prop, like edit/del above.
    if (typeof onPromoteToCommon === "function") {
      items.push({
        key: "promote-common",
        label: STRINGS.commonFeatures.promoteMenuItem,
        onClick: () => {
          setContextMenu(null);
          onPromoteToCommon({ region: matchedRegion, start: selStart, end: selEnd });
        },
      });
    }
    // FEAT-EXTRACT — «Извлечь в библиотеку» (spliced cDNA / protein → new entry).
    // The host resolves introns + splices + creates the entry; here we just hand
    // it the matched region.
    if (typeof onExtractFeature === "function") {
      items.push({
        key: "extract-feature",
        label: "Извлечь в библиотеку",
        onClick: () => {
          setContextMenu(null);
          onExtractFeature({ region: matchedRegion, start: selStart, end: selEnd });
        },
      });
    }
  }
  // «Отметить как интрон» — manual splice marking (Игорь: «выделил → отметить
  // как интрон»). Only meaningful inside a translatable region (CDS/gene),
  // since an intron splices its parent; rides the existing onAnnotationEdit
  // create rail (absent in read-only viewers ⇒ no item). The detail intron is
  // linked to the parent CDS, so the AA track re-renders the spliced protein.
  if (typeof onAnnotationEdit === "function") {
    const parentCds = annotations.find(
      (x) =>
        x && x.level === "region" && TRANSLATABLE_TYPES.has(x.type) &&
        x.start <= selStart && x.end >= selEnd &&
        !(x.start === selStart && x.end === selEnd),
    );
    if (parentCds) {
      items.push({
        key: "mark-intron",
        label: "Отметить как интрон",
        onClick: () => {
          setContextMenu(null);
          onAnnotationEdit({
            kind: "create",
            payload: {
              type: "intron",
              level: "detail",
              regionId: parentCds.id || generateAnnotationId(parentCds),
              start: selStart,
              end: selEnd,
              strand: parentCds.strand === -1 ? -1 : 1,
              name: "интрон",
            },
          });
        },
      });
    }
  }
  // K9 — «Аннотировать выделение...» entry. Opens the
  // fullscreen Annotator with a region-scoped run on the
  // current selection. Requires onOpenAnnotator to be
  // wired by the consumer.
  if (typeof onOpenAnnotator === "function") {
    items.push({
      key: "annotate",
      label: ANN_EDIT_STRINGS.contextMenuAnnotate,
      onClick: () => {
        setContextMenu(null);
        onOpenAnnotator({ kind: "region", region: { start: selStart, end: selEnd } });
      },
    });
  }
  // Sprint M-X.3 follow-up — biolog: «выдлять последовательность
  // - а дальше уже эту последоватность дать возможность
  // бластить». Embedded Annotator wires this to Level-3 BLAST
  // with a region override; SingleInspector outside the
  // Annotator leaves it unwired.
  if (typeof onBlastSelection === "function") {
    items.push({
      key: "blast",
      label: ANN_EDIT_STRINGS.contextMenuBlast,
      onClick: () => {
        setContextMenu(null);
        onBlastSelection({ start: selStart, end: selEnd });
      },
    });
  }
  // V74 — PCR primer-writing from the selected range (same
  // consumer-gated pattern as blast/annotate above).
  if (typeof onWritePrimer === "function") {
    items.push({
      key: "primer-fwd",
      label: "Прямой праймер",
      shortcut: "Ctrl+R",
      onClick: () => {
        setContextMenu(null);
        onWritePrimer({ direction: "forward", start: selStart, end: selEnd });
      },
    });
    items.push({
      key: "primer-rev",
      label: "Обратный праймер",
      shortcut: "Ctrl+Alt+R",
      onClick: () => {
        setContextMenu(null);
        onWritePrimer({ direction: "reverse", start: selStart, end: selEnd });
      },
    });
  }
  // T5 DEC-T5-01 — «Отметить как кусок» (same consumer-gated pattern as
  // onWritePrimer; absent prop ⇒ no item, so Library/Importer/Annotator
  // standalone views are unaffected).
  if (typeof onCreatePiece === "function") {
    items.push({
      key: "piece-create",
      label: STRINGS.canvasSkeleton.pieces.contextMenu.createFromSelection,
      onClick: () => {
        setContextMenu(null);
        onCreatePiece({
          origin: "selection",
          rangeStart: selStart,
          rangeEnd: selEnd,
          orientation: "forward",
        });
      },
    });
  }
  return items;
}
