/** SBOL Visual 3.0 glyphs as React SVG components. */

export function PromoterGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 6 28 L 6 10 L 28 10" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 23 5 L 28 10 L 23 15" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CDSGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 2 10 L 22 10 L 32 18 L 22 26 L 2 26 Z" stroke={color}
            strokeWidth="2" fill={color} fillOpacity="0.15" strokeLinejoin="round" />
    </svg>
  );
}

export function TerminatorGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="18" y1="28" x2="18" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="8" y1="8" x2="28" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function OriginGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="10" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function MarkerGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect x="6" y="10" width="24" height="16" rx="3" stroke={color}
            strokeWidth="2" fill={color} fillOpacity="0.15" />
      <line x1="12" y1="18" x2="24" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SignalGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 6 26 L 18 6 L 30 26 Z" stroke={color} strokeWidth="2"
            fill={color} fillOpacity="0.15" strokeLinejoin="round" />
    </svg>
  );
}

export function MiscGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect x="8" y="8" width="20" height="20" rx="4" stroke={color}
            strokeWidth="2" strokeDasharray="4 2" />
    </svg>
  );
}

const GLYPH_MAP = {
  promoter: PromoterGlyph,
  CDS: CDSGlyph,
  gene: CDSGlyph,
  terminator: TerminatorGlyph,
  rep_origin: OriginGlyph,
  marker: MarkerGlyph,
  signal_peptide: SignalGlyph,
  regulatory: PromoterGlyph,
  misc_feature: MiscGlyph,
  misc_RNA: MiscGlyph,
};

export function SBOLIcon({ type, size = 18, color = 'currentColor' }) {
  const Comp = GLYPH_MAP[type] || MiscGlyph;
  return <Comp size={size} color={color} />;
}
