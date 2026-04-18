import { useStore } from '../store';

export default function ImportDecisionModal({ data, onClose }) {
  const addPart = useStore(s => s.addPart);
  const setWizardPlasmid = useStore(s => s.setWizardPlasmid);
  const setViewerPart = useStore(s => s.setViewerPart);
  const setModalMode = useStore(s => s.setModalMode);
  const setImportedData = useStore(s => s.setImportedData);

  const isCircular = data.topology === 'circular';
  const seqLen = (data.sequence || '').length;
  const featureCount = (data.annotations || data.features || []).length;

  const makePart = () => ({
    id: `import_${Date.now()}`,
    name: data.name || 'Imported',
    type: isCircular ? 'plasmid' : 'misc_feature',
    sequence: data.sequence,
    length: seqLen,
    annotations: data.annotations || [],
    topology: data.topology,
    source: 'import',
    status: 'draft',
  });

  const handleAction = (actionId) => {
    const part = makePart();
    addPart(part);

    switch (actionId) {
      case 'restriction_cloning':
        useStore.getState().setWizardPresetMode('restriction_cloning');
        setWizardPlasmid(part);
        break;
      case 'backbone':
        useStore.getState().setWizardPresetMode('use_whole');
        setWizardPlasmid(part);
        break;
      case 'mutagenesis':
        useStore.getState().setWizardPresetMode('mutate');
        setWizardPlasmid(part);
        break;
      case 'view':
        setViewerPart(part);
        break;
      case 'library':
        setImportedData(data);
        setModalMode('library');
        break;
      case 'disassemble':
        useStore.getState().setWizardPresetMode('disassemble');
        setWizardPlasmid(part);
        break;
    }
    onClose();
  };

  const actions = [
    ...(isCircular ? [
      { id: 'restriction_cloning', icon: '🔪', label: 'Клонировать (restriction)', desc: 'Digest + insert + ligate' },
      { id: 'backbone',            icon: '⚗️', label: 'Использовать как backbone', desc: 'Gibson / GG сборка' },
      { id: 'mutagenesis',         icon: '🔄', label: 'Мутагенез',                 desc: 'KLD / QuikChange' },
    ] : []),
    { id: 'view',       icon: '👁', label: 'Просмотреть',            desc: 'Карта + аннотации' },
    { id: 'library',    icon: '📚', label: 'Сохранить в библиотеку', desc: 'Добавить и решить потом' },
    ...(isCircular ? [
      { id: 'disassemble', icon: '🧩', label: 'Разобрать на запчасти', desc: 'Все регионы → в библиотеку' },
    ] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[420px] bg-white rounded-xl shadow-2xl border overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b">
          <div className="text-sm font-bold text-gray-700">📂 {data.name || 'Файл'}</div>
          <div className="text-[10px] text-gray-400">
            {seqLen.toLocaleString()} п.н. · {isCircular ? 'circular' : 'linear'}
            {featureCount > 0 && ` · ${featureCount} features`}
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-2">
          <div className="text-xs text-gray-500 mb-2">Что сделать с этой плазмидой?</div>
          {actions.map(a => (
            <button key={a.id} onClick={() => handleAction(a.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-lg
                         hover:border-blue-300 hover:bg-blue-50/50 transition text-left group">
              <span className="text-xl shrink-0">{a.icon}</span>
              <div>
                <div className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{a.label}</div>
                <div className="text-[10px] text-gray-400">{a.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t flex justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1 text-gray-500 hover:bg-gray-100 rounded">Отмена</button>
        </div>
      </div>
    </div>
  );
}
