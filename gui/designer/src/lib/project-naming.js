/**
 * project-naming — уникальное имя нового проекта.
 *
 * «Нормальная логика» (Игорь 15.06): каждый клик «создать проект» делает
 * РАЗЛИЧНЫЙ проект без коллизий имён — «Новый проект», «Новый проект 2», …
 * Раньше эта логика жила только в Library «+ Проект»; вынесена сюда, чтобы и
 * единственная оставшаяся кнопка (сайдбар «+ Создать проект») давала уникальные
 * имена после консолидации дублей (Игорь «дохера кнопок создать проект»).
 */
export function pickUniqueProjectName(projects, base = 'Новый проект') {
  const taken = new Set(
    Object.values(projects || {})
      .filter((p) => p && !p._pendingDelete)
      .map((p) => (p.name || '').trim().toLowerCase()),
  );
  let name = base;
  let n = 2;
  while (taken.has(name.toLowerCase())) { name = `${base} ${n}`; n += 1; }
  return name;
}
