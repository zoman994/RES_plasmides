/**
 * PromoteToCommonModal — «Add to common features» (SPEC_COMMON_FEATURES
 * DEC-CF-04/05). Opened by SequenceView when the biolog promotes a matched
 * region feature. Pre-filled with the region's name / type / coding-strand
 * sequence (strand baked at draft time). Editable name / type / ПСО.
 *
 * Live dedup probe (`checkCommonDuplicate`): a true PSO match blocks Add with
 * an error banner; a bare name-collision shows a non-blocking warning (the
 * biolog may add it as a variant). Built on the PrimerFromSelectionModal
 * shell (portal + fixed overlay + stopPropagation + Esc) so it behaves like
 * the existing selection modals.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { STRINGS } from "../../../lib/strings";

const S = STRINGS.commonFeatures;

const TYPE_OPTIONS = [
  'CDS', 'marker', 'reporter', 'promoter', 'terminator', 'rep_origin',
  'primer_bind', 'protein_bind', 'RBS', 'polyA_signal', 'enhancer',
  'LTR', 'sig_peptide', 'misc_feature',
];

function cleanDna(s) {
  return String(s || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
}

export default function PromoteToCommonModal({ draft, checkCommonDuplicate, onCreate, onClose }) {
  const [name, setName] = useState(draft.name || "");
  const [type, setType] = useState(draft.type || "misc_feature");
  const [sequence, setSequence] = useState(draft.sequence || "");
  const [verdict, setVerdict] = useState(null);
  const [busy, setBusy] = useState(false);

  const cleanSeq = cleanDna(sequence);

  // Live dedup probe — re-run when the identity-bearing fields change.
  useEffect(() => {
    let cancelled = false;
    if (typeof checkCommonDuplicate !== "function" || cleanSeq.length < 20) {
      setVerdict(null);
      return undefined;
    }
    Promise.resolve(checkCommonDuplicate({ name, type, sequence: cleanSeq }))
      .then((v) => { if (!cancelled) setVerdict(v); })
      .catch(() => { if (!cancelled) setVerdict(null); });
    return () => { cancelled = true; };
  }, [name, type, cleanSeq, checkCommonDuplicate]);

  const isDup = !!verdict?.duplicate;
  const isNameWarn = !isDup && verdict?.by === "name";

  const onModalKeyDown = (e) => {
    if (e.key === "Escape") onClose();
    e.stopPropagation();
  };
  const stopPtr = (e) => e.stopPropagation();

  const submit = async () => {
    if (isDup || busy) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), type, sequence: cleanSeq });
    } finally {
      setBusy(false);
    }
  };

  const typeOptions = TYPE_OPTIONS.includes(type) ? TYPE_OPTIONS : [type, ...TYPE_OPTIONS];
  const isProteinType = type === 'CDS' || type === 'marker' || type === 'reporter';

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      data-testid="promote-to-common-modal"
      onClick={onClose}
      onPointerDown={stopPtr}
      onPointerUp={stopPtr}
      onPointerMove={stopPtr}
      onContextMenu={stopPtr}
      onKeyDown={onModalKeyDown}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(28,25,23,0.32)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, background: "var(--surface-1)", color: "var(--text-primary)",
          border: "1px solid var(--border-subtle)", borderRadius: 8,
          boxShadow: "0 8px 28px rgba(28,25,23,0.24)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>{S.modalTitle}</strong>
          <button type="button" data-testid="promote-modal-cancel-x" onClick={onClose} style={ghostBtn}>✕</button>
        </div>

        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={lbl}>
            {S.fieldName}
            <input
              data-testid="promote-modal-name"
              type="text"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inp}
            />
          </label>

          <label style={lbl}>
            {S.fieldType}
            <select
              data-testid="promote-modal-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={inp}
            >
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label style={lbl}>
            {S.fieldSequence}
            <textarea
              data-testid="promote-modal-seq"
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              rows={4}
              style={{
                width: "100%", marginTop: 4, fontFamily: "var(--font-mono, monospace)",
                fontSize: 12, padding: 8, border: "1px solid var(--border-subtle)",
                borderRadius: 4, background: "var(--surface-2)", color: "var(--text-primary)",
                resize: "vertical", outline: "none",
              }}
            />
          </label>

          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            {cleanSeq.length} нт{isProteinType ? ` · ${S.proteinNote}` : ""}
          </div>

          {isDup && (
            <div data-testid="promote-modal-dup" style={banner("var(--danger-bg, #fef2f2)", "var(--danger-text, #b91c1c)")}>
              {S.dupBlocked(verdict.by)}
            </div>
          )}
          {isNameWarn && (
            <div data-testid="promote-modal-warn" style={banner("var(--warning-bg, #fffbeb)", "var(--warning-text, #92400e)")}>
              {S.nameWarning(name.trim())}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="promote-modal-cancel" onClick={onClose} style={ghostBtn}>{S.cancel}</button>
          <button
            type="button"
            data-testid="promote-modal-confirm"
            onClick={submit}
            disabled={isDup || busy || cleanSeq.length < 20}
            style={{ ...primaryBtn, opacity: (isDup || busy || cleanSeq.length < 20) ? 0.5 : 1 }}
          >{S.confirm}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const lbl = { display: "flex", flexDirection: "column", fontSize: 11, color: "var(--text-secondary)" };
const inp = {
  marginTop: 4, fontSize: 12, padding: "5px 8px", border: "1px solid var(--border-subtle)",
  borderRadius: 4, background: "var(--surface-2)", color: "var(--text-primary)", outline: "none",
};
const ghostBtn = {
  fontSize: 11, padding: "4px 10px", background: "transparent",
  border: "1px solid var(--border-subtle)", borderRadius: 4, cursor: "pointer", color: "var(--text-secondary)",
};
const primaryBtn = {
  fontSize: 11.5, padding: "5px 16px", background: "var(--accent-500, #b85c3e)",
  color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600,
};
function banner(bg, color) {
  return { fontSize: 11, padding: "6px 8px", borderRadius: 4, background: bg, color };
}
