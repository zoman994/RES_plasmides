/**
 * HelpPopover — single ? entry-point in the main header.
 *
 * SPEC_MAIN_SCREEN_CLEANUP §3.4. 4 tabs:
 *   - Руководство — link to the online guide (placeholder until
 *     proper content lands).
 *   - Хоткеи — re-uses existing HotkeyCheatsheet content via
 *     onOpenHotkeys callback (which already lives in App-level state).
 *   - Глоссарий — placeholder for the upcoming biology-glossary
 *     content round.
 *   - Скрытое — registry of implemented-but-not-yet-mounted features
 *     and power-user paths (right-click menus, drag-drop, hotkeys,
 *     file formats). Игорь 20.05.2026 — «скинь всё что есть, чтобы я
 *     мог ознакомиться».
 *
 * Stateless. Caller manages open/closed via `open` + `onClose`.
 * Esc / outside-click → onClose.
 */
import { useEffect, useState } from 'react';

export default function HelpPopover({ open, onClose, onOpenHotkeys }) {
  const [activeTab, setActiveTab] = useState('guide');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tabs = [
    { id: 'guide', label: 'Руководство' },
    { id: 'hotkeys', label: 'Хоткеи' },
    { id: 'glossary', label: 'Глоссарий' },
    { id: 'hidden', label: 'Скрытое' },
  ];

  return (
    <div
      role="dialog"
      data-testid="ss-help-popover"
      onClick={onClose}
      style={styles.backdrop}
    >
      <div onClick={(e) => e.stopPropagation()} style={styles.shell}>
        <div style={styles.header}>
          <strong style={{ fontSize: 13, flex: 1 }}>Помощь</strong>
          <button
            type="button"
            data-testid="ss-help-popover-close"
            onClick={onClose}
            style={styles.ghostBtn}
          >
            ✕
          </button>
        </div>
        <div style={styles.tabs} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id ? 'true' : 'false'}
              data-testid={`ss-help-tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              style={{
                ...styles.tab,
                background: activeTab === t.id
                  ? 'var(--accent-100, #eed2c1)'
                  : 'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={styles.body}>
          {activeTab === 'guide' && (
            <div data-testid="ss-help-tab-content-guide">
              <p style={styles.bodyText}>
                Полное руководство пользователя готовится. Пока — краткие
                подсказки в каждом окне приложения и комбинации клавиш на
                соседней вкладке.
              </p>
              <a
                href="https://bodgegene.dev/guide"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="ss-help-guide-link"
                style={styles.link}
              >
                Открыть онлайн-руководство ↗
              </a>
            </div>
          )}
          {activeTab === 'hotkeys' && (
            <div data-testid="ss-help-tab-content-hotkeys">
              <p style={styles.bodyText}>
                Открыть полный список горячих клавиш в отдельном окне.
              </p>
              <button
                type="button"
                data-testid="ss-help-open-hotkeys"
                onClick={() => {
                  onClose?.();
                  setTimeout(() => onOpenHotkeys?.(), 0);
                }}
                style={styles.primaryBtn}
              >
                Показать хоткеи
              </button>
            </div>
          )}
          {activeTab === 'glossary' && (
            <div data-testid="ss-help-tab-content-glossary">
              <p style={styles.bodyText}>
                Содержание готовится. Скоро будут пояснения терминов:
                контейнер, сборка, кусок, праймер, операция, зона,
                .bodge, .bodgeassembly, и других.
              </p>
            </div>
          )}
          {activeTab === 'hidden' && (
            <HiddenFeatures />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * HiddenFeatures — registry of features that are implemented in code
 * but not exposed via a visible button. Each row: что → как добраться.
 * Группы:
 *   1. Контекстные меню (ПКМ)
 *   2. Drag-and-drop
 *   3. Хоткеи (selection + canvas + editor)
 *   4. Форматы файлов
 *   5. Готово, ждёт mount (Notebook, Protocol, Primer Order)
 *   6. Восстановление + автосейв
 */
function HiddenFeatures() {
  return (
    <div data-testid="ss-help-tab-content-hidden">
      <p style={{ ...styles.bodyText, marginBottom: 16 }}>
        Реестр функций, которые уже работают, но без явной кнопки —
        либо доступны через ПКМ / drag-drop / хоткей, либо
        реализованы и ждут UI-mount следующих спринтов.
      </p>

      <Group title="1. ПКМ (правый клик) в редакторе">
        <Row a="Piece (кусок) в SegmentList сборки" b="Переименовать · RC · Изменить диапазон · Добавить mutation · Сшить (если ≥2 выделено) · Удалить" />
        <Row a="Op-узел (ромбик) в Frame view" b="Параметры стыка · Изменить тип op · Удалить группу" />
        <Row a="Restriction site в SequenceView" b="Cut at this position (открывает RE-popover c параметрами)" />
        <Row a="Selection в SequenceView" b="Forward / Reverse copy · Прямой/Обратный праймер (Ctrl+R)" />
      </Group>

      <Group title="2. Drag-and-drop">
        <Row a="Файл .gb / .fasta / .dna → на канвас" b="Открывает ImportDecisionModal (restriction / backbone / view / library / disassemble)" />
        <Row a="Запись из библиотеки → на канвас" b="Создаёт зону с этим контейнером" />
        <Row a="Контейнер из боковой панели → в редактор сборки" b="Открывает RangePicker для выбора фрагмента" />
        <Row a="Сегмент в SegmentList" b="Drag для перестановки порядка" />
        <Row a="Картинка / файл в Notebook entry" b="Auto-attach + image compress на лету" />
      </Group>

      <Group title="3. Хоткеи (не очевидные)">
        <Row a="Ctrl+R / Ctrl+Alt+R" b="Создать праймер из выделения (Fwd / Rev)" />
        <Row a="Shift + клик" b="Расширить выделение от существующего" />
        <Row a="Ctrl+K" b="Глобальный поиск (плазмиды / праймеры / сборки)" />
        <Row a="TAB / Shift+TAB" b="Переключение вкладок в окне редактора" />
        <Row a="Ctrl+S в редакторе контейнера" b="Применить незаписанные правки" />
        <Row a="Ctrl+Z / Ctrl+Y" b="Undo / Redo (живёт в общем skeleton-history)" />
        <Row a="P / S / . / G в AddPiecePopover" b="Быстрый выбор: Плазмида / Обвес / Синтез / Gap" />
        <Row a="«↩ S» в шапке редактора сборки" b="Свернуть редактор → sequence view на канвасе" />
      </Group>

      <Group title="4. Форматы файлов">
        <Row a=".bodge v2" b="Split sections: containers/.gb + assemblies/.json + manifest + sha256 + recovery. Атомарная запись, защита от corruption." />
        <Row a=".bodgeassembly" b="Портативная sub-сборка (только одна assembly + её containers). Export через Settings → Export profile." />
        <Row a="SnapGene .dna" b="Round-trip: импорт через свой binary parser + fallback BioPython; экспорт пишет provenance COMMENT в .gb." />
        <Row a="GenBank .gb с provenance" b="Multi-line COMMENT с base64-JSON payload (##BodgeGene-Provenance-START / END##)." />
        <Row a="Markdown в Notebook" b="KaTeX ($...$ / $$...$$), Mermaid links, @@ref:kind:id@@ (auto-link на entry), DNA/AA syntax highlight в fenced blocks." />
      </Group>

      <Group title="5. Готово, ждёт UI-mount (следующие спринты)">
        <Row a="Notebook (лабжурнал в .bodge)" b="NotebookEntryEditor + список + поиск + ref-picker — собрано, не примонтировано в App.jsx. Bundle delta после мaunt ~60 KB gzipped." />
        <Row a="📁 Протокол" b="ProtocolPanel — компонент сохранён, mount убран из canvas (PC-K5). Включить через future Settings → опыты." />
        <Row a="🧪 Заказ олигов" b="PrimerOrderPanel — same, файл сохранён, mount убран." />
        <Row a="Корзина (восстановление удалённого)" b="Soft-delete работает, UI восстановления переехал в Settings → раздел в разработке. Пока — Ctrl+Z сразу после delete." />
        <Row a="Mutation auto-detect" b="MutationModal готов, но трэкер «плазмида целиком + ручная правка нуклеотидов → авто-мутагенез» ещё не подключён." />
        <Row a="Frame view multi-select (Сшить)" b="AV-K5 deferred — нужен canvas-level selection slice." />
        <Row a="Frame view mutation context menu" b="AV-K4 deferred — нужен piece↔container resolver." />
      </Group>

      <Group title="6. Восстановление + автосейв">
        <Row a="Atomic write .bodge" b="Все записи через temp-file + rename — сбой не повреждает существующий файл." />
        <Row a="_recovery.json в .bodge" b="При обнаружении incomplete write — предложит восстановить последний snapshot." />
        <Row a="PWA install" b="Через Settings → раздел «Установить как приложение». Service worker → offline-ready." />
        <Row a="Lazy bundle splitting" b="KaTeX / Notebook / xyflow подгружаются по требованию — не входят в initial bundle." />
      </Group>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: 'var(--accent-500, #b85c3e)',
        marginBottom: 6,
        paddingBottom: 3,
        borderBottom: '1px solid var(--border-subtle)',
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ a, b }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      fontSize: 11.5, lineHeight: 1.4,
    }}>
      <span style={{
        flex: '0 0 38%',
        color: 'var(--text-primary)',
        fontWeight: 500,
      }}>{a}</span>
      <span style={{
        flex: 1,
        color: 'var(--text-secondary)',
      }}>{b}</span>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 80,
    background: 'rgba(28,25,23,0.24)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    paddingTop: 60, paddingRight: 24,
  },
  shell: {
    width: 560, maxHeight: '78vh',
    display: 'flex', flexDirection: 'column',
    background: 'var(--surface-1)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 8,
    boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)',
  },
  tabs: {
    display: 'flex', gap: 4, padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  tab: {
    padding: '5px 12px', fontSize: 12,
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    cursor: 'pointer',
  },
  body: { padding: 14, flex: 1, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.5 },
  bodyText: { margin: '0 0 12px 0', color: 'var(--text-secondary)' },
  link: {
    display: 'inline-block', padding: '6px 12px',
    background: 'var(--surface-2)', color: 'var(--accent-500, #b85c3e)',
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    textDecoration: 'none', fontSize: 12, fontWeight: 500,
  },
  primaryBtn: {
    padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
    background: 'var(--accent-500, #b85c3e)', color: '#fff',
    border: 'none', borderRadius: 4, cursor: 'pointer',
  },
  ghostBtn: {
    padding: '4px 10px', fontSize: 12,
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid transparent', borderRadius: 4, cursor: 'pointer',
  },
};
