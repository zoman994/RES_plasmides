# BodgeGene branding

Канонические исходники логомарка. Hybrid B (выбран Игорем 01.05.2026): кольцо-плазмида + cream overlap-сегмент в правом-верхнем секторе + буквы `BG` по центру.

## Файлы

- **`logo.svg`** — full version. Amber background (#f59e0b), rounded corners 40px (256×256). Используется как PWA install icon (192/512/maskable) после конвертации в PNG. Также подходит для favicon, social-card.
- **`logo-mark.svg`** — transparent version. Без background, ring + BG используют `currentColor` (наследуют цвет родителя), overlap-segment всегда amber. Используется в Topbar header рядом с wordmark «BodgeGene», на dark-theme automatically инвертируется.

## Цветовая спецификация

| Элемент | Цвет | Tailwind / token |
|---|---|---|
| Background (logo.svg) | `#f59e0b` | amber-500, accent в `DESIGN_SYSTEM.md` |
| Ring (контур плазмиды) | `#1c1917` (logo.svg) / `currentColor` (logo-mark) | neutral-900 |
| Overlap-сегмент (cream дуга) | `#fde68a` (logo.svg) / `#f59e0b` (logo-mark) | amber-200 / amber-500 |
| Буквы BG | `#1c1917` (logo.svg) / `currentColor` (logo-mark) | neutral-900 |

Оба варианта построены на amber accent из основной палитры — отдельной brand-палитры не вводим.

## Семантика

- **Кольцо** = circular plasmid (основной образ домена — конструктор плазмид).
- **Cream-дуга в правом-верхнем секторе** = overlap junction (зона assembly / Gibson / Golden Gate / overlap PCR — то что инструмент делает в основном).
- **Буквы BG** = brand recall.

Двуслойное прочтение: биолог видит «плазмида с overlap-зоной», не-биолог — «логотип с кольцом и буквами».

## Что дальше — генерация PNG для PWA

Sprint M-A.1 K4 требует три PNG: `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` в `gui/designer/public/icons/`. Два пути:

### Путь 1 — Игорь сам, online-генератор (~2 мин)

1. Открыть https://realfavicongenerator.net/.
2. Загрузить `logo.svg` (full version — с amber background).
3. Настройки PWA install: amber `#f59e0b` background.
4. Maskable: убедиться что safe zone 80% соблюдена (буквы + кольцо в центральном круге, amber заливает края). Текущий SVG соблюдает (контент в радиусе 92px от центра 128, что = 71% — даже больше запас).
5. Скачать пакет → распаковать в `gui/designer/public/icons/`.

### Путь 2 — Code в K4, через ImageMagick / rsvg-convert

```
cd docs/branding
magick logo.svg -resize 192x192 ../../gui/designer/public/icons/icon-192.png
magick logo.svg -resize 512x512 ../../gui/designer/public/icons/icon-512.png
magick logo.svg -resize 512x512 ../../gui/designer/public/icons/icon-512-maskable.png
```

Maskable-вариант идентичен 512 — safe zone уже соблюдена в SVG. При желании можно расширить amber background за пределы существующего rounded square (но это удлиняет время на одну итерацию в Figma — не блокер для placeholder, можно потом).

### Путь 3 — Figma доработка

Открыть `logo.svg` или `logo-mark.svg` в Figma → poperty переименовать слои → подкрутить spacing/letter-spacing если хочется → export как PNG @1x/@2x/@3x. Этот путь имеет смысл только если Игорь хочет финальный polish (например подвинуть buttons на 1px, поменять letter-spacing у `BG`).

## Использование `logo-mark.svg` в приложении

Для Topbar wordmark (заменит / дополнит текущий amber-text «BodgeGene»):

```jsx
import logoMark from '/branding/logo-mark.svg?url';
// либо инлайн через ?raw + dangerouslySetInnerHTML

<div className="flex items-center gap-2">
  <img src={logoMark} alt="" className="w-6 h-6 text-amber-500" />
  <span className="font-semibold text-amber-500">BodgeGene</span>
</div>
```

(Требует `currentColor` обработку — либо инлайн SVG через `?raw`, либо CSS mask. Это Sprint M-A.1.5 / M-B мелочь, не входит в M-A.1 scope.)

## Voice & tone

Логомарк paper-grade, имя «BodgeGene» признаёт DIY-природу cloning workflow. Этот контраст — основа voice'а: в визуальной презентации мы серьёзны (логотип, paper, scientific framing), в microcopy — ироничны и честны. Образцы: Linear (terse, dry), GitHub (earnest), Stripe (educated playful). Анти-образцы: Benchling / SnapGene corporate sites (стерильно).

BodgeGene voice признаёт что cloning редко работает с первого раза. Биолог это знает; притворяться что инструмент полностью решает все проблемы — фальшиво. Лучше быть прямым.

### Применение по каналам

**Loading messages** — короткие, контекстные, с лёгкой иронией. Появляются при операциях <5 секунд.

- ✓ «Уговариваем рестриктазу резать там где надо»
- ✓ «Считаем Tm. Это занимает дольше чем кажется»
- ✓ «Ищем GG overhangs которые не ортогональны самим себе»
- ✗ «Calculating restriction sites…» (стерильно)
- ✗ «Подождите немного :)» (вяло, без характера)

**Empty states** — приглашение к действию + лёгкая характеристика того, что отсутствует.

- ✓ Пустой canvas: «Тут пока ничего. Тащи фрагменты из палитры — приклеим что выйдет.»
- ✓ Пустой Recent: «Проектов нет. С чего начнём?»
- ✓ Пустая Library: «Библиотека пустая. Импортируй .gb / .dna / .fasta или подсмотри в каталоге SnapGene.»

**Error messages** — честно описывают что сломалось + что делать. Никакого «Internal Server Error» / «Operation failed» без контекста.

- ✓ Backend down: «Бэкенд приуныл. Перезапусти `gui/run_designer.bat` и попробуем ещё.»
- ✓ Multi-tab block: «Этот проект уже открыт в другой вкладке. Закрой ту или работай здесь readonly.»
- ✓ Invalid sequence: «Последовательность содержит символы кроме ATGC + IUPAC. Проверь что .gb / .dna без BOM.»
- ✗ «ValidationError at projectSlice.js:415» (это для разработчиков, не для биолога)
- ✗ «Что-то пошло не так» (бесполезно — что именно? что делать?)

**Toasts** — результат действия одной фразой. Без восклицательных знаков и капса.

- ✓ Save: «Сохранено в `project.bodge`»
- ✓ Delete (с undo): «Проект «X» удалён»
- ✓ Export: «5 проектов скачаны»
- ✗ «Operation completed successfully!» (кричит и без информации)

**Tooltips** — короткое описание действия + хоткей в скобках. Никаких длинных пояснений.

- ✓ «Развернуть склейку (двойной клик / Esc)»
- ✓ «Создать проект (⌘N)»
- ✗ «Click here to create a new project from scratch» (избыточно)

**Console output** — internal joke для разработчиков, биологам не виден.

- ✓ App boot: `console.log('BodgeGene v0.6.0-dev. Bodging since 2024.')`
- ✓ Importer skip: `console.warn('[importer] Skipping malformed feature at line 42 — life is too short')`

**README / paper introduction** — может начинаться с честной мотивации, не с «We present a novel tool for…». Биоинформатическое community ценит честность сильнее чем формальность (см. Bioinformatics journal style guide — они допускают и поощряют живой язык).

- ✓ «BodgeGene grew out of frustration with primer design tools that assume you know exactly what you're doing on the first try. Most of us don't — hence the name.»
- ✗ «We present BodgeGene, a comprehensive plasmid design suite leveraging modern web technologies for streamlined molecular cloning workflows.» (corporate biotech-ese)

### Границы — где НЕ хулиганим

- **Логотип и wordmark** — paper-grade, как утверждено выше.
- **Названия полей форм** — «Sequence», «Tm (°C)», «Concentration». Не «Очень крутая последовательность».
- **Tooltips для деструктивных действий** — «Удалить проект», не «Прибить к чертям». Деструктив требует ясности больше чем характера.
- **Bioinformatics paper formal sections** (Methods, Results) — стандартный академический язык. Только Introduction может позволить voice (см. выше).
- **API endpoints / function names / type names** — `createProject`, `removeProjectFromIndexedDB`. Не `bodgeNewThing`. Code должен читаться однозначно.
- **Логи для production debugging** — `[error] Database connection failed at port 8000`. Не «Прилёг отдохнуть наш бэкенд». Production logs читают на 3 ч ночи в панике; ясность важнее всего.

### Локализация

Текущий проект на русском (основной пользователь — Игорь). Voice работает на русском как «лабораторный жаргон с иронией». При локализации на английский — переводить смысл, не букву.

- ✓ «Уговариваем рестриктазу» → «Coaxing the restriction enzyme»
- ✗ «Persuading enzyme to cut at correct location» (буквальный перевод теряет тон)

### Для Code в Sprint M-B и далее

M-B (Importer + reactions) сгенерирует много toast/loading messages. Code при написании текста проверяет:

1. Не звучит ли это как `Error 500: Internal Server Error`? Если да — переписать с контекстом + что делать.
2. Не звучит ли это как corporate biotech press release? Если да — упростить и добавить характер.
3. Помещается ли это в одну строку 60 знаков (toast width constraint)? Если нет — резать.

При сомнении — оставить функциональный нейтральный текст («Импорт завершён»), не пытаться выжать характер любой ценой. Стерильное лучше чем фальшиво весёлое.

## История

- **30.04.2026** — placeholder amber-fill 1×1 PNG в M-A.1 K4 spec.
- **01.05.2026** — концепции 1/2/3 + три hybrid-варианта показаны в чате.
- **01.05.2026** — Hybrid B утверждён Игорем. SVG-исходники сохранены в `docs/branding/`.
- **TBD** — PNG generation (Игорь через online-tool либо Code в K4).
