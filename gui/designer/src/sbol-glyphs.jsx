/**
 * SBOL Visual 3.0 glyphs as React SVG components.
 * Based on the SBOL Visual standard for synthetic biology.
 * All glyphs use a 36x36 viewBox for consistency.
 */

// ═══════════ Core glyphs ═══════════

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
  // Asymmetric T: stem on left side, bar extends right → flips visibly with scale-x-[-1]
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="10" y1="28" x2="10" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="10" y1="8" x2="30" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
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

// ═══════════ SBOL Visual extended set ═══════════

/** RBS — Ribosome Binding Site: semicircle on backbone */
export function RBSGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 8 24 A 10 10 0 0 1 28 24" stroke={color} strokeWidth="2"
            fill={color} fillOpacity="0.15" />
      <line x1="4" y1="24" x2="32" y2="24" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Operator — small filled square on backbone */
export function OperatorGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect x="12" y="10" width="12" height="12" stroke={color} strokeWidth="2"
            fill={color} fillOpacity="0.25" />
      <line x1="4" y1="22" x2="32" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Insulator — double bracket (shield-like) */
export function InsulatorGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 12 6 L 6 6 L 6 30 L 12 30" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 24 6 L 30 6 L 30 30 L 24 30" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Restriction site — hourglass / bow-tie */
export function RestrictionGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 8 8 L 28 28 M 28 8 L 8 28" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" />
      <line x1="4" y1="18" x2="32" y2="18" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

/** Enhancer / UAS — curved arc above backbone */
export function EnhancerGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 6 22 Q 18 2 30 22" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" fill="none" />
      <line x1="4" y1="26" x2="32" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Recombination site (loxP, FRT) — filled triangle */
export function RecombinationGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 12 8 L 24 18 L 12 28 Z" stroke={color} strokeWidth="2"
            fill={color} fillOpacity="0.2" strokeLinejoin="round" />
      <line x1="4" y1="18" x2="12" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="18" x2="32" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Tag / Epitope — flag shape */
export function TagGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="8" y1="6" x2="8" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 8 8 L 28 8 L 22 15 L 28 22 L 8 22 Z" stroke={color}
            strokeWidth="2" fill={color} fillOpacity="0.15" strokeLinejoin="round" />
    </svg>
  );
}

/** Nuclear Localization Signal (NLS) — diamond */
export function NLSGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 18 6 L 30 18 L 18 30 L 6 18 Z" stroke={color} strokeWidth="2"
            fill={color} fillOpacity="0.12" strokeLinejoin="round" />
    </svg>
  );
}

/** Linker — zigzag wave */
export function LinkerGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 4 18 L 8 10 L 14 26 L 22 10 L 28 26 L 32 18"
            stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Intron — arc bridge over backbone */
export function IntronGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="4" y1="26" x2="12" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M 12 26 Q 18 4 24 26" stroke={color} strokeWidth="2" fill="none" />
      <line x1="24" y1="26" x2="32" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** PolyA signal — small T with dot */
export function PolyAGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="18" y1="28" x2="18" y2="14" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="10" y1="14" x2="26" y2="14" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="18" cy="8" r="3" fill={color} />
    </svg>
  );
}

/** Primer binding site — small arrow on backbone */
export function PrimerBindGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="4" y1="22" x2="28" y2="22" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 23 16 L 28 22 L 23 28" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ncRNA — non-coding RNA: wavy line */
export function NcRNAGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 4 18 C 8 8, 14 8, 18 18 C 22 28, 28 28, 32 18"
            stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Spacer / Scaffold — dashed line */
export function SpacerGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="4" y1="18" x2="32" y2="18" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray="4 3" />
      <circle cx="8" cy="18" r="2" fill={color} />
      <circle cx="28" cy="18" r="2" fill={color} />
    </svg>
  );
}

/** Assembly scar — lightning bolt */
export function ScarGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 20 4 L 14 16 L 22 16 L 16 32" stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** 5' / 3' Overhang — half-arrow sticky end */
export function OverhangGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <line x1="4" y1="14" x2="24" y2="14" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="12" y1="22" x2="32" y2="22" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="14" x2="24" y2="22" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

/** Aptamer — stem-loop hairpin */
export function AptamerGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="10" r="7" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1" />
      <line x1="18" y1="17" x2="18" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="12" y1="30" x2="24" y2="30" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Transmembrane domain — parallel lines through rectangle */
export function TransmembraneGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect x="10" y="4" width="16" height="28" rx="2" stroke={color} strokeWidth="2"
            fill={color} fillOpacity="0.08" />
      <line x1="4" y1="12" x2="32" y2="12" stroke={color} strokeWidth="1.5" />
      <line x1="4" y1="24" x2="32" y2="24" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/** Protein domain — rounded rectangle (filled) */
export function DomainGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect x="4" y="8" width="28" height="20" rx="6" stroke={color} strokeWidth="2"
            fill={color} fillOpacity="0.15" />
    </svg>
  );
}

/** Plasmid backbone — circle with gap */
export function PlasmidGlyph({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M 18 4 A 14 14 0 1 1 14 5" stroke={color} strokeWidth="2" fill="none" />
      <path d="M 12 2 L 15 6 L 11 7" stroke={color} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ═══════════ Registry ═══════════

const GLYPH_MAP = {
  promoter: PromoterGlyph,
  CDS: CDSGlyph,
  gene: CDSGlyph,
  terminator: TerminatorGlyph,
  rep_origin: OriginGlyph,
  marker: MarkerGlyph,
  signal_peptide: SignalGlyph,
  regulatory: OperatorGlyph,
  misc_feature: MiscGlyph,
  misc_RNA: NcRNAGlyph,
  primer_bind: PrimerBindGlyph,
  // Extended set
  RBS: RBSGlyph,
  operator: OperatorGlyph,
  insulator: InsulatorGlyph,
  restriction: RestrictionGlyph,
  enhancer: EnhancerGlyph,
  recombination: RecombinationGlyph,
  tag: TagGlyph,
  NLS: NLSGlyph,
  linker: LinkerGlyph,
  intron: IntronGlyph,
  polyA: PolyAGlyph,
  ncRNA: NcRNAGlyph,
  spacer: SpacerGlyph,
  scar: ScarGlyph,
  overhang: OverhangGlyph,
  aptamer: AptamerGlyph,
  transmembrane: TransmembraneGlyph,
  domain: DomainGlyph,
  plasmid: PlasmidGlyph,
};

// All available glyph keys for the picker (ordered logically)
export const GLYPH_KEYS = [
  'CDS', 'promoter', 'terminator', 'rep_origin', 'marker', 'signal_peptide',
  'RBS', 'operator', 'enhancer', 'insulator',
  'restriction', 'recombination', 'scar', 'overhang',
  'tag', 'NLS', 'linker', 'domain', 'transmembrane',
  'intron', 'polyA', 'ncRNA', 'aptamer',
  'primer_bind', 'spacer', 'plasmid', 'misc_feature',
];

export const GLYPH_LABELS = {
  CDS: 'CDS (ORF)',
  promoter: 'Промотор',
  terminator: 'Терминатор',
  rep_origin: 'Ориджин репликации',
  marker: 'Маркер селекции',
  signal_peptide: 'Сигнальный пептид',
  RBS: 'Сайт связ. рибосомы',
  operator: 'Оператор',
  enhancer: 'Энхансер / UAS',
  insulator: 'Инсулятор',
  restriction: 'Сайт рестрикции',
  recombination: 'Сайт рекомбинации',
  scar: 'Скар сборки',
  overhang: 'Липкий конец',
  tag: 'Тег / Эпитоп',
  NLS: 'NLS / Ядерная лок.',
  linker: 'Линкер',
  domain: 'Белковый домен',
  transmembrane: 'Трансмембранный',
  intron: 'Интрон',
  polyA: 'PolyA-сигнал',
  ncRNA: 'нкРНК',
  aptamer: 'Аптамер / Шпилька',
  primer_bind: 'Сайт праймера',
  spacer: 'Спейсер',
  plasmid: 'Плазмида',
  misc_feature: 'Прочее',
};

export function SBOLIcon({ type, size = 18, color = 'currentColor' }) {
  let Comp = GLYPH_MAP[type];
  if (!Comp) {
    // Check custom types for glyph override
    try {
      const custom = JSON.parse(localStorage.getItem('pvcs-custom-part-types') || '[]');
      const ct = custom.find(t => t.value === type);
      if (ct?.glyph) Comp = GLYPH_MAP[ct.glyph];
    } catch {}
  }
  return (Comp || MiscGlyph)({ size, color });
}
