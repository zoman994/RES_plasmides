export default function ActionBar({ primerCount, primers = [], onExportProtocol, onExportGenBank, onOrderOligos, onComplete, completed }) {
  if (completed) return null;
  // V24 (Sprint X K6) — single-circular self-closure mode indicator.
  const selfClosure = primers.some(p => p?.purpose === 'self-closure');
  // Sprint X-fix K5 (U2) — single-linear terminal PCR indicator.
  const terminalPCR = primers.some(p => p?.purpose === 'terminal-pcr');
  return (
    <div className="flex flex-col gap-1">
      {selfClosure && (
        <div className="text-[10px] px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg italic"
             data-testid="self-closure-badge">
          ⟲ Режим: Self-closure (single circular, +30 bp замыкающий overlap)
        </div>
      )}
      {terminalPCR && (
        <div className="text-[10px] px-3 py-1 bg-sky-50 text-sky-800 border border-sky-200 rounded-lg italic"
             data-testid="terminal-pcr-badge">
          📏 Режим: Концевая ПЦР (single linear, без tails)
        </div>
      )}
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
    </div>
  );
}
