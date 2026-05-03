# План — Sprint 1 (V5 + V3 → отчёт → V4)

**Источник спеки:** сообщение пользователя 19.04.2026 (Chat, v2).
**Ветка:** работаем на `feature/racetrack-canvas` (рабочее дерево грязное — новая ветка запутает как и на 1.2). Перенос коммитов — по запросу.

---

## Порядок (per user instruction)

1. **V5** (~45 мин): `getTextColor` helper + AnnotationEditor inline color + 7 unit-тестов → commit → vitest green
2. **V3** (~1 ч): `resetJunctionForType` helper + 5 call sites в JunctionBlock + 4 unit-теста → commit → vitest green
3. **Отчёт пользователю** по 2 коммитам: test count, vitest/build status, diff summary. Ждать подтверждения что ничего не сломалось.
4. **V4** (~7–9 ч, большая часть обрезана в message): получу спеку целиком → helper `buildMutagenesisPayload` → App.jsx guard → Wizard payload → handleMutagenesis → local-primer-design overlapSequence → handleSaveFragment split → интеграционные тесты.

---

## V5: ANNOTATION-BAR-CONTRAST

**Новый файл:** `gui/designer/src/lib/color-utils.js` — экспорт `getTextColor(bgHex)`.

**Изменение:** `gui/designer/src/components/AnnotationEditor.jsx` (строки 227–244) — убрать `text-white` из className, добавить `color: getTextColor(color)` в inline style.

**Pre-check grep:** `grep -n "text-white" AnnotationEditor.jsx` — если `text-white` используется ещё где-то (tree list и т.п.), НЕ трогать те места.

**Новый файл тестов:** `gui/designer/src/__tests__/color-utils.test.js` — 7 кейсов (чёрный, белый, жёлтый AmpR `#FBBF24`, светло-зелёный `#A7F3D0`, тёмно-синий CDS `#2563EB`, красный `#DC2626`, malformed null/string).

**Коммит:** `feat(v5): contrast-aware annotation bar text`.

---

## V3: JUNCTION-STALE-RE

**Новый файл:** `gui/designer/src/lib/junction-utils.js` — экспорт `resetJunctionForType(j, newType)`.

**Логика helper'а:**
- `base` = id + overlap-поля (overlapLength/overlapMode/autoMode/calcMode/tmTarget) + `type: newType`
- `golden_gate` → `{...base, enzyme: 'BsaI', overhang: ''}`
- `ligation` / `re_ligation` → `{...base, reEnzyme: j.reEnzyme||'', enzyme: j.reEnzyme||''}`
- `overlap` / `kld` / `phosphorylated` → `base` (без enzyme/overhang полей)

**Изменение:** `gui/designer/src/components/JunctionBlock.jsx` — 5 вызовов `onChange({...j, type: X})` → `onChange(resetJunctionForType(j, X))`:
1. Context-menu: Overlap (~строка 153)
2. Context-menu: Golden Gate (~строка 154)
3. Context-menu: RE лигирование (~строка 155)
4. Context-menu: KLD (~строка 156)
5. Tab buttons (~строка 188)
+ упрощение GG-кнопки (~строка 175) — `resetJunctionForType(j, 'golden_gate')` сам ставит `enzyme: 'BsaI'`.

**Новый файл тестов:** `gui/designer/src/__tests__/junction-utils.test.js` — 4 кейса: ligation→GG, ligation→overlap, GG→KLD, preserve geometry.

**Коммит:** `fix(v3): reset junction fields on type switch`.

---

## Stop points

После V5 commit: `npx vitest run` → ожидание 604 + 7 = 611 ✅.
После V3 commit: 611 + 4 = 615 ✅.
Затем отчёт пользователю.

Каждый commit — только файлы этого фикса. `git add .` НЕ использовать (дерево всё ещё грязное с предыдущих сессий).
