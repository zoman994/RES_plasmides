import { useRef } from 'react';

export default function ImportPrompt({ action, onImportFile, onCancel }) {
  const fileRef = useRef(null);
  const labels = {
    restriction: { icon: '🔪', title: 'Рестрикционное клонирование', hint: 'Импортируйте плазмиду-вектор' },
    mutagenesis: { icon: '🔄', title: 'Мутагенез', hint: 'Импортируйте плазмиду для мутагенеза' },
  };
  const { icon, title, hint } = labels[action] || labels.restriction;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm w-full text-center">
        <div className="text-3xl mb-2">{icon}</div>
        <h3 className="text-base font-bold text-gray-700 mb-1">{title}</h3>
        <p className="text-xs text-gray-400 mb-6">{hint}</p>
        <button onClick={() => fileRef.current?.click()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          📂 Выбрать файл (.dna / .gb / .fasta)
        </button>
        <div className="text-[10px] text-gray-300 mt-3">или перетащите файл в окно</div>
        <button onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600 mt-4 block mx-auto">
          ← Назад к выбору метода
        </button>
        <input ref={fileRef} type="file" accept=".dna,.gb,.gbk,.fasta,.fa" className="hidden"
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) onImportFile(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
