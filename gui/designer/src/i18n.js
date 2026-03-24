/** Russian localization — interface in Russian, science in English. */

const RU = {
  // Navigation
  'Parts Library': 'Библиотека частей',
  'Search...': 'Поиск...',
  'Generate Primers': 'Рассчитать праймеры',
  'Calculating...': 'Расчёт...',
  'Export GenBank': 'Экспорт GenBank (.gb)',
  'Export Protocol': 'Экспорт протокола (.txt)',
  'Save to PlasmidVCS': 'Сохранить в PlasmidVCS',
  'Copy for ordering': 'Скопировать для заказа',
  'Clear': 'Очистить',

  // Header
  'Construct Designer': 'Конструктор',
  'Visual assembly of genetic constructs': 'Визуальная сборка генетических конструкций',
  'Assembly:': 'Тип сборки:',
  'Overlap / Gibson': 'Overlap / Gibson',
  'Golden Gate': 'Golden Gate',
  'Mutagenesis': 'Мутагенез',
  'Polymerase:': 'Полимераза:',
  'Prefix:': 'Префикс:',

  // Part types
  'CDS': 'CDS',
  'promoter': 'Промоторы',
  'terminator': 'Терминаторы',
  'rep_origin': 'Ориджины',
  'marker': 'Маркеры',
  'signal_peptide': 'Сигнальные пептиды',
  'misc_feature': 'Прочее',
  'regulatory': 'Регуляторные',
  'Custom sources': 'Другие источники',
  'From PCR product / tube': 'Из пробирки / ПЦР-продукта',
  'From existing construct': 'Извлечь из конструкта',
  'Paste custom sequence': 'Вставить последовательность',

  // Canvas
  'Drag parts here': 'Перетащите части из палитры для начала сборки',
  'construct assembly': 'сборка конструкции',
  'Circular': 'Кольцевой',
  'Linear': 'Линейный',
  'Total:': 'Итого:',
  'fragments': 'фрагментов',
  'junctions': 'стыков',
  'circular': 'кольцевой',
  'linear': 'линейный',
  'no PCR': 'без ПЦР',
  'PCR:': 'ПЦР:',

  // Junctions
  'Configure junction': 'Настройка стыка',
  'Junction type': 'Тип стыка',
  'Overlap (PCR/Gibson)': 'Overlap (ПЦР/Gibson)',
  'Restriction enzyme': 'Рестриктаза',
  'Blunt end': 'Тупые концы',
  'Pre-formed': 'Готовые концы',
  'Overlap on:': 'Overlap на:',
  'both': 'Оба праймера',
  'Length (bp)': 'Длина (п.н.)',
  'Tm target': 'Целевой Tm',
  'on each primer': 'на каждом праймере',
  'on one primer': 'на одном праймере',
  'Done': 'Готово',

  // Primers
  'Primers': 'Праймеры',
  'Name': 'Имя',
  'Sequence': 'Последовательность',
  'Tm bind': 'Tm связ.',
  'Tm full': 'Tm полн.',
  'GC%': 'GC%',
  'Length': 'Длина',
  'Tail purpose': 'Назначение хвоста',
  'tail (overlap/RE)': 'хвост (overlap/RE)',
  'BINDING (template)': 'СВЯЗЫВАНИЕ (темплейт)',
  'PCR annealing temp': 'температура отжига',

  // Panels
  'Restriction Analysis': 'Рестрикционный анализ',
  'Verification Primers': 'Праймеры верификации',
  'Sequence': 'Последовательность',
  'Copy sequence': 'Скопировать последовательность',
  'Colony PCR': 'Колониальная ПЦР',
  'Sequencing primers': 'Праймеры секвенирования',
  'Design Verification Primers': 'Рассчитать праймеры верификации',
  'Diagnostic Digest': 'Диагностическая рестрикция',
  'Unique cutters': 'Уникальные сайты',

  // Mutagenesis
  'Mutagenesis Wizard': 'Мастер мутагенеза',
  'Select Template': 'Выбор темплейта',
  'Define Mutations': 'Определение мутаций',
  'Review Strategy': 'Обзор стратегии',
  'Apply to Canvas': 'Применить к холсту',
  'Substitution': 'Замена',
  'Deletion': 'Делеция',
  'Insertion': 'Инсерция',
  'Position': 'Позиция',
  'Current': 'Текущая',
  'New AA': 'Новая а.о.',
  'Codon': 'Кодон',
  'Compute Strategy': 'Рассчитать стратегию',
  'Add mutation': '+ Добавить мутацию',

  // Signal peptide
  'Split Signal Peptide': 'Разделить сигнальный пептид',
  'Signal peptide detected': 'Обнаружен сигнальный пептид',
  'Remove signal, keep mature': 'Удалить сигнал, оставить зрелый белок',
  'Keep native signal': 'Оставить нативный сигнал',
  'Split into two fragments': 'Разделить на два фрагмента',

  // Multi-step
  '+ Add step': '+ Добавить шаг',
  'Add assembly step': '+ Добавить шаг сборки',

  // Units
  'bp': 'п.н.',
  'kb': 'т.п.н.',
  'aa': 'а.о.',
  'kDa': 'кДа',
  'nt': 'нт',
};

/** Translate a key. Returns the key itself if no translation found. */
export function t(key) {
  return RU[key] || key;
}

export default RU;
