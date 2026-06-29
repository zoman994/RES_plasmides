/**
 * op-icons — SVG icons для operation kinds.
 *
 * T15 (14.05.2026 — TIER-T). Заменяет emojis (🧬🔪🧪⛓🪢🧫⚗) на
 * inline SVG для консистентного рендера на всех платформах.
 *
 * Каждый icon — простой 16×16 viewBox stroke shape, наследует currentColor.
 */
import { memo } from 'react';

const SIZE = 16;

function PcrIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 5 Q8 1 13 5" />
      <path d="M3 11 Q8 15 13 11" />
      <path d="M3 5 L3 11" />
      <path d="M13 5 L13 11" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
    </svg>
  );
}

function CutIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="4" cy="4" r="2" />
      <circle cx="4" cy="12" r="2" />
      <path d="M6 4 L14 12" />
      <path d="M6 12 L14 4" />
    </svg>
  );
}

function GibsonIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 8 L6 8" />
      <path d="M10 8 L14 8" />
      <path d="M6 8 Q8 4 10 8" />
      <path d="M6 8 Q8 12 10 8" />
    </svg>
  );
}

function GoldenGateIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="6" width="4" height="4" rx="1" />
      <rect x="10" y="6" width="4" height="4" rx="1" />
      <path d="M6 8 L10 8" strokeDasharray="1 1" />
    </svg>
  );
}

function LigateIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 8 L7 8" />
      <path d="M9 8 L14 8" />
      <path d="M6 6 L8 6" />
      <path d="M8 10 L10 10" />
    </svg>
  );
}

function KldIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5" />
      <path d="M6 6 L10 10" />
      <path d="M10 6 L6 10" />
    </svg>
  );
}

function MutagenesisIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 2 L5 7 L2 14 L14 14 L11 7 L11 2" />
      <path d="M5 2 L11 2" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

function BluntIcon() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 6 L11 6" />
      <path d="M2 10 L11 10" />
      <path d="M11 5 L11 11" />
    </svg>
  );
}

const ICONS = {
  pcr: PcrIcon,
  cut: CutIcon,
  gibson: GibsonIcon,
  golden_gate: GoldenGateIcon,
  ligate: LigateIcon,
  kld: KldIcon,
  mutagenesis: MutagenesisIcon,
  blunt: BluntIcon,
};

function OpIcon({ kind, size = SIZE, color }) {
  const Comp = ICONS[kind];
  if (!Comp) return null;
  return (
    <span
      data-testid={`op-icon-${kind}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: color || 'currentColor',
        lineHeight: 0,
      }}
    >
      <Comp />
    </span>
  );
}

export default memo(OpIcon);
