/**
 * QuickStart — empty-canvas welcome screen.
 *
 * Post-Sprint Import-Start-Screen K9: 3 actions only.
 *   📂 Импортировать файл  → onAction('import')   — opens ImportStartScreen
 *   📚 Выбрать из каталога → onAction('catalog')  — opens with catalog expanded
 *   📦 Начать с нуля       → onAction('free')     — dismiss + drag from palette
 *
 * Wizard-preset shortcuts (restriction / gibson / golden_gate / mutagenesis)
 * are gone — they all routed to the same import flow after K8. Wizards now
 * launch from the canvas Действия ▾ dropdown after a plasmid is loaded.
 */
const PRIMARY = [
  { id: 'import',  icon: '📂', tone: 'blue',
    label: 'Импортировать файл', desc: '.dna · .gb · .gbk · .fasta — или вставка' },
  { id: 'catalog', icon: '📚', tone: 'purple',
    label: 'Выбрать из каталога', desc: '2800+ плазмид SnapGene + ваша библиотека' },
];

const TONE = {
  blue:   'bg-blue-50 border-blue-200 hover:border-blue-400 hover:bg-blue-100 text-blue-700',
  purple: 'bg-purple-50 border-purple-200 hover:border-purple-400 hover:bg-purple-100 text-purple-700',
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
