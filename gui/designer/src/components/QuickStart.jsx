import { useRef } from 'react';

const actions = [
  { id: 'restriction',  icon: '🔪', label: 'Рестрикционное клонирование', desc: 'Вставить ген в вектор по RE-сайтам' },
  { id: 'gibson',       icon: '⚗️', label: 'Gibson / Overlap сборка',     desc: 'Собрать конструкт из нескольких фрагментов' },
  { id: 'golden_gate',  icon: '🔶', label: 'Golden Gate',                 desc: 'Модульная сборка Type IIS' },
  { id: 'mutagenesis',  icon: '🔄', label: 'Мутагенез',                   desc: 'Точечная мутация / делеция / инсерция' },
  { id: 'catalog',      icon: '📚', label: 'Каталог SnapGene',            desc: '2800+ плазмид с аннотациями' },
  { id: 'import',       icon: '📂', label: 'Импортировать плазмиду',      desc: '.dna · .gb · .gbk · .fasta' },
  { id: 'free',         icon: '📦', label: 'Свободная сборка',            desc: 'Перетащите запчасти из палитры' },
];

export default function QuickStart({ onAction }) {
  const fileRef = useRef(null);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">🧬</div>
          <h2 className="text-lg font-bold text-gray-700">BodgeGene</h2>
          <p className="text-xs text-gray-400">Конструктор генетических сборок</p>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {actions.map(a => (
            <button key={a.id}
              onClick={() => a.id === 'import' ? fileRef.current?.click() : onAction(a.id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg
                         hover:border-blue-300 hover:bg-blue-50/50 transition text-left group">
              <span className="text-xl shrink-0">{a.icon}</span>
              <div>
                <div className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{a.label}</div>
                <div className="text-[10px] text-gray-400">{a.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Hint */}
        <div className="text-center mt-4 text-[10px] text-gray-300">
          или перетащите файл в окно
        </div>

        {/* Hidden file input for import */}
        <input ref={fileRef} type="file" accept=".dna,.gb,.gbk,.fasta,.fa" multiple
          className="hidden"
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            onAction('import_file', files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
