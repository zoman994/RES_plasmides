/**
 * QuickStart — empty-canvas welcome screen.
 *
 * Sprint Catalog Polish K4 (V45): 2 actions (PRIMARY 2→1 + free).
 *   📂 Старт сборки  → onAction('import')  — opens ImportStartScreen
 *                                            (file · catalog 2800+ · Ctrl+V)
 *   📦 Начать с нуля → onAction('free')    — dismiss + drag from palette
 *
 * Catalog button merged into Старт сборки — ImportStartScreen left column
 * shows the SnapGene catalog tree by default (after IS-Final K4).
 */
const PRIMARY = [
  { id: 'import',  icon: '📂', tone: 'blue',
    label: 'Старт сборки', desc: 'файл · каталог 2800+ · Ctrl+V' },
];

const TONE = {
  blue:   'bg-blue-50 border-blue-200 hover:border-blue-400 hover:bg-blue-100 text-blue-700',
};

export default function QuickStart({ onAction }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">🧬</div>
          <h2 className="text-lg font-bold text-gray-700">BodgeGene</h2>
          <p className="text-xs text-gray-400">Конструктор генетических сборок</p>
        </div>

        <div className="space-y-2">
          {PRIMARY.map(a => (
            <button key={a.id} onClick={() => onAction(a.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition text-left ${TONE[a.tone]}`}>
              <span className="text-xl shrink-0">{a.icon}</span>
              <div>
                <div className="text-sm font-semibold">{a.label}</div>
                <div className="text-[10px] opacity-70">{a.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-200">
          <button onClick={() => onAction('free')}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg
                       hover:border-gray-300 hover:bg-gray-50 transition text-gray-500 text-xs">
            <span>📦</span><span>Начать с нуля — сборка из палитры</span>
          </button>
        </div>

        <div className="text-center mt-4 text-[10px] text-gray-300">
          или перетащите файл в окно
        </div>
      </div>
    </div>
  );
}
