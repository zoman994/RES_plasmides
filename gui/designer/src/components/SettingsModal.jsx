import { useState } from 'react';
import { useStore } from '../store';
import { clearAll } from '../db/dexie-schema';
import { formatHotkey } from '../lib/hotkeys';
import { STRINGS } from '../lib/strings';
import { promptInstall, isPwaInstalled } from '../lib/pwa-install';

const TABS = [
  { id: 'identity', labelKey: 'identity' },
  // UX-006 — Display & Defaults aggregates the user-tunable knobs
  // that used to be invisible (sequence wrap, primer prefix,
  // annotate-on-import) or scattered (theme in topbar only).
  { id: 'display', labelKey: 'display' },
  { id: 'advanced', labelKey: 'advanced' },
];

const SEQ_WRAP_OPTIONS = [60, 80, 100, 150];
// «Default polymerase» removed (Игорь) — it only affected the legacy designPrimersLocal
// PCR path (Tm offset), never the four-tier assembly primers, so the setting lied.
const THEME_OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark',  label: 'Dark' },
];

export default function SettingsModal() {
  const closeSettings = useStore(s => s.closeSettings);
  const agent = useStore(s => s.agent);
  const setAgent = useStore(s => s.setAgent);
  const showToast = useStore(s => s.showToast);
  // UX-006
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const displaySettings = useStore(s => s.displaySettings);
  const setDisplaySetting = useStore(s => s.setDisplaySetting);

  const [tab, setTab] = useState('identity');
  const [name, setName] = useState(agent?.name || '');
  const [email, setEmail] = useState(agent?.email || '');
  const [confirmReset, setConfirmReset] = useState(false);

  function saveIdentity() {
    setAgent({ name: name.trim(), email: email.trim() });
    showToast(STRINGS.settings.identity.savedToast, 'success');
  }

  async function doReset() {
    try {
      await clearAll();
      try { localStorage.clear(); } catch { /* ignore */ }
      window.location.reload();
    } catch (e) {
      showToast(STRINGS.settings.advanced.resetFailed(e.message || String(e)), 'error');
    }
  }

  return (
    <div
      data-testid="settings-modal-backdrop"
      role="dialog"
      onClick={closeSettings}
      className="modal-anim-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        data-testid="settings-modal"
        onClick={(e) => e.stopPropagation()}
        className="modal-anim-body"
        style={{
          background: 'var(--surface-1, #ffffff)',
          color: 'var(--text-primary, #1c1917)',
          padding: 0,
          borderRadius: 'var(--radius-lg, 8px)',
          minWidth: 480,
          maxWidth: 560,
          boxShadow: 'var(--shadow-xl)',
          border: '0.5px solid var(--border-default, #d6d3d1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{STRINGS.settings.title}</h2>
          <button
            type="button"
            onClick={closeSettings}
            data-testid="settings-close"
            title={`${STRINGS.settings.closeTitle} ⋅ ${formatHotkey('escape')}`}
            style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}
            aria-label={STRINGS.settings.closeAria}
          >×</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border-subtle)' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`settings-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              style={{
                flex: 'none',
                padding: '10px 16px',
                fontSize: 13,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: tab === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: tab === t.id ? '2px solid var(--accent-500)' : '2px solid transparent',
              }}
            >{STRINGS.settings.tabs[t.labelKey]}</button>
          ))}
        </div>

        <div style={{ padding: 18 }}>
          {tab === 'identity' && (
            <div data-testid="settings-tab-content-identity">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                {STRINGS.settings.identity.hint}
              </p>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                {STRINGS.settings.identity.nameLabel}
              </label>
              <input
                data-testid="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 13,
                  border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                  marginBottom: 12, background: 'var(--surface-2)', color: 'var(--text-primary)',
                }}
              />
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                {STRINGS.settings.identity.emailLabel}
              </label>
              <input
                data-testid="settings-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px', fontSize: 13,
                  border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                  marginBottom: 12, background: 'var(--surface-2)', color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                data-testid="settings-save-identity"
                onClick={saveIdentity}
                style={{
                  padding: '6px 14px', fontSize: 13,
                  border: '0.5px solid var(--accent-500)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-50)',
                  color: 'var(--accent-text)',
                  fontWeight: 500, cursor: 'pointer',
                }}
              >{STRINGS.settings.identity.saveButton}</button>
            </div>
          )}

          {tab === 'display' && (
            <div data-testid="settings-tab-content-display" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                {STRINGS.settings.display.hint}
              </p>

              {/* Theme */}
              <SettingRow label={STRINGS.settings.display.themeLabel}>
                <RadioPills
                  testId="settings-display-theme"
                  options={THEME_OPTIONS}
                  value={theme}
                  onChange={(v) => setTheme(v)}
                />
              </SettingRow>

              {/* Sequence wrap */}
              <SettingRow label={STRINGS.settings.display.seqWrapLabel} hint={STRINGS.settings.display.seqWrapHint}>
                <RadioPills
                  testId="settings-display-seqwrap"
                  options={SEQ_WRAP_OPTIONS.map((n) => ({ id: n, label: String(n) }))}
                  value={displaySettings.sequenceWrap}
                  onChange={(v) => setDisplaySetting({ sequenceWrap: Number(v) })}
                />
              </SettingRow>

              {/* Primer prefix */}
              <SettingRow label={STRINGS.settings.display.primerPrefixLabel} hint={STRINGS.settings.display.primerPrefixHint}>
                <input
                  data-testid="settings-display-primer-prefix"
                  value={displaySettings.primerPrefix}
                  maxLength={12}
                  onChange={(e) => setDisplaySetting({ primerPrefix: e.target.value })}
                  style={{
                    width: 140, padding: '4px 8px', fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                    border: '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-2)', color: 'var(--text-primary)',
                  }}
                />
              </SettingRow>

              {/* Synthesis-block threshold (editable assembly, S1 §5.9) */}
              <SettingRow label={STRINGS.settings.display.synthesisThresholdLabel} hint={STRINGS.settings.display.synthesisThresholdHint}>
                <input
                  type="number"
                  min={40}
                  max={200}
                  step={1}
                  data-testid="settings-display-synthesis-threshold"
                  value={displaySettings.synthesisLengthThreshold}
                  onChange={(e) => setDisplaySetting({ synthesisLengthThreshold: Number(e.target.value) })}
                  style={{
                    width: 100, padding: '4px 8px', fontSize: 13,
                    fontFamily: 'var(--font-mono)',
                    border: '0.5px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-2)', color: 'var(--text-primary)',
                  }}
                />
              </SettingRow>

              {/* Annotate-on-import default */}
              <SettingRow label={STRINGS.settings.display.annotateOnImportLabel} hint={STRINGS.settings.display.annotateOnImportHint}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    data-testid="settings-display-annotate-on-import"
                    checked={!!displaySettings.annotateOnImport}
                    onChange={(e) => setDisplaySetting({ annotateOnImport: e.target.checked })}
                  />
                  <span>{STRINGS.settings.display.annotateOnImportToggle}</span>
                </label>
              </SettingRow>
            </div>
          )}

          {tab === 'advanced' && (
            <div data-testid="settings-tab-content-advanced">
              {/* MS-K6 — PWA install section (moved from sidebar). */}
              <PwaInstallSection />
              <p style={{ fontSize: 13, color: 'var(--danger-fg, #b91c1c)', margin: '0 0 8px' }}>
                {STRINGS.settings.advanced.resetWarning}
              </p>
              {!confirmReset ? (
                <button
                  type="button"
                  data-testid="settings-reset"
                  onClick={() => setConfirmReset(true)}
                  style={{
                    padding: '6px 14px', fontSize: 13,
                    border: '0.5px solid var(--danger-fg, #b91c1c)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--danger-bg, #fee2e2)',
                    color: 'var(--danger-fg, #b91c1c)',
                    cursor: 'pointer',
                  }}
                >{STRINGS.settings.advanced.resetButton}</button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    data-testid="settings-reset-confirm"
                    onClick={doReset}
                    style={{
                      padding: '6px 14px', fontSize: 13,
                      border: '0.5px solid var(--danger-fg, #b91c1c)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--danger-fg, #b91c1c)',
                      color: '#fff', cursor: 'pointer',
                    }}
                  >{STRINGS.settings.advanced.resetConfirmButton}</button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    style={{
                      padding: '6px 14px', fontSize: 13,
                      border: '0.5px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      background: 'transparent', cursor: 'pointer',
                      color: 'var(--text-primary)',
                    }}
                  >{STRINGS.settings.advanced.resetCancelButton}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// UX-006 — small layout primitives kept inline to avoid spinning up a
// new file. `SettingRow` is just label-on-top + control-below with a
// soft hint text underneath. `RadioPills` is a horizontal segmented
// control rendered as a row of buttons; the active one carries the
// accent fill.
function SettingRow({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{hint}</span>
      )}
    </div>
  );
}

/**
 * MS-K6 — PWA install section. Conditional rendering (spec §5):
 *   - Hidden when `isPwaInstalled()` is true (browser reports
 *     standalone display mode).
 *   - Hidden when `canInstallPwa` flag is false (browser never
 *     fired `beforeinstallprompt` — Safari/Firefox path).
 *   - Otherwise shows the install button which calls promptInstall().
 */
function PwaInstallSection() {
  const canInstall = useStore((s) => s.canInstallPwa);
  const showToast = useStore((s) => s.showToast);
  const installed = isPwaInstalled();

  if (installed) return null;
  if (!canInstall) return null;

  const onClick = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      showToast?.(STRINGS.startScreen?.appInstalled || 'Приложение установлено', 'success');
    } else if (outcome === 'dismissed') {
      showToast?.('Установка отменена', 'info');
    }
  };

  return (
    <div
      data-testid="settings-pwa-install-section"
      style={{
        marginBottom: 16, padding: '12px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-default)', borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>
        Установка как приложение
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        Установите BodgeGene как отдельное окно с иконкой в системе.
        Работает без браузерной обвязки.
      </div>
      <button
        type="button"
        data-testid="settings-pwa-install"
        onClick={onClick}
        style={{
          padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
          background: 'var(--accent-500, #b85c3e)', color: '#fff',
          border: 'none', borderRadius: 4, cursor: 'pointer',
        }}
      >
        ↓ Установить BodgeGene
      </button>
    </div>
  );
}

function RadioPills({ options, value, onChange, testId }) {
  return (
    <div data-testid={testId} style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange?.(opt.id)}
            data-testid={testId ? `${testId}-${opt.id}` : undefined}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 'var(--radius-md, 6px)',
              border: active
                ? '0.5px solid var(--accent-500)'
                : '0.5px solid var(--border-default, #d6d3d1)',
              background: active ? 'var(--accent-50)' : 'var(--surface-2)',
              color: active ? 'var(--accent-text)' : 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >{opt.label}</button>
        );
      })}
    </div>
  );
}
