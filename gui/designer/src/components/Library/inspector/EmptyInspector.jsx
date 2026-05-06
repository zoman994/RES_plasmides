import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * EmptyInspector — placeholder when parsedItems is empty.
 *
 * Variant by target:
 *   - target='library' + libraryEmpty=true → biolog opened «Library» link
 *     and own library is empty: explicit «add first plasmid» onboarding.
 *   - target='library' + libraryEmpty=false → standard hint, mention
 *     existing entries are visible in CatalogColumn → «Моя библиотека».
 *   - target='project' → standard pick-or-drop hint.
 */
export default function EmptyInspector({ target = 'project', libraryEmpty = false }) {
  const isLibraryFirstTime = target === 'library' && libraryEmpty;

  return (
    <div
      data-testid="importer-empty-inspector"
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: 32,
        color: 'var(--text-tertiary)',
        fontSize: 13,
        textAlign: 'center',
        maxWidth: 460,
        margin: '0 auto',
      }}
    >
      <div style={{ fontSize: 32, opacity: 0.4 }}>
        {isLibraryFirstTime ? '📚' : '👈'}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
        {isLibraryFirstTime ? S.emptyLibraryFirstTimeTitle : S.emptyInspectorHint1}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {isLibraryFirstTime ? S.emptyLibraryFirstTimeBody : S.emptyInspectorHint2}
      </div>
    </div>
  );
}
