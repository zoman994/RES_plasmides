/**
 * AnnotationEditor — tree view with SBOL icons, inline editing, collapsible regions.
 *
 * Tree structure: regions at root, details/points nested inside their parent region.
 * SBOL Visual glyphs for each annotation type.
 * Inline editing: click ✎ to edit name/type/coordinates.
 * All UI strings via t() for i18n.
 */
import { useState } from 'react';
import { ANNOTATION_COLORS } from '../auto-annotate';
import { getRegions } from '../annotation-model';
import { generateRegionId } from '../domain-detection';
import { SBOLIcon } from '../sbol-glyphs';
import { t } from '../i18n';

// ═══ Type → Level mapping ═══
export const TYPE_TO_LEVEL = {
  // Coding
  CDS: 'region', gene: 'region', reporter: 'region', marker: 'region',
  // Regulatory
  promoter: 'region', terminator: 'region', enhancer: 'region',
  '5UTR': 'region', '3UTR': 'region', IRES: 'region', insulator: 'region',
  RBS: 'detail', Kozak: 'detail', polyA_signal: 'detail',
  // Structural
  signal_peptide: 'detail', propeptide: 'detail', tag: 'detail',
  linker: 'detail', T2A: 'detail', NLS: 'detail', intron: 'detail',
  MCS: 'region',
  // Domains
  catalytic: 'detail', binding: 'detail', domain: 'detail',
  cleavage_site: 'detail', active_site: 'detail',
  core_promoter: 'detail', poly_a: 'detail', stem_loop: 'detail',
  // Replication & Recombination
  rep_origin: 'region', ARS_CEN: 'region',
  loxP: 'region', FRT: 'region', homology_arm: 'region',
  // RNA
  gRNA: 'region', ncRNA: 'region', aptamer: 'region',
  // Other
  regulatory: 'region', fusion: 'region', misc_feature: 'region', spacer: 'region',
  // Points
  restriction_site: 'point', start_codon: 'point', stop_codon: 'point',
  variation: 'point', primer_bind: 'point', mutation: 'point',
};

// Grouped type options for <select> — labels via i18n
export const TYPE_GROUPS = [
  { labelKey: 'typegroup.coding', types: ['CDS', 'reporter', 'marker'] },
  { labelKey: 'typegroup.regulatory', types: [
    'promoter', 'terminator', 'enhancer', '5UTR', '3UTR',
    'RBS', 'Kozak', 'IRES', 'polyA_signal', 'insulator',
  ]},
  { labelKey: 'typegroup.structural', types: [
    'signal_peptide', 'propeptide', 'tag', 'linker', 'T2A', 'NLS', 'intron', 'MCS',
  ]},
  { labelKey: 'typegroup.replication', types: [
    'rep_origin', 'ARS_CEN', 'loxP', 'FRT', 'homology_arm',
  ]},
  { labelKey: 'typegroup.rna', types: ['gRNA', 'ncRNA', 'aptamer'] },
  { labelKey: 'typegroup.other', types: [
    'catalytic', 'binding', 'domain', 'active_site', 'cleavage_site',
    'spacer', 'misc_feature',
  ]},
  { labelKey: 'typegroup.points', types: [
    'restriction_site', 'start_codon', 'stop_codon', 'mutation', 'variation', 'primer_bind',
  ]},
];

// For Part type select (excludes point markers)
export const PART_TYPE_GROUPS = TYPE_GROUPS.filter(g => g.labelKey !== 'typegroup.points');

/**
 * @param {Object} props
 * @param {Array}  props.annotations
 * @param {number} props.seqLength
 * @param {Function} props.onChange
 * @param {boolean} [props.compact]
 * @param {boolean} [props.readOnly]
 * @param {boolean} [props.hideBar]
 * @param {Function} [props.onSelect]
 * @param {Object}  [props.selectedAnnotation]
 */
export default function AnnotationEditor({
  annotations = [], seqLength = 0, onChange, compact, readOnly, hideBar,
  onSelect, selectedAnnotation,
}) {
  const [collapsed, setCollapsed] = useState(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState('CDS');
  const [addStart, setAddStart] = useState('');
  const [addEnd, setAddEnd] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);
  const [editData, setEditData] = useState({ name: '', type: '', start: '', end: '' });

  const regions = getRegions(annotations);
  const sz = compact ? 'text-[9px]' : 'text-[10px]';

  // Build tree: for each region, find children (details + points inside it)
  function getChildren(region) {
    return annotations.filter(a => {
      if (a === region || a.level === 'region') return false;
      // By regionId
      if (a.regionId && a.regionId === region.id) return true;
      // By coordinate containment
      if (!a.regionId && a.start >= region.start && a.end <= region.end) return true;
      return false;
    });
  }

  // Orphans: annotations not in any region and not regions themselves
  const assignedSet = new Set();
  regions.forEach(r => getChildren(r).forEach(c => assignedSet.add(c)));
  const orphans = annotations.filter(a => a.level !== 'region' && !assignedSet.has(a));

  const toggleCollapse = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = (ann) => onChange(annotations.filter(a => a !== ann));

  const startEdit = (ann, idx) => {
    setEditingIdx(idx);
    setEditData({
      name: ann.name || '',
      type: ann.type || '',
      start: String(ann.start + 1),
      end: String(ann.end),
    });
  };

  const saveEdit = (annIdx) => {
    const s = parseInt(editData.start, 10);
    const e = parseInt(editData.end, 10);
    if (!editData.name || isNaN(s) || isNaN(e) || s > e) return;
    const level = TYPE_TO_LEVEL[editData.type] || 'detail';
    const updated = annotations.map((a, i) => {
      if (i !== annIdx) return a;
      const patched = { ...a, name: editData.name, type: editData.type, start: s - 1, end: e, level };
      delete patched.auto; // edited → no longer auto
      if (level === 'region' && !patched.id) patched.id = generateRegionId();
      return patched;
    });
    onChange(updated);
    setEditingIdx(null);
  };

  const handleAdd = () => {
    const s = parseInt(addStart, 10);
    const e = parseInt(addEnd, 10);
    if (!addName || isNaN(s) || isNaN(e) || s > e) return;
    const level = TYPE_TO_LEVEL[addType] || 'detail';
    const newAnn = { name: addName, type: addType, start: s - 1, end: e, level };
    if (level === 'region') newAnn.id = generateRegionId();
    else if (level === 'detail') {
      const parent = regions.find(r => (s - 1) >= r.start && e <= r.end);
      if (parent) newAnn.regionId = parent.id;
    }
    onChange([...annotations, newAnn]);
    setAddName(''); setAddStart(''); setAddEnd('');
    setShowAdd(false);
  };

  const annIdx = (ann) => annotations.indexOf(ann);
  const isSel = (ann) => selectedAnnotation && ann === selectedAnnotation;

  // ── Row renderer ──
  const Row = ({ ann, indent, isLast }) => {
    const idx = annIdx(ann);
    const editing = editingIdx === idx;
    const color = ann.color || ANNOTATION_COLORS[ann.type] || ANNOTATION_COLORS.misc;

    if (editing) {
      return (
        <div className={`flex items-center gap-1 ${sz} py-1 ${indent ? 'pl-5' : 'px-1'}`}>
          <SBOLIcon type={editData.type} size={14} color={ANNOTATION_COLORS[editData.type] || '#999'} />
          <select value={editData.type} onChange={e => setEditData(d => ({ ...d, type: e.target.value }))}
            className={`${sz} border rounded px-1 py-0.5 w-24`}>
            {TYPE_GROUPS.map(g => (
              <optgroup key={g.labelKey} label={t(g.labelKey)}>
                {g.types.map(tp => <option key={tp} value={tp}>{t('type.' + tp)}</option>)}
              </optgroup>
            ))}
          </select>
          <input value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
            className={`flex-1 ${sz} border rounded px-1 py-0.5 min-w-0`} />
          <input type="number" value={editData.start} onChange={e => setEditData(d => ({ ...d, start: e.target.value }))}
            className={`w-12 ${sz} border rounded px-1 py-0.5`} min={1} />
          <span className="text-gray-300">..</span>
          <input type="number" value={editData.end} onChange={e => setEditData(d => ({ ...d, end: e.target.value }))}
            className={`w-12 ${sz} border rounded px-1 py-0.5`} min={1} max={seqLength} />
          <button onClick={() => saveEdit(idx)}
            className={`${sz} bg-blue-600 text-white px-1.5 py-0.5 rounded`}>OK</button>
          <button onClick={() => setEditingIdx(null)}
            className={`${sz} text-gray-400`}>{'\u2715'}</button>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-1.5 ${sz} py-0.5 ${indent ? 'pl-5' : 'px-1'} rounded cursor-pointer group/ann
        ${isSel(ann) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
        onClick={() => onSelect?.(ann)}>
        <SBOLIcon type={ann.type} size={compact ? 12 : 14} color={color} />
        <span className="text-gray-400 truncate" style={{ width: compact ? '3.5rem' : '4rem', flexShrink: 0 }}>{ann.type}</span>
        <span className="flex-1 truncate font-medium text-gray-700">{ann.name}</span>
        <span className="text-gray-400 shrink-0 tabular-nums">{ann.start + 1}..{ann.end}</span>
        {ann.auto && <span className={`${compact ? 'text-[7px]' : 'text-[8px]'} px-1 rounded bg-gray-100 text-gray-400`}>{t('ann.auto')}</span>}
        {!readOnly && (
          <>
            <button onClick={e => { e.stopPropagation(); startEdit(ann, idx); }}
              className="text-gray-300 hover:text-blue-500 opacity-0 group-hover/ann:opacity-100 shrink-0"
              title={t('ann.edit')}>{'\u270E'}</button>
            <button onClick={e => { e.stopPropagation(); handleDelete(ann); }}
              className="text-gray-300 hover:text-red-500 opacity-0 group-hover/ann:opacity-100 shrink-0"
              title={t('ann.delete')}>{'\u2715'}</button>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* ── Annotation bar ── */}
      {!hideBar && annotations.length > 0 && seqLength > 0 && (
        <div className="relative h-5 rounded overflow-hidden border mb-1.5 bg-gray-100">
          {annotations.filter(a => a.level !== 'point').map((a, i) => {
            const left = (a.start / seqLength) * 100;
            const width = Math.max(1, ((a.end - a.start) / seqLength) * 100);
            const color = a.color || ANNOTATION_COLORS[a.type] || ANNOTATION_COLORS.misc;
            const opacity = a.level === 'region' ? 0.5 : 0.85;
            return (
              <div key={i} className="absolute top-0 h-full flex items-center justify-center text-[6px] text-white font-medium truncate px-0.5 cursor-pointer"
                style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, opacity }}
                title={`${a.name}: ${a.start + 1}..${a.end} (${a.level})`}
                onClick={() => onSelect?.(a)}>
                {width > 10 ? a.name : ''}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tree list ── */}
      <div className={`space-y-0.5 overflow-y-auto ${compact ? 'max-h-[120px]' : 'max-h-[180px]'}`}>
        {regions.map((region, ri) => {
          const children = getChildren(region);
          const hasChildren = children.length > 0;
          const isCollapsed = collapsed.has(region.id);
          const regionColor = ANNOTATION_COLORS[region.type] || '#999';

          return (
            <div key={region.id || ri}>
              {/* Region row */}
              <div className="flex items-center">
                {hasChildren ? (
                  <button onClick={() => toggleCollapse(region.id)}
                    className="w-4 text-[9px] text-gray-400 hover:text-gray-600 shrink-0 text-center select-none">
                    {isCollapsed ? '\u25B6' : '\u25BC'}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <Row ann={region} />
                </div>
                {isCollapsed && hasChildren && (
                  <span className={`${compact ? 'text-[7px]' : 'text-[8px]'} text-gray-400 bg-gray-100 px-1 rounded mr-1`}>
                    +{children.length}
                  </span>
                )}
              </div>

              {/* Children (details + points inside region) */}
              {hasChildren && !isCollapsed && (
                <div className="ml-2 border-l-2 pl-0" style={{ borderColor: regionColor + '40' }}>
                  {children.map((child, ci) => (
                    <Row key={ci} ann={child} indent isLast={ci === children.length - 1} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Orphan annotations (not inside any region) */}
        {orphans.map((o, i) => (
          <div key={`orphan-${i}`} className="flex items-center">
            <span className="w-4 shrink-0" />
            <div className="flex-1 min-w-0"><Row ann={o} /></div>
          </div>
        ))}

        {annotations.length === 0 && (
          <div className={`text-center text-gray-400 ${sz} py-3`}>{t('ann.no_annotations')}</div>
        )}
      </div>

      {/* ── Add form ── */}
      {readOnly ? null : showAdd ? (
        <div className="mt-1.5 p-2 bg-gray-50 rounded border border-gray-200 space-y-1.5">
          <div className="flex gap-1.5">
            <input value={addName} onChange={e => setAddName(e.target.value)}
              placeholder={t('ann.name')} className={`flex-1 ${sz} border rounded px-1.5 py-1`} />
            <select value={addType} onChange={e => setAddType(e.target.value)}
              className={`${sz} border rounded px-1 py-1 flex-1`}>
              {TYPE_GROUPS.map(g => (
                <optgroup key={g.labelKey} label={t(g.labelKey)}>
                  {g.types.map(tp => <option key={tp} value={tp}>{t('type.' + tp)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5 items-center">
            <input type="number" value={addStart} onChange={e => setAddStart(e.target.value)}
              placeholder={t('ann.start')} className={`w-16 ${sz} border rounded px-1.5 py-1`} min={1} />
            <span className="text-gray-400 text-[10px]">..</span>
            <input type="number" value={addEnd} onChange={e => setAddEnd(e.target.value)}
              placeholder={t('ann.end')} className={`w-16 ${sz} border rounded px-1.5 py-1`} min={1} max={seqLength} />
            <span className={`${compact ? 'text-[7px]' : 'text-[8px]'} px-1.5 py-0.5 rounded ${
              (TYPE_TO_LEVEL[addType] || 'detail') === 'region' ? 'bg-blue-100 text-blue-600' :
              (TYPE_TO_LEVEL[addType] || 'detail') === 'point' ? 'bg-amber-100 text-amber-600' :
              'bg-gray-100 text-gray-500'
            }`}>{TYPE_TO_LEVEL[addType] || 'detail'}</span>
            <button onClick={handleAdd}
              className={`${sz} bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700`}>
              {t('ann.save')}
            </button>
            <button onClick={() => setShowAdd(false)}
              className={`${sz} text-gray-400 hover:text-gray-600`}>{t('ann.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className={`${sz} text-blue-600 hover:text-blue-800 mt-1`}>
          {t('ann.add')}
        </button>
      )}
    </div>
  );
}
