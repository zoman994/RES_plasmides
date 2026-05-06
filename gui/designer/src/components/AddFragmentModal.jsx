import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchConstructs, fetchFeatures } from '../api';
import { useStore } from '../store';
import { checkDuplicates } from '../duplicate-checker';
import { autoAnnotate, enrichWithCommonFeatures } from '../auto-annotate';
import { validateCDS } from '../cds-validation';
import { parseGenBank, isGenBankFormat } from '../genbank-parser';
import { importFeatures } from '../import-annotations';
import { reverseComplement, sanitizeSequence, IUPAC_DNA_REGEX, IUPAC_DNA_CHAR_REGEX } from '../sequence-utils';
import { detectIntrons, intronsToAnnotations, getCDNA } from '../intron-utils';
import AnnotationEditor, { PART_TYPE_GROUPS } from './AnnotationEditor';
import SequencePreview from './SequencePreview';
import { t } from '../i18n';

const COLORS = {
  CDS: '#F5A623', promoter: '#B0B0B0', terminator: '#CC0000',
  rep_origin: '#FFD700', marker: '#31AF31', misc_feature: '#6699CC',
};

/**
 * Modal for adding fragments from various sources:
 * - Paste custom sequence
 * - From PCR product / composite (tube in freezer)
 * - From existing construct (extract feature or region)
 */
export default function AddFragmentModal({ mode, onAdd, onClose }) {
  // mode: 'sequence' | 'composite' | 'construct' | 'library'
  const isLibrary = mode === 'library';
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('');
  const [needsPCR, setNeedsPCR] = useState(mode !== 'composite' && !isLibrary);
  const [type, setType] = useState(isLibrary ? 'CDS' : 'misc_feature');
  const [note, setNote] = useState('');
  const [organism, setOrganism] = useState('');
  const [organismType, setOrganismType] = useState(null); // 'prokaryote' | 'eukaryote' | null
  const [description, setDescription] = useState('');
  const [strand, setStrand] = useState(1);
  const [topology, setTopology] = useState('linear');
  const [selectedAnn, setSelectedAnn] = useState(null);
  const textareaRef = useRef(null);
  const [intronCandidates, setIntronCandidates] = useState([]);
  const [showIntronPanel, setShowIntronPanel] = useState(false);

  // Store access for duplicate checking & variant creation
  const parts = useStore(s => s.parts);
  const addPartToLib = useStore(s => s.addPart);
  const addFragmentToCanvas = useStore(s => s.addFragment);
  const importedData = useStore(s => s.importedData);
  const setImportedData = useStore(s => s.setImportedData);

  // Construct extraction state
  const [constructs, setConstructs] = useState([]);
  const [selectedConstruct, setSelectedConstruct] = useState(null);
  const [features, setFeatures] = useState([]);

  // Sub-parts for composite
  const [subParts, setSubParts] = useState([]);

  // ═══ Pre-fill from file import ═══
  useEffect(() => {
    if (importedData) {
      setName(importedData.name || '');
      setSequence(importedData.sequence || '');
      if (importedData.organism) setOrganism(importedData.organism);
      if (importedData.topology === 'circular') setTopology('circular');
      if (importedData.description) setDescription(importedData.description);
      if (importedData.annotations?.length > 0) {
        setPreviewAnnotations(importedData.annotations);
        setAutoAnnotateEnabled(false);
      }
      // Smart type detection: circular plasmids → misc_feature, else first region type
      if (importedData.topology === 'circular' && importedData.annotations?.length >= 2) {
        setType('misc_feature');
      } else if (importedData.topology === 'circular' && (importedData.sequence?.length || 0) > 3000) {
        setType('misc_feature');
      } else {
        const firstRegion = importedData.annotations?.find(a => a.level === 'region');
        if (firstRegion) setType(firstRegion.type);
      }
      setImportedData(null); // consume once
    }
  }, [importedData]);

  // HOOK-13 — cancellable fetches. Closing the modal mid-fetch warns
  // about setState on unmounted; rapid construct switching can land an
  // older fetch's features over a newer construct.
  useEffect(() => {
    if (mode !== 'construct') return undefined;
    let cancelled = false;
    fetchConstructs()
      .then((cs) => { if (!cancelled) setConstructs(cs); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (!selectedConstruct) return undefined;
    let cancelled = false;
    fetchFeatures(selectedConstruct.id)
      .then((fs) => { if (!cancelled) setFeatures(fs); })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [selectedConstruct]);

  // GenBank ORIGIN-style formatting for textarea display
  const formatSequenceDisplay = (seq) => {
    if (!seq) return '';
    const lines = [];
    for (let i = 0; i < seq.length; i += 60) {
      const num = String(i + 1).padStart(9);
      const chunk = seq.slice(i, i + 60);
      const groups = [];
      for (let j = 0; j < chunk.length; j += 10) {
        groups.push(chunk.slice(j, j + 10));
      }
      lines.push(`${num} ${groups.join(' ')}`);
    }
    return lines.join('\n');
  };

  // ═══ Duplicate detection ═══
  const duplicates = useMemo(() => {
    const cleaned = sanitizeSequence(sequence);
    if (cleaned.length < 20) return [];
    return checkDuplicates(cleaned, parts);
  }, [sequence, parts]);

  // ═══ Name duplicate detection (case-insensitive) ═══
  const nameDuplicate = useMemo(() => {
    if (!name || name.trim().length < 2) return null;
    const lower = name.trim().toLowerCase();
    return parts.find(p => p.name.toLowerCase() === lower) || null;
  }, [name, parts]);

  // ═══ Annotation preview + CDS validation (debounced) ═══
  const [autoAnnotateEnabled, setAutoAnnotateEnabled] = useState(true);
  const [previewAnnotations, setPreviewAnnotations] = useState([]);
  const [cdsWarnings, setCdsWarnings] = useState([]);

  // ═══ Manual annotations ═══
  const [manualAnnotations, setManualAnnotations] = useState([]);
  const allAnnotations = [...previewAnnotations, ...manualAnnotations];

  // ═══ GenBank auto-detection (FIX 3) ═══
  const [genbankNotice, setGenbankNotice] = useState('');

  const handleSequenceInput = (e) => {
    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    const rawText = textarea.value;

    if (isGenBankFormat(rawText)) {
      try {
        const gb = parseGenBank(rawText);
        if (gb && gb.sequence) {
          setSequence(gb.sequence);
          if (gb.name && !name) setName(gb.name);
          if (gb.organism) setOrganism(gb.organism);
          if (gb.topology === 'circular') setTopology('circular');
          const firstCDS = gb.features.find(f => f.type === 'CDS');
          if (firstCDS && !name) setType('CDS');
          const { annotations } = importFeatures(gb.features, gb.sequence.length, 'genbank');
          setPreviewAnnotations(annotations);
          setAutoAnnotateEnabled(false);
          setGenbankNotice(`GenBank: ${gb.name || 'запись'}, ${gb.features.length} фичей, ${gb.sequence.length} bp`);
          return;
        }
      } catch { /* not valid genbank, treat as sequence */ }
    }

    const cleaned = sanitizeSequence(rawText);
    setSequence(cleaned);
    setGenbankNotice('');

    // Restore cursor: count ATCG chars before cursor in raw, find same position in formatted
    const charsBeforeCursor = rawText.slice(0, cursorPos).replace(IUPAC_DNA_REGEX, '').length;
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const formatted = formatSequenceDisplay(cleaned);
      let count = 0;
      let newPos = formatted.length;
      for (let i = 0; i < formatted.length; i++) {
        if (IUPAC_DNA_CHAR_REGEX.test(formatted[i])) {
          count++;
          if (count === charsBeforeCursor) { newPos = i + 1; break; }
        }
      }
      textareaRef.current.selectionStart = newPos;
      textareaRef.current.selectionEnd = newPos;
    });
  };

  useEffect(() => {
    const cleaned = sanitizeSequence(sequence);
    if (!cleaned || cleaned.length < 3) {
      setPreviewAnnotations([]);
      setCdsWarnings([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (autoAnnotateEnabled) {
        const anns = autoAnnotate({ name: name || type, type, sequence: cleaned, organism, organismType });
        if (!cancelled) setPreviewAnnotations(anns);
        // Async enrichment with common features DB
        enrichWithCommonFeatures(cleaned, anns).then(enriched => {
          if (!cancelled && enriched.length > anns.length) {
            setPreviewAnnotations(enriched);
          }
        });
      } else {
        if (!cancelled) setPreviewAnnotations([{
          name: name || type, type, level: 'region',
          start: 0, end: cleaned.length, auto: true,
        }]);
      }
      if (type === 'CDS' || type === 'gene') {
        setCdsWarnings(validateCDS(cleaned, { organismType }));
      } else {
        setCdsWarnings([]);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sequence, type, name, organism, organismType, autoAnnotateEnabled]);

  const handleUseExisting = (existingPart) => {
    addFragmentToCanvas(existingPart);
    onClose();
  };

  const handleCreateAsVariant = (matchedPart) => {
    const cleaned = sanitizeSequence(sequence);
    addPartToLib({
      name: name || `${matchedPart.name} variant`,
      type,
      sequence: cleaned,
      length: cleaned.length,
      parentId: matchedPart.id,
      source: 'variant',
    });
    const newParts = useStore.getState().parts;
    const created = newParts[newParts.length - 1];
    if (created) addFragmentToCanvas(created);
    onClose();
  };

  const handleAddToLibrary = () => {
    const cleaned = sanitizeSequence(sequence);
    if (!name || !cleaned) return;
    addPartToLib({
      name,
      type,
      sequence: cleaned,
      length: cleaned.length,
      organism: organism || undefined,
      organismType: organismType || undefined,
      description: description || undefined,
      annotations: allAnnotations.length > 0 ? allAnnotations : undefined,
      topology,
      strand,
      source: 'manual',
    });
    onClose();
  };

  const handleAdd = () => {
    if (!name || (!sequence && mode !== 'construct')) return;
    onAdd({
      name,
      sequence: sanitizeSequence(sequence),
      length: sanitizeSequence(sequence).length,
      type,
      needsAmplification: needsPCR,
      sourceType: mode === 'composite' ? 'composite' : mode === 'construct' ? 'construct_feature' : 'sequence',
      sourceDescription: note,
      subParts: subParts.length > 0 ? subParts : undefined,
      strand: 1,
    });
    onClose();
  };

  const extractFeature = (f) => {
    setName(f.name);
    // API response (fetchFeatures) is not pipeline-sanitized — sanitize here
    setSequence(sanitizeSequence(f.sequence || ''));
    setType(f.type);
    setNote(`Extracted from ${selectedConstruct?.name}`);
    setNeedsPCR(true);
  };

  const addSubPart = () => {
    setSubParts([...subParts, { name: '', type: 'CDS', start: 0, end: 0 }]);
  };

  const titles = {
    sequence: 'Paste Custom Sequence',
    composite: 'From PCR Product / Tube',
    construct: 'Extract from Construct',
    library: 'Добавить в библиотеку',
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* ═══ HEADER — sticky top ═══ */}
        <div className="p-4 pb-3 border-b shrink-0">
        <h3 className="font-bold text-lg mb-3">{titles[mode]}</h3>

        {/* Name + type */}
        <div className="flex gap-2 mb-2 flex-wrap">
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Fragment name"
            className="flex-1 border rounded p-2 text-sm" />
          <select value={type} onChange={e => setType(e.target.value)}
            className="border rounded p-2 text-sm w-36">
            {PART_TYPE_GROUPS.map(g => (
              <optgroup key={g.labelKey} label={t(g.labelKey)}>
                {g.types.map(tp => <option key={tp} value={tp}>{t('type.' + tp)}</option>)}
              </optgroup>
            ))}
          </select>
          {isLibrary && (
            <>
              <div className="flex">
                <button type="button" onClick={() => setStrand(1)}
                  className={`text-[10px] px-2 py-1 rounded-l border ${strand === 1 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                  5'{'\u2192'}3'
                </button>
                <button type="button" onClick={() => setStrand(-1)}
                  className={`text-[10px] px-2 py-1 rounded-r border-t border-b border-r ${strand === -1 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                  3'{'\u2192'}5'
                </button>
              </div>
              <div className="flex">
                <button type="button" onClick={() => setTopology('linear')}
                  className={`text-[10px] px-2 py-1 rounded-l border ${topology === 'linear' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                  {'\u2014'} linear
                </button>
                <button type="button" onClick={() => setTopology('circular')}
                  className={`text-[10px] px-2 py-1 rounded-r border-t border-b border-r ${topology === 'circular' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500'}`}>
                  {'\u25CB'} circular
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Plasmid hint ── */}
        {topology === 'circular' && sanitizeSequence(sequence).length > 3000 && (
          <div className="text-[11px] text-blue-600 bg-blue-50 rounded px-3 py-2 mb-2">
            {'\uD83D\uDCA1'} {t('modal.plasmid_hint')} ({sanitizeSequence(sequence).length.toLocaleString()} {t('bp')}, circular)
          </div>
        )}

        {/* ── Name duplicate warning ── */}
        {nameDuplicate && (
          <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded mb-1 flex items-center justify-between">
            <span>
              {'\u26A0'} Part с именем &ldquo;{nameDuplicate.name}&rdquo; уже в библиотеке ({nameDuplicate.length} bp, {nameDuplicate.type})
            </span>
            <button onClick={() => setName(name + '_v2')}
              className="text-[9px] bg-amber-100 px-1.5 py-0.5 rounded hover:bg-amber-200 ml-2 shrink-0">
              Переименовать
            </button>
          </div>
        )}

        {/* ── Paste sequence or GenBank ── */}
        {(mode === 'sequence' || mode === 'composite' || isLibrary) && (
          <>
            <textarea
              ref={isLibrary ? textareaRef : undefined}
              value={isLibrary && sanitizeSequence(sequence) ? formatSequenceDisplay(sanitizeSequence(sequence)) : sequence}
              onChange={isLibrary ? handleSequenceInput : e => setSequence(sanitizeSequence(e.target.value))}
              placeholder={isLibrary ? t('modal.paste_sequence') : 'Paste DNA sequence (ATCG only)...'}
              className="w-full border rounded p-2 text-[11px] font-mono"
              style={{ ...(isLibrary ? { whiteSpace: 'pre', overflowX: 'auto' } : {}), maxHeight: '80px', overflowY: 'auto' }}
              rows={3} />
            <div className="flex items-center justify-between mb-1">
              {genbankNotice ? (
                <div className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded">
                  {'\uD83E\uDDEC'} {genbankNotice}
                </div>
              ) : <span />}
              {sequence && <span className="text-[10px] text-gray-400">{sanitizeSequence(sequence).length} bp</span>}
            </div>
          </>
        )}
        </div>{/* end HEADER */}

        {/* ═══ BODY — scrollable ═══ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">

        {/* ── Library-only fields ── */}
        {isLibrary && (
          <div className="space-y-2 mb-3">
            {/* Organism type toggle */}
            <div className="flex gap-1">
              {[
                { value: 'prokaryote', label: '\uD83E\uDDA0 Прокариоты', color: '#3B82F6' },
                { value: 'eukaryote', label: '\uD83C\uDF44 Эукариоты', color: '#22C55E' },
                { value: null, label: '\u2014 Не указано', color: '#6B7280' },
              ].map(opt => (
                <button key={String(opt.value)} type="button"
                  onClick={() => setOrganismType(opt.value)}
                  className={`text-[11px] px-3 py-1 rounded border transition font-medium ${
                    organismType === opt.value
                      ? 'text-white border-transparent'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={organismType === opt.value ? { backgroundColor: opt.color } : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
            <input value={organism} onChange={e => setOrganism(e.target.value)}
              placeholder="Организм (напр. A. niger, E. coli)"
              className="w-full border rounded p-2 text-sm" />
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Описание: функция, условия, особенности..."
              className="w-full border rounded p-2 text-sm h-16" />
          </div>
        )}

        {/* ── Composite: sub-parts annotation ── */}
        {mode === 'composite' && (
          <div className="p-3 bg-gray-50 rounded mb-3">
            <div className="text-xs text-gray-500 mb-2">
              What's inside this product? (optional, for annotation)
            </div>
            {subParts.map((sp, i) => (
              <div key={i} className="flex gap-1 mb-1 items-center">
                <input value={sp.name} placeholder="Name"
                  onChange={e => {
                    const n = [...subParts]; n[i] = { ...n[i], name: e.target.value };
                    setSubParts(n);
                  }}
                  className="flex-1 border rounded p-1 text-xs" />
                <select value={sp.type}
                  onChange={e => {
                    const n = [...subParts]; n[i] = { ...n[i], type: e.target.value };
                    setSubParts(n);
                  }}
                  className="border rounded p-1 text-xs w-24">
                  <option value="CDS">CDS</option>
                  <option value="promoter">Promoter</option>
                  <option value="terminator">Terminator</option>
                </select>
                <button onClick={() => setSubParts(subParts.filter((_, j) => j !== i))}
                  className="text-red-400 text-xs px-1">&times;</button>
              </div>
            ))}
            <button onClick={addSubPart}
              className="text-xs text-blue-600 mt-1">+ Add sub-part</button>
          </div>
        )}

        {/* ── Extract from construct ── */}
        {mode === 'construct' && (
          <div className="mb-3">
            <select value={selectedConstruct?.id || ''}
              onChange={e => setSelectedConstruct(constructs.find(c => c.id === e.target.value))}
              className="w-full border rounded p-2 text-sm mb-2">
              <option value="">Select construct...</option>
              {constructs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {features.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Click a feature to extract:</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {features.map(f => (
                    <button key={`${f.name}-${f.start}`} onClick={() => extractFeature(f)}
                      className="text-xs px-2 py-1 rounded border transition hover:shadow"
                      style={{
                        background: (COLORS[f.type] || '#6699CC') + '20',
                        borderColor: COLORS[f.type] || '#6699CC',
                      }}>
                      {f.name} ({f.length}bp)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual sequence paste for extracted */}
            {name && (
              <textarea value={sequence} onChange={e => setSequence(sanitizeSequence(e.target.value))}
                placeholder="Sequence (auto-filled from feature, or paste manually)"
                className="w-full border rounded p-2 text-sm font-mono h-16" />
            )}
          </div>
        )}

        {/* Note (not for library mode — it has description) */}
        {!isLibrary && (
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Note (e.g. 'tube #47 in freezer box 3')"
            className="w-full border rounded p-2 text-sm mb-3" />
        )}

        {/* PCR toggle (not for library mode) */}
        {!isLibrary && (
          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={needsPCR}
              onChange={e => setNeedsPCR(e.target.checked)} />
            <span>Needs PCR amplification</span>
            <span className="text-[10px] text-gray-400">
              {needsPCR ? '(primers will be generated)' : '(use directly from tube)'}
            </span>
          </label>
        )}

        {/* Sequence stats (for non-library modes) */}
        {!isLibrary && sequence && (
          <div className="text-xs text-gray-500">
            {sanitizeSequence(sequence).length} bp
            {subParts.length > 0 && ` · ${subParts.length} sub-parts`}
          </div>
        )}

        {/* ═══ CDS validation warnings ═══ */}
        {cdsWarnings.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {cdsWarnings.map((w, i) => (
              <div key={i} className={`p-2 rounded text-xs border ${
                w.level === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <div className="font-medium">{w.message}</div>
                {w.details && (
                  <div className="mt-1 text-[10px] opacity-80">
                    {w.details.map((d, j) => <div key={j}>{d}</div>)}
                  </div>
                )}
                {w.hint && <div className="mt-1 text-[10px] italic opacity-70">{w.hint}</div>}
                {w.actions && (
                  <div className="flex gap-1 mt-1.5">
                    {w.actions.map((a, j) => (
                      <button key={j} onClick={() => {
                        if (a.action === 'add_start_ATG') setSequence(p => 'ATG' + p);
                        else if (a.action === 'add_stop_TAA') setSequence(p => p + 'TAA');
                        else if (a.action === 'add_stop_TGA') setSequence(p => p + 'TGA');
                        else if (a.action === 'add_stop_TAG') setSequence(p => p + 'TAG');
                        else if (a.action === 'dismiss') setCdsWarnings(prev => prev.filter((_, idx) => idx !== i));
                        else if (a.action === 'detect_introns') {
                          const candidates = detectIntrons(sanitizeSequence(sequence));
                          if (candidates.length > 0) {
                            setIntronCandidates(candidates);
                            setShowIntronPanel(true);
                          } else {
                            setCdsWarnings(prev => prev.map((w2, idx) => idx !== i ? w2 : {
                              ...w2, hint: 'GT...AG интроны не обнаружены. Проверьте последовательность вручную.',
                              actions: w2.actions.filter(act => act.action !== 'detect_introns'),
                            }));
                          }
                        }
                      }}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          a.action === 'dismiss' ? 'border border-gray-200 hover:bg-gray-50 text-gray-500'
                          : w.level === 'error'
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══ Intron detection panel ═══ */}
        {showIntronPanel && intronCandidates.length > 0 && (
          <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded text-xs">
            <div className="font-semibold text-purple-700 mb-2">
              {'\uD83E\uDDEC'} {t('ann.annotations')}: {intronCandidates.length} GT...AG {intronCandidates.length === 1 ? 'кандидат' : 'кандидатов'}
            </div>
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
              {intronCandidates.map((c, ci) => (
                <div key={ci} className="flex items-center gap-2 bg-white rounded p-1.5 border border-purple-100">
                  <span className="text-purple-600 font-mono">{c.start + 1}..{c.end}</span>
                  <span className="text-gray-500">({c.length} нт)</span>
                  <span className="text-green-600">GT...AG {'\u2713'}</span>
                  {c.framePreserving && <span className="text-blue-500">frame {'\u2713'}</span>}
                  <span className="text-gray-400">-{c.removesStops?.length || '?'} стопов</span>
                  <button onClick={() => {
                    // Find parent CDS region
                    const region = allAnnotations.find(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'));
                    const ann = intronsToAnnotations([c], region?.id, 0);
                    setManualAnnotations(prev => [...prev, ...ann]);
                    setIntronCandidates(prev => prev.filter((_, idx) => idx !== ci));
                  }}
                    className="ml-auto text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded hover:bg-purple-200">
                    {t('ann.save')}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => {
                const region = allAnnotations.find(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'));
                const anns = intronsToAnnotations(intronCandidates, region?.id, 0);
                setManualAnnotations(prev => [...prev, ...anns]);
                setIntronCandidates([]);
                setShowIntronPanel(false);
              }}
                className="text-[10px] bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700">
                Принять все
              </button>
              <button onClick={() => {
                // Accept all introns then create cDNA Part
                const region = allAnnotations.find(a => a.level === 'region' && (a.type === 'CDS' || a.type === 'gene'));
                const intronAnns = intronsToAnnotations(intronCandidates, region?.id, 0);
                const cleaned = (sequence || '').replace(/[^ATCGatcg]/g, '');
                const cdnaSeq = getCDNA(cleaned, intronAnns);
                addPartToLib({
                  name: `${name || 'Part'}_cDNA`,
                  type: type || 'CDS',
                  sequence: cdnaSeq,
                  organism,
                  derivation: { type: 'intron_removal' },
                });
                setIntronCandidates([]);
                setShowIntronPanel(false);
              }}
                className="text-[10px] bg-teal-600 text-white px-3 py-1 rounded hover:bg-teal-700">
                {'\uD83E\uDDEC'} cDNA
              </button>
              <button onClick={() => { setShowIntronPanel(false); setIntronCandidates([]); }}
                className="text-[10px] text-gray-500 px-2 py-1 hover:text-gray-700">
                {t('ann.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* ═══ Unified SequencePreview ═══ */}
        {sanitizeSequence(sequence).length >= 3 && (() => {
          const cleaned = sanitizeSequence(sequence);
          const seqLen = cleaned.length;
          const displaySeq = strand === -1 ? reverseComplement(cleaned) : cleaned;
          const displayAnns = strand === -1
            ? allAnnotations.map(a => ({ ...a, start: seqLen - a.end, end: seqLen - a.start }))
            : allAnnotations;
          return (
            <>
              <SequencePreview
                sequence={displaySeq}
                annotations={displayAnns}
                selectedAnnotation={selectedAnn}
                onAnnotationClick={setSelectedAnn}
                maxHeight="200px"
              />
              {strand === -1 && (
                <div className="text-[9px] text-gray-400 mb-1">{'↩'} Комплементарная цепь (антисенс)</div>
              )}
            </>
          );
        })()}

        {/* ═══ Annotation list + add form ═══ */}
        {sanitizeSequence(sequence).length >= 3 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500 font-semibold">
                {t('ann.annotations')}: {allAnnotations.length}
              </span>
              <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={autoAnnotateEnabled}
                  onChange={e => setAutoAnnotateEnabled(e.target.checked)}
                  className="w-3 h-3" />
                {t('modal.auto_annotate')}
              </label>
            </div>
            <AnnotationEditor
              annotations={allAnnotations}
              seqLength={sanitizeSequence(sequence).length}
              onChange={(newAnns) => {
                const auto = newAnns.filter(a => a.auto || a.source === 'import');
                const manual = newAnns.filter(a => !a.auto && a.source !== 'import');
                setPreviewAnnotations(auto);
                setManualAnnotations(manual);
              }}
              onSelect={setSelectedAnn}
              selectedAnnotation={selectedAnn}
              compact
              hideBar
            />
          </div>
        )}

        {/* ═══ Common features detected ═══ */}
        {allAnnotations.filter(a => a.source === 'common_db').length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3 mb-3 border border-blue-200">
            <div className="text-xs font-medium text-blue-700 mb-1">
              {'\uD83D\uDD0D'} {t('ann.annotations')}: {allAnnotations.filter(a => a.source === 'common_db').length} {t('ann.auto')}
            </div>
            {allAnnotations.filter(a => a.source === 'common_db').map((a, i) => (
              <div key={i} className="text-[11px] text-blue-600">
                {a.name} ({t('type.' + a.type)}) — {a.start + 1}..{a.end}
                {a.identity != null && ` (${(a.identity * 100).toFixed(0)}%)`}
              </div>
            ))}
          </div>
        )}

        {/* ═══ Duplicate warnings ═══ */}
        {duplicates.length > 0 && (
          <div className="mb-3 space-y-2">
            {duplicates.map((dup, i) => {
              // 🔴 Exact match (100%)
              if (dup.match === 'exact') {
                return (
                  <div key={i} className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                    <div className="text-red-700 font-medium mb-1">
                      {'🔴'} {dup.message}
                    </div>
                    <button onClick={() => handleUseExisting(dup.part)}
                      className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded hover:bg-red-200">
                      Использовать существующий
                    </button>
                  </div>
                );
              }
              // 🟡 >95% homology or substring
              if (dup.identity > 95) {
                return (
                  <div key={i} className="p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                    <div className="text-amber-700 font-medium mb-1">
                      {'🟡'} {dup.message}
                    </div>
                    <div className="flex gap-1 mt-1">
                      <button onClick={() => handleCreateAsVariant(dup.part)}
                        className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded hover:bg-amber-200">
                        Создать как вариант
                      </button>
                      <button onClick={handleAdd}
                        className="text-[10px] border border-gray-200 px-2 py-0.5 rounded hover:bg-gray-50">
                        Добавить как новый
                      </button>
                    </div>
                  </div>
                );
              }
              // 🟢 >90% informational
              return (
                <div key={i} className="p-2 bg-green-50 border border-green-200 rounded text-xs">
                  <div className="text-green-700">
                    {'🟢'} {dup.message}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        </div>{/* end BODY */}

        {/* ═══ FOOTER — sticky bottom ═══ */}
        <div className="p-4 pt-3 border-t shrink-0 flex gap-2">
          {isLibrary ? (
            <button onClick={handleAddToLibrary} disabled={!name || !sanitizeSequence(sequence)}
              className="flex-1 bg-green-600 text-white rounded py-2 text-sm font-semibold
                         disabled:opacity-40 hover:bg-green-700 transition">
              {'📦'} {t('modal.save_to_library')}
            </button>
          ) : (
            <button onClick={handleAdd} disabled={!name || !sanitizeSequence(sequence)}
              className="flex-1 bg-blue-600 text-white rounded py-2 text-sm font-semibold
                         disabled:opacity-40 hover:bg-blue-700 transition">
              Add to assembly
            </button>
          )}
          <button onClick={onClose}
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50">
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
