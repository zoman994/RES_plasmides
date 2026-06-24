/**
 * RestrictionSitesWorkspace (RS-C3 + edits) — the «Сайты рестрикции» tool.
 *
 * Manage the restriction-enzyme catalog: add/edit/remove user-defined enzymes
 * (Type II, on top of the REBASE commercial catalog) and curate named enzyme
 * SETS. Presets are EDITABLE (override stored under the preset id; reset restores
 * the default). The set editor has a quick search + «добавить из набора». Each
 * enzyme row is a mini reference: end/overhang, temperature, buffer, suppliers,
 * compatible ends. All edits go through customEnzymesSlice → Dexie v7 + the scan
 * registry (RS-C2).
 *
 * Bio-invariant (Rule 1): Type II only — this tool never touches Golden Gate.
 */
import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { selectAllEnzymeSets, selectMergedREEnzymes } from '../../store/customEnzymesSlice';
import { deriveEndOverhang, resolveEnzymeSet } from '../../lib/custom-enzymes';
import { RE_ENZYMES, getCompatible, supplierNames } from '../../restriction-db';
import SiteDuplex from './SiteDuplex';

const EMPTY_FORM = { name: '', site: '', cutF: '', cutR: '' };

function endLabel(info) {
  if (!info) return '';
  return info.end === 'blunt' ? 'тупой' : `${info.end === '5prime' ? '5′' : '3′'} ${info.overhang || ''}`;
}

export default function RestrictionSitesWorkspace() {
  const customById = useStore((s) => s.customEnzymes && s.customEnzymes.byId);
  const customSets = useStore((s) => s.customEnzymes && s.customEnzymes.sets);
  const addCustomEnzyme = useStore((s) => s.addCustomEnzyme);
  const updateCustomEnzyme = useStore((s) => s.updateCustomEnzyme);
  const removeCustomEnzyme = useStore((s) => s.removeCustomEnzyme);
  const addEnzymeSet = useStore((s) => s.addEnzymeSet);
  const removeEnzymeSet = useStore((s) => s.removeEnzymeSet);
  const updateEnzymeSet = useStore((s) => s.updateEnzymeSet);
  const goBack = useStore((s) => s.goBack);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);

  const customEnzymes = useMemo(() => Object.values(customById || {}), [customById]);
  const allSets = useMemo(() => selectAllEnzymeSets({ customEnzymes: { sets: customSets || {} } }), [customSets]);
  const mergedEnzymes = useMemo(() => selectMergedREEnzymes({ customEnzymes: { byId: customById || {} } }), [customById]);
  const allEnzymeNames = useMemo(() => Object.keys(mergedEnzymes).sort((a, b) => a.localeCompare(b)), [mergedEnzymes]);

  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [newSetName, setNewSetName] = useState('');
  const [selectedSetId, setSelectedSetId] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [expanded, setExpanded] = useState(null); // enzyme name whose reference detail is open

  const filteredBuiltins = useMemo(() => {
    const q = search.trim().toUpperCase();
    return Object.keys(RE_ENZYMES)
      .filter((n) => !q || n.toUpperCase().includes(q) || RE_ENZYMES[n].site.includes(q))
      .sort((a, b) => a.localeCompare(b));
  }, [search]);

  const preview = useMemo(() => {
    const f = Number(form.cutF);
    const r = Number(form.cutR);
    if (!form.site || !Number.isInteger(f) || !Number.isInteger(r)) return null;
    return deriveEndOverhang(form.site.toUpperCase(), [f, r]);
  }, [form.site, form.cutF, form.cutR]);

  const onSubmitEnzyme = async () => {
    const payload = { name: form.name, site: form.site, cut: [Number(form.cutF), Number(form.cutR)] };
    const r = editingId ? await updateCustomEnzyme(editingId, payload) : await addCustomEnzyme(payload);
    if (r && r.ok) { setForm(EMPTY_FORM); setErrors([]); setEditingId(null); } else setErrors((r && r.errors) || []);
  };
  const startEdit = (enz) => {
    setForm({ name: enz.name, site: enz.site, cutF: String(enz.cut[0]), cutR: String(enz.cut[1]) });
    setEditingId(enz.id); setErrors([]);
  };
  const cancelEdit = () => { setForm(EMPTY_FORM); setEditingId(null); setErrors([]); };

  const onCreateSet = async () => {
    const name = newSetName.trim();
    if (!name) return;
    const r = await addEnzymeSet(name, []);
    setNewSetName('');
    if (r.ok) selectSet(r.id);
  };

  // The selected set comes from the MERGED list (presets carry their override).
  const selectedSet = useMemo(() => allSets.find((s) => s.id === selectedSetId) || null, [allSets, selectedSetId]);
  const selectSet = (id) => {
    const next = selectedSetId === id ? null : id;
    setSelectedSetId(next);
    setMemberSearch('');
    const s = allSets.find((x) => x.id === next);
    setRenameDraft(s ? s.name : '');
  };
  const setEnzymes = (next) => { if (selectedSetId) updateEnzymeSet(selectedSetId, { enzymes: next }); };
  const toggleMember = (name) => {
    if (!selectedSet) return;
    const list = selectedSet.enzymes || [];
    setEnzymes(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);
  };
  const addFromSet = (srcId) => {
    if (!selectedSet || !srcId) return;
    const src = allSets.find((s) => s.id === srcId);
    if (!src) return;
    setEnzymes(Array.from(new Set([...(selectedSet.enzymes || []), ...resolveEnzymeSet(src, mergedEnzymes)])));
  };
  const commitRename = () => {
    if (!selectedSet) return;
    const n = renameDraft.trim();
    if (n && n !== selectedSet.name) updateEnzymeSet(selectedSetId, { name: n });
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toUpperCase();
    return q ? allEnzymeNames.filter((n) => n.toUpperCase().includes(q)) : allEnzymeNames;
  }, [allEnzymeNames, memberSearch]);

  const renderEnzymeRow = (name, info, { testid, isCustom, actions }) => {
    const isOpen = expanded === name;
    const compat = isOpen ? getCompatible(name) : null;
    return (
      <div key={`${testid}:${name}`} data-testid={testid} data-enzyme={name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ ...row, borderBottom: 'none', cursor: 'pointer' }}
          onClick={() => setExpanded(isOpen ? null : name)} title="Подробнее: буфер, температура, совместимость">
          <span style={{ fontWeight: isCustom ? 600 : 500, minWidth: 64 }}>{name}</span>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-secondary)' }}>{info.site}</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{endLabel(info)}</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>{(info.temp != null ? info.temp : 37)}°</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {info.buffer || '—'}
          </span>
          <span style={{ flex: 1 }} />
          {actions}
        </div>
        {isOpen && (
          <div data-testid="rs-enzyme-detail" style={{ fontSize: 10.5, color: 'var(--text-secondary)', padding: '2px 4px 6px', lineHeight: 1.5 }}>
            <SiteDuplex site={info.site} cut={info.cut} />
            <div>Конец: {endLabel(info)} · t°: {info.temp != null ? info.temp : 37} · буфер: {info.buffer || 'н/д'}{info.heatInactivation ? ` · инактивация: ${info.heatInactivation}` : ''}</div>
            {Array.isArray(info.suppliers) && info.suppliers.length > 0 && <div>Поставщики: {supplierNames(info.suppliers).join(', ')}</div>}
            {Array.isArray(info.isoschizomers) && info.isoschizomers.length > 0 && <div>Изосхизомеры: {info.isoschizomers.join(', ')}</div>}
            <div>Совместимы по концу ({compat.length}): {compat.length ? compat.slice(0, 14).join(', ') + (compat.length > 14 ? '…' : '') : '—'}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div data-testid="restriction-sites-workspace" style={shell}>
      <div style={header}>
        <strong style={{ fontSize: 14 }}>Сайты рестрикции</strong>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {Object.keys(RE_ENZYMES).length} встроенных · {customEnzymes.length} своих · {allSets.length} наборов
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="restriction-sites-back"
          onClick={() => { goBack?.(); setActiveWorkspace?.('library'); }} style={ghost}>← Назад</button>
      </div>

      <div style={body}>
        {/* ── Enzymes ─────────────────────────────────────────── */}
        <section data-testid="restriction-sites-enzymes" style={pane}>
          <h3 style={paneTitle}>Ферменты</h3>

          <div style={card} data-testid="rs-enz-form" data-mode={editingId ? 'edit' : 'add'}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
              {editingId ? 'Изменить фермент' : 'Добавить свой фермент (Type II)'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Имя" w={90}>
                <input data-testid="rs-enz-name" value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} style={input} />
              </Field>
              <Field label="Сайт узнавания" w={130}>
                <input data-testid="rs-enz-site" value={form.site} placeholder="GAATTC"
                  onChange={(e) => setForm((p) => ({ ...p, site: e.target.value.toUpperCase() }))}
                  style={{ ...input, fontFamily: 'var(--font-mono, monospace)' }} />
              </Field>
              <Field label="Рез ↑" w={52}>
                <input data-testid="rs-enz-cutf" type="number" value={form.cutF}
                  onChange={(e) => setForm((p) => ({ ...p, cutF: e.target.value }))} style={input} />
              </Field>
              <Field label="Рез ↓" w={52}>
                <input data-testid="rs-enz-cutr" type="number" value={form.cutR}
                  onChange={(e) => setForm((p) => ({ ...p, cutR: e.target.value }))} style={input} />
              </Field>
              <button type="button" data-testid="rs-enz-add" onClick={onSubmitEnzyme} style={primary}>
                {editingId ? 'Сохранить' : 'Добавить'}
              </button>
              {editingId && <button type="button" data-testid="rs-enz-cancel" onClick={cancelEdit} style={ghostSm}>Отмена</button>}
            </div>
            {preview && (
              <div data-testid="rs-enz-preview" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Конец: {preview.end === 'blunt' ? 'тупой' : `${preview.end === '5prime' ? '5′' : '3′'} ${preview.overhang}`}
              </div>
            )}
            {errors.length > 0 && (
              <div data-testid="rs-enz-errors" style={{ fontSize: 10.5, color: 'var(--danger, #dc2626)', marginTop: 4 }}>
                {errors.map((e, i) => <div key={i}>{e.message}</div>)}
              </div>
            )}
          </div>

          {customEnzymes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={listLabel}>Свои ферменты</div>
              {customEnzymes.map((enz) => renderEnzymeRow(enz.name, enz, {
                testid: 'rs-custom-enzyme', isCustom: true,
                actions: (
                  <>
                    <button type="button" data-testid="rs-custom-enzyme-edit" aria-label={`изменить ${enz.name}`}
                      onClick={(e) => { e.stopPropagation(); startEdit(enz); }} style={ghostSm}>Изменить</button>
                    <button type="button" data-testid="rs-custom-enzyme-remove" aria-label={`удалить ${enz.name}`}
                      onClick={(e) => { e.stopPropagation(); removeCustomEnzyme(enz.id); }} style={ghostSm}>Удалить</button>
                  </>
                ),
              }))}
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <div style={listLabel}>Встроенные ({filteredBuiltins.length})</div>
            <input data-testid="rs-builtin-search" value={search} placeholder="Поиск по имени / сайту…"
              onChange={(e) => setSearch(e.target.value)} style={{ ...input, width: '100%', marginBottom: 6 }} />
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {filteredBuiltins.map((n) => renderEnzymeRow(n, RE_ENZYMES[n], { testid: 'rs-builtin-enzyme', isCustom: false, actions: null }))}
            </div>
          </div>
        </section>

        {/* ── Sets ────────────────────────────────────────────── */}
        <section data-testid="restriction-sites-sets" style={pane}>
          <h3 style={paneTitle}>Наборы рестриктаз</h3>

          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 8 }}>
            <Field label="Новый набор" w={160}>
              <input data-testid="rs-set-name" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} style={input} />
            </Field>
            <button type="button" data-testid="rs-set-create" onClick={onCreateSet} style={primary}>Создать</button>
          </div>

          {allSets.map((s) => {
            const sel = selectedSetId === s.id;
            const isPreset = s.origin === 'preset';
            return (
              <div key={s.id} data-testid="rs-set" data-set-id={s.id} data-origin={s.origin} data-edited={s.edited ? 'true' : 'false'}
                style={{ ...card, marginBottom: 6, outline: sel ? '1px solid var(--accent-500, #b85c3e)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" data-testid="rs-set-select" onClick={() => selectSet(s.id)}
                    style={{ ...ghostSm, fontWeight: 600 }}>{sel ? '▾' : '▸'} {s.name}</button>
                  <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                    {isPreset ? `пресет${s.edited ? ' · изменён' : ''}` : 'свой'} · {(s.enzymes || []).length} ферм.
                  </span>
                  <span style={{ flex: 1 }} />
                  {!isPreset && (
                    <button type="button" data-testid="rs-set-remove" aria-label={`удалить набор ${s.name}`}
                      onClick={() => { removeEnzymeSet(s.id); if (sel) setSelectedSetId(null); }} style={ghostSm}>Удалить</button>
                  )}
                  {isPreset && s.edited && (
                    <button type="button" data-testid="rs-set-reset" aria-label={`сбросить набор ${s.name}`}
                      onClick={() => { removeEnzymeSet(s.id); if (sel) setRenameDraft(''); }} style={ghostSm}>Сбросить</button>
                  )}
                </div>

                {sel && (
                  <div data-testid="rs-set-members" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* rename + populate-from-set */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <Field label="Название набора" w={150}>
                        <input data-testid="rs-set-rename" value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)} onBlur={commitRename}
                          onKeyDown={(e) => { if (e.key === 'Enter') { commitRename(); e.currentTarget.blur(); } }} style={input} />
                      </Field>
                      <Field label="Добавить из набора" w={170}>
                        <select data-testid="rs-set-addfrom" defaultValue=""
                          onChange={(e) => { addFromSet(e.target.value); e.target.value = ''; }} style={input}>
                          <option value="">— выбрать набор —</option>
                          {allSets.filter((o) => o.id !== s.id).map((o) => (
                            <option key={o.id} value={o.id}>{o.name} ({(o.enzymes || []).length})</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    {/* quick search over the catalog */}
                    <input data-testid="rs-set-member-search" value={memberSearch} placeholder="Поиск фермента для набора…"
                      onChange={(e) => setMemberSearch(e.target.value)} style={input} />

                    <div style={{ maxHeight: 200, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {filteredMembers.map((n) => {
                        const inSet = (s.enzymes || []).includes(n);
                        return (
                          <label key={n} data-testid="rs-set-member-toggle" data-enzyme={n} data-in-set={inSet ? 'true' : 'false'}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                            <input type="checkbox" checked={inSet} onChange={() => toggleMember(n)} />
                            <span>{n}</span>
                            <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-tertiary)', fontSize: 10 }}>
                              {mergedEnzymes[n] && mergedEnzymes[n].site}
                            </span>
                            {mergedEnzymes[n] && mergedEnzymes[n].isCustom && (
                              <span style={{ fontSize: 9, color: 'var(--accent-500, #b85c3e)' }}>свой</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function Field({ label, w, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: 'var(--text-secondary)', width: w }}>
      {label}
      {children}
    </label>
  );
}

const shell = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--surface-1)', color: 'var(--text-primary)' };
const header = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' };
const body = { flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12 };
const pane = { minWidth: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 12, background: 'var(--surface-1)' };
const paneTitle = { margin: '0 0 8px', fontSize: 12.5, fontWeight: 700 };
const card = { border: '1px solid var(--border-subtle)', borderRadius: 5, padding: 8, background: 'var(--surface-2)' };
const listLabel = { fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 0' };
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px', fontSize: 11.5 };
const input = { fontSize: 11.5, padding: '4px 6px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: 'var(--surface-1)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box' };
const primary = { fontSize: 11.5, padding: '5px 12px', background: 'var(--accent-500, #b85c3e)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 };
const ghost = { fontSize: 11, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)' };
const ghostSm = { fontSize: 10.5, padding: '2px 8px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)' };
