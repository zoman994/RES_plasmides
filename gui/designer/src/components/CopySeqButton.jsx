/**
 * CopySeqButton — small clipboard button with "Copied!" tooltip.
 */
import { useState } from 'react';

export default function CopySeqButton({ sequence, size = 16, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!sequence) return;
    navigator.clipboard.writeText(sequence).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button onClick={handleCopy} title={copied ? 'Скопировано!' : 'Копировать последовательность'}
      className={`relative inline-flex items-center justify-center rounded hover:bg-gray-100 transition shrink-0 ${className}`}
      style={{ width: size, height: size }}>
      <span className="text-gray-400 hover:text-gray-600" style={{ fontSize: size * 0.7 }}>
        {copied ? '\u2713' : '\uD83D\uDCCB'}
      </span>
      {copied && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] bg-gray-800 text-white px-1.5 py-0.5 rounded whitespace-nowrap">
          Скопировано!
        </span>
      )}
    </button>
  );
}
