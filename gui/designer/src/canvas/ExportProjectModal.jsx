/**
 * ExportProjectModal — UI for choosing an export profile + per-section
 * filters. Spec §13.1.
 *
 * Stateless wrt the project: caller passes in `state` and gets a
 * { profileName, customFilters, singleAssemblyZoneId } back via `onExport`.
 * The actual write + atomic save happens at the caller.
 *
 * Esc / click-outside closes (ui-interactions convention).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  EXPORT_PROFILES_REGISTRY,
  getProfileSpec,
} from '../lib/bodge-export-profiles';
import { t } from '../i18n';

const PROFILE_OPTIONS = [
  { key: 'full', label: 'Full', description: 'Все секции' },
  { key: 'public-supp', label: 'Public-supp', description: 'Без вложений, без deviceId' },
  { key: 'containers-bundle', label: 'Containers only', description: 'Только containers/' },
  { key: 'single-assembly', label: 'Single assembly', description: 'Одна выбранная сборка' },
  { key: 'custom', label: 'Custom', description: 'Чекбокс-матрица' },
];

const SECTION_LABELS = {
  containers: 'Containers',
  containerHistory: null,
  assemblies: 'Assemblies (zones + pieces + ops)',
  primers: 'Primer pool',
  notebookEntries: 'Lab journal (text entries)',
  notebookAttachments: 'Photos + attachments',
  sangerDetails: 'Sanger details (notes + status)',
  library: 'Library index',
};

export default function ExportProjectModal({
  state,
  zones = [],
  onExport,
  onCancel,
}) {
  const [profileName, setProfileName] = useState('full');
  const [singleAssemblyZoneId, setSingleAssemblyZoneId] = useState(zones[0]?.id || '');
  const [stripTelemetry, setStripTelemetry] = useState(false);
  const [customSections, setCustomSections] = useState({
    containers: true, containerHistory: true, assemblies: true,
    primers: true, notebookEntries: true, notebookAttachments: true,
    sangerDetails: true, library: true,
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const summary = useMemo(() => buildSummary(state), [state]);

  const profileSpec = getProfileSpec(profileName);
  const isSingleAssembly = profileName === 'single-assembly';

  const handleExport = () => {
    const opts = { profileName };
    if (isSingleAssembly) {
      if (!singleAssemblyZoneId) return;
      opts.singleAssemblyZoneId = singleAssemblyZoneId;
    }
    if (profileName === 'custom') {
      opts.customSections = { ...customSections, stripTelemetry };
    }
    onExport(opts);
  };

  return (
    <div
      role="dialog"
      data-testid="export-project-modal"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,25,23,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, background: 'var(--surface-1)', color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={hdr}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>
            Export project: {state?.projectMeta?.name || 'untitled'}
          </strong>
          <button
            type="button"
            data-testid="export-cancel"
            onClick={onCancel}
            style={ghostBtn}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          <label style={lbl}>
            Profile
            <select
              data-testid="export-profile-select"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              style={{ ...textInput, marginTop: 4 }}
            >
              {PROFILE_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>
                  {o.label} — {o.description}
                </option>
              ))}
            </select>
          </label>

          {isSingleAssembly && (
            <label style={{ ...lbl, marginTop: 12 }}>
              Assembly to export
              <select
                data-testid="export-assembly-select"
                value={singleAssemblyZoneId}
                onChange={(e) => setSingleAssemblyZoneId(e.target.value)}
                style={{ ...textInput, marginTop: 4 }}
              >
                {zones.length === 0 && <option value="">(no assemblies)</option>}
                {zones.map(z => (
                  <option key={z.id} value={z.id}>
                    {z.name || z.id}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div data-testid="export-summary" style={{ marginTop: 16, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <div>☑ {summary.containers} containers ({summary.containersKb} KB)</div>
            <div>☑ {summary.assemblies} assemblies</div>
            <div>☑ {summary.primers} primers</div>
            <div>☑ {summary.libraryEntries} library entries</div>
            <div>☑ {summary.notebookEntries} notebook entries</div>
            <div>☑ {summary.attachments} attachments</div>
          </div>

          {profileName === 'custom' && (
            <fieldset
              data-testid="export-custom-checkboxes"
              style={{
                marginTop: 12, padding: '8px 10px',
                border: '1px solid var(--border-subtle)', borderRadius: 4,
              }}
            >
              <legend style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: '0 4px' }}>
                Per-section
              </legend>
              {Object.entries(SECTION_LABELS).map(([key, label]) => (
                <label key={key} style={checkLbl}>
                  <input
                    type="checkbox"
                    data-testid={`export-section-${key}`}
                    checked={!!customSections[key]}
                    onChange={(e) => setCustomSections(s => ({ ...s, [key]: e.target.checked }))}
                  />
                  {key === 'containerHistory' ? t('export.section.containerHistory') : label}
                </label>
              ))}
              <label style={{ ...checkLbl, marginTop: 8, fontWeight: 500 }}>
                <input
                  type="checkbox"
                  data-testid="export-strip-telemetry"
                  checked={stripTelemetry}
                  onChange={(e) => setStripTelemetry(e.target.checked)}
                />
                Strip deviceId (public-supp behavior)
              </label>
            </fieldset>
          )}

          {profileSpec?.description && (
            <div style={{ marginTop: 12, fontSize: 11, fontStyle: 'italic', color: 'var(--text-tertiary)' }}>
              {profileSpec.description}
            </div>
          )}
        </div>

        <div style={ftr}>
          <button type="button" onClick={onCancel} style={ghostBtn}>Cancel</button>
          <button
            type="button"
            data-testid="export-confirm"
            onClick={handleExport}
            style={primaryBtn}
            disabled={isSingleAssembly && !singleAssemblyZoneId}
          >
            Export to file…
          </button>
        </div>
      </div>
    </div>
  );
}

function buildSummary(state) {
  if (!state) return { containers: 0, assemblies: 0, primers: 0, libraryEntries: 0, notebookEntries: 0, attachments: 0, containersKb: 0 };
  const containers = state.containers || [];
  const containersKb = Math.round(containers.reduce((sum, c) => sum + (c.sequence?.length || 0), 0) / 1024);
  return {
    containers: containers.length,
    assemblies: (state.zones || []).length,
    primers: (state.primers || []).filter(p => p?.kind !== 'pair').length,
    libraryEntries: (state.libraryEntries || []).length,
    notebookEntries: (state.notebookEntries || []).length,
    attachments: Object.keys(state.attachmentsManifest || {}).length,
    containersKb,
  };
}

// Style helpers (mirrors SynthesisModal patterns)
const hdr = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 12px',
  background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)',
};
const ftr = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  padding: '10px 12px',
  background: 'var(--surface-2)', borderTop: '1px solid var(--border-subtle)',
};
const lbl = { display: 'flex', flexDirection: 'column', fontSize: 11.5, color: 'var(--text-secondary)' };
const checkLbl = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, padding: '2px 0', cursor: 'pointer', color: 'var(--text-primary)',
};
const textInput = {
  width: '100%', padding: '6px 8px', fontSize: 12,
  border: '1px solid var(--border-subtle)', borderRadius: 4,
  background: 'var(--surface-2)', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
};
const ghostBtn = {
  padding: '4px 10px', fontSize: 12,
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid transparent', borderRadius: 4, cursor: 'pointer',
};
const primaryBtn = {
  padding: '6px 14px', fontSize: 12.5,
  background: 'var(--accent-500, #b85c3e)', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer',
};
