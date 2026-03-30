/**
 * SBOL Visual 3.0 glyphs as React SVG components.
 * Based on the SBOL Visual standard for synthetic biology.
 * All glyphs use a 36x36 viewBox for consistency.
 */

import { t } from './i18n';

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

// ═══════════ New glyphs ═══════════

/** Start codon — small filled chevron pointing right (compact CDS-like) */
export function StartCodonGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><polygon points="8,8 28,18 8,28" fill={color} fillOpacity="0.4" stroke={color} strokeWidth="2" strokeLinejoin="round" /></svg>;
}

/** Stop codon — filled square (stop sign) */
export function StopCodonGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><rect x="10" y="10" width="16" height="16" rx="2" fill={color} fillOpacity="0.35" stroke={color} strokeWidth="2" /></svg>;
}

/** Mutation — lightning/zigzag */
export function MutationGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><path d="M 20 4 L 13 15 L 23 17 L 14 32" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** Cleavage site — scissors (two crossed lines with circles) */
export function CleavageSiteGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><line x1="10" y1="8" x2="26" y2="28" stroke={color} strokeWidth="2" /><line x1="26" y1="8" x2="10" y2="28" stroke={color} strokeWidth="2" /><circle cx="10" cy="8" r="3" fill="none" stroke={color} strokeWidth="1.5" /><circle cx="26" cy="8" r="3" fill="none" stroke={color} strokeWidth="1.5" /></svg>;
}

/** Active site — 4-pointed star */
export function ActiveSiteGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><polygon points="18,4 21,14 32,14 23,21 26,32 18,25 10,32 13,21 4,14 15,14" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

/** Binding site — two facing arcs )( */
export function BindingSiteGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><path d="M 14 8 Q 6 18 14 28" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" /><path d="M 22 8 Q 30 18 22 28" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

/** Propeptide — triangle with dashed line */
export function PropeptideGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><polygon points="6,28 18,6 30,28" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" strokeLinejoin="round" /><line x1="10" y1="20" x2="26" y2="20" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" /></svg>;
}

/** Fusion — two chevrons joined */
export function FusionGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36"><polygon points="3,8 16,18 3,28" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /><polygon points="17,8 30,18 17,28" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

// ═══════════ Additional glyphs ═══════════

/** 5'UTR — open bracket with dot (cap site) */
export function UTR5Glyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path d="M 24 6 Q 8 18 24 30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="24" cy="6" r="3" fill={color} />
  </svg>;
}

/** 3'UTR — closing bracket with dot (polyA) */
export function UTR3Glyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path d="M 12 6 Q 28 18 12 30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="12" cy="30" r="3" fill={color} />
  </svg>;
}

/** IRES — double loop (internal ribosome entry) */
export function IRESGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path d="M 4 24 A 8 8 0 0 1 18 24" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1" />
    <path d="M 18 24 A 8 8 0 0 1 32 24" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1" />
    <line x1="2" y1="24" x2="34" y2="24" stroke={color} strokeWidth="2" />
  </svg>;
}

/** T2A — dashed line with scissors (self-cleavage) */
export function T2AGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <line x1="18" y1="4" x2="18" y2="32" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
    <path d="M 10 14 L 18 18 L 10 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 26 14 L 18 18 L 26 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/** HomologyArm — line with crossover (recombination) */
export function HomologyArmGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <line x1="4" y1="18" x2="32" y2="18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <path d="M 14 10 L 22 26 M 22 10 L 14 26" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

/** MCS — row of vertical ticks (multiple cloning site) */
export function MCSGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    {[8, 14, 20, 26].map(x => (
      <line key={x} x1={x} y1="8" x2={x} y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    ))}
    <line x1="4" y1="18" x2="32" y2="18" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

/** gRNA — arrow with loop (guide RNA targeting) */
export function GRNAGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path d="M 6 24 L 6 12 Q 6 6 12 6 L 24 6 Q 30 6 30 12 L 30 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <path d="M 26 12 L 30 16 L 34 12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="6" y1="24" x2="24" y2="24" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

/** Reporter — CDS chevron with star (fluorescence) */
export function ReporterGlyph({ size = 36, color = '#000' }) {
  return <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path d="M 2 10 L 22 10 L 32 18 L 22 26 L 2 26 Z" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.15" strokeLinejoin="round" />
    <circle cx="14" cy="18" r="4" fill={color} fillOpacity="0.4" />
  </svg>;
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
  // New glyphs
  start_codon: StartCodonGlyph,
  stop_codon: StopCodonGlyph,
  mutation: MutationGlyph,
  variation: MutationGlyph,
  cleavage_site: CleavageSiteGlyph,
  active_site: ActiveSiteGlyph,
  binding: BindingSiteGlyph,
  propeptide: PropeptideGlyph,
  fusion: FusionGlyph,
  poly_a: PolyAGlyph,
  stem_loop: AptamerGlyph,
  core_promoter: PromoterGlyph,
  catalytic: DomainGlyph,
  // Additional glyphs
  '5UTR': UTR5Glyph,
  '3UTR': UTR3Glyph,
  IRES: IRESGlyph,
  T2A: T2AGlyph,
  homology_arm: HomologyArmGlyph,
  MCS: MCSGlyph,
  gRNA: GRNAGlyph,
  reporter: ReporterGlyph,
  Kozak: RBSGlyph,
  ARS_CEN: OriginGlyph,
  loxP: RecombinationGlyph,
  FRT: RecombinationGlyph,
  polyA_signal: PolyAGlyph,
};

// All available glyph keys for the picker (ordered logically)
export const GLYPH_KEYS = [
  'CDS', 'promoter', 'terminator', 'rep_origin', 'marker', 'signal_peptide',
  'RBS', 'operator', 'enhancer', 'insulator',
  'restriction', 'recombination', 'scar', 'overhang',
  'tag', 'NLS', 'linker', 'domain', 'transmembrane',
  'intron', 'polyA', 'ncRNA', 'aptamer',
  'primer_bind', 'spacer', 'plasmid', 'misc_feature',
  'start_codon', 'stop_codon', 'mutation', 'cleavage_site',
  'active_site', 'binding', 'propeptide', 'fusion', 'catalytic',
  'reporter', '5UTR', '3UTR', 'IRES', 'T2A', 'MCS', 'gRNA', 'homology_arm', 'Kozak', 'ARS_CEN', 'loxP', 'FRT',
];

// i18n-aware label lookup: uses Proxy so GLYPH_LABELS[key] returns t('glyph.' + key)
export function getGlyphLabel(key) { return t('glyph.' + key); }

export const GLYPH_LABELS = new Proxy({}, {
  get(_, key) {
    if (typeof key === 'symbol') return undefined;
    return t('glyph.' + key);
  },
  ownKeys() { return GLYPH_KEYS; },
  getOwnPropertyDescriptor(_, key) {
    if (typeof key === 'symbol') return undefined;
    return { configurable: true, enumerable: true, value: t('glyph.' + key) };
  },
});

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
