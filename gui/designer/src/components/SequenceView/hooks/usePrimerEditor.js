import { useCallback, useMemo, useState } from 'react';
import {
  buildPrimerFromSelection,
  selectedOccurrencesFor,
} from '../../../lib/primer-live-workflow';

/** Owns the anchored create/edit draft used by SequenceView's primer modal. */
export function usePrimerEditor({
  fullSeq,
  circular,
  entryId,
  documentHash,
  primers,
  selectedPrimers,
  onWritePrimer,
  onReuseLabPrimer,
}) {
  const [primerDraft, setPrimerDraft] = useState(null);
  const topology = circular ? 'circular' : 'linear';

  const requestWritePrimer = useCallback(({ direction, start, end }) => {
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const dir = direction === 'reverse' ? 'reverse' : 'forward';
    const record = buildPrimerFromSelection({
      template: fullSeq, topology, start: lo, end: hi, direction: dir, entryId, documentHash,
    });
    if (!record) return;
    setPrimerDraft({
      direction: dir,
      start: lo,
      end: hi,
      sequence: record.sequence,
      tail: record.tail,
      binding: record.bindingSequence,
      bindingModel: record.bindingModel,
      anchorSites: record.sites,
      sites: record.sites,
      schemaVersion: record.schemaVersion,
      sequenceSource: record.sequenceSource,
    });
  }, [documentHash, entryId, fullSeq, topology]);

  const buildPrimerDraft = useCallback(({ direction, start, end }) => {
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const record = buildPrimerFromSelection({
      template: fullSeq, topology, start: lo, end: hi, direction, entryId, documentHash,
    });
    if (!record) return null;
    return {
      direction: record.direction,
      start: lo,
      end: hi,
      name: '',
      sequence: record.sequence,
      tail: record.tail,
      binding: record.bindingSequence,
      bindingModel: record.bindingModel,
      sites: record.sites,
      schemaVersion: record.schemaVersion,
      sequenceSource: record.sequenceSource,
    };
  }, [documentHash, entryId, fullSeq, topology]);

  const selectedOccurrences = useMemo(
    () => selectedOccurrencesFor(selectedPrimers, primers, {
      template: fullSeq, entryId, documentHash, topology,
    }),
    [selectedPrimers, primers, fullSeq, entryId, documentHash, topology],
  );

  const primersById = useMemo(() => {
    const out = {};
    for (const primer of primers || []) if (primer?.id) out[primer.id] = primer;
    return out;
  }, [primers]);

  const onReuseLabPrimerWithDocument = useCallback((record, context) => {
    if (typeof onReuseLabPrimer !== 'function') return undefined;
    return onReuseLabPrimer(record, { ...context, entryId, documentHash });
  }, [onReuseLabPrimer, entryId, documentHash]);

  const onPrimerDoubleClick = useCallback((hit) => {
    if (!onWritePrimer || !hit) return;
    const record = primersById[hit.id] || {};
    const known = record.id ? record : hit;
    const direction = (known.direction || hit.direction) === 'reverse' ? 'reverse' : 'forward';
    const tail = typeof known.tail === 'string'
      ? known.tail
      : (typeof hit.tail === 'string' ? hit.tail : '');
    const binding = known.bindingSequence || hit.bindingSequence || undefined;
    const clickedAnchorSites = hit._evidence === 'source' && hit._occKey && record.id
      ? (Array.isArray(record.sites) ? record.sites : []).filter(
        (site) => `${record.id}#${site?.id}` === hit._occKey,
      )
      : [];
    setPrimerDraft({
      primerId: hit.id || record.id || null,
      direction,
      start: hit.start,
      end: hit.end,
      sequence: String(known.sequence || hit.sequence || binding || '').toUpperCase(),
      name: known.name || hit.name || '',
      tail,
      binding,
      bindingModel: record.bindingModel || null,
      anchorSites: clickedAnchorSites.length ? clickedAnchorSites : null,
      modifications: record.modifications,
      schemaVersion: record.schemaVersion,
      sequenceSource: record.sequenceSource,
    });
  }, [onWritePrimer, primersById]);

  const closePrimerDraft = useCallback(() => setPrimerDraft(null), []);
  const submitPrimerDraft = useCallback(({
    name, sequence, direction, tail, binding, bindingModel, sites, tm,
  }) => {
    if (!primerDraft || typeof onWritePrimer !== 'function') return;
    onWritePrimer({
      primerId: primerDraft.primerId,
      direction,
      start: primerDraft.start,
      end: primerDraft.end,
      name,
      sequence,
      tail,
      binding,
      bindingModel,
      sites: sites || primerDraft.sites,
      tm,
      schemaVersion: primerDraft.schemaVersion,
      sequenceSource: primerDraft.sequenceSource,
      modifications: primerDraft.modifications,
    });
    setPrimerDraft(null);
  }, [onWritePrimer, primerDraft]);

  return {
    primerDraft,
    requestWritePrimer,
    buildPrimerDraft,
    selectedOccurrences,
    primersById,
    onReuseLabPrimerWithDocument,
    onPrimerDoubleClick,
    closePrimerDraft,
    submitPrimerDraft,
  };
}
