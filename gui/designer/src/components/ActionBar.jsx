export default function ActionBar({ primerCount, onExportProtocol, onExportGenBank, onOrderOligos, onComplete, completed }) {
  if (completed) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
      <span className="text-sm text-green-700 font-medium">✅ {primerCount} пар праймеров</span>
      <div className="flex-1" />
      <button onClick={onExportProtocol} className="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 border border-purple-200">
        📋 Протокол
      </button>
      <button onClick={onOrderOligos} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200">
        📧 Заказ олигов
      </button>
      <button onClick={onExportGenBank} className="text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200">
        💾 GenBank
      </button>
      <button onClick={onComplete} className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-medium">
        ✓ Завершить сборку
      </button>
    </div>
  );
}
