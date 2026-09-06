import { useEffect, useRef, useState } from "react";
import { tf } from "../../../i18n";
import SequenceLandingPreview from "../SequenceLandingPreview";
import "./PrimerBindingInspector.css";

const LETTER = /[A-Za-z]/;

function queryOperations(alignment) {
  const operations = [];
  for (const run of alignment?.runs || []) {
    if (run.op === "D") continue;
    for (let index = run.queryStart; index < run.queryEnd; index += 1) {
      operations[index] = run.op;
    }
  }
  return operations;
}

function highlightedRawSequence(value, alignment, queryOffset = 0) {
  const operations = queryOperations(alignment);
  let queryIndex = 0;
  return Array.from(String(value || "")).map((character, rawIndex) => {
    if (!LETTER.test(character)) return character;
    const currentQueryIndex = queryIndex;
    const alignmentQueryIndex = queryIndex + queryOffset;
    // A negative offset means the author typed part of the biologically
    // unpaired 5′ prefix in this helper field. It was still evaluated; show it
    // as query-only rather than pretending that the field boundary paired it.
    const op = alignmentQueryIndex < 0
      ? "I"
      : (operations[alignmentQueryIndex] || "M");
    queryIndex += 1;
    if (op !== "X" && op !== "I") return character;
    return (
      <span
        key={`${rawIndex}:${currentQueryIndex}`}
        data-testid="primer-modal-binding-difference"
        data-alignment-op={op}
        data-query-index={currentQueryIndex}
        className={`primer-binding-inspector__difference primer-binding-inspector__difference--${op.toLowerCase()}`}
      >
        {character}
      </span>
    );
  });
}

function BindingField({ value, onChange, alignment, queryOffset }) {
  const textareaRef = useRef(null);
  const mirrorRef = useRef(null);
  const [isComposing, setIsComposing] = useState(false);

  const syncMirror = () => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
    if (textarea.clientWidth > 0) mirror.style.width = `${textarea.clientWidth}px`;
    if (textarea.clientHeight > 0) mirror.style.height = `${textarea.clientHeight}px`;
  };

  useEffect(() => {
    syncMirror();
    if (typeof ResizeObserver !== "function" || !textareaRef.current) return undefined;
    const observer = new ResizeObserver(syncMirror);
    observer.observe(textareaRef.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <label className="primer-binding-inspector__field">
      {tf("primer.modal.binding-label")}
      <span
        className={`primer-binding-inspector__editor${isComposing ? " primer-binding-inspector__editor--native" : ""}`}
        data-testid="primer-modal-binding-editor"
        data-native-rendering={String(isComposing)}
      >
        <pre
          ref={mirrorRef}
          data-testid="primer-modal-binding-mirror"
          aria-hidden="true"
          hidden={isComposing}
          className="primer-binding-inspector__mirror"
        >
          {highlightedRawSequence(value, alignment, queryOffset)}
        </pre>
        <textarea
          ref={textareaRef}
          data-testid="primer-modal-seq"
          value={value}
          onChange={onChange}
          onScroll={syncMirror}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          rows={3}
          wrap="soft"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="primer-binding-inspector__textarea"
        />
      </span>
    </label>
  );
}

export default function PrimerBindingInspector({
  value, onChange, alignment, template, topology,
  queryOffset = 0,
  primer, occurrence, features = [], templateReSites = [],
  productSequence = "", productReSites = [],
  entryId = null, documentHash = null, viewSettings = {},
}) {
  return (
    <>
      <BindingField
        value={value}
        onChange={onChange}
        alignment={alignment}
        queryOffset={queryOffset}
      />
      <SequenceLandingPreview
        template={template}
        occurrence={occurrence}
        primer={primer}
        features={features}
        templateReSites={templateReSites}
        productSequence={productSequence}
        productReSites={productReSites}
        topology={topology}
        entryId={entryId}
        documentHash={documentHash}
        viewSettings={viewSettings}
      />
    </>
  );
}
