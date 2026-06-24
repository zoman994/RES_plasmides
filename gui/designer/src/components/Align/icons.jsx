/**
 * Tiny inline line-icons (lucide-style: 24-grid, stroke 1.7, currentColor).
 * lucide-react isn't a dependency, so per DESIGN_SYSTEM §6 we hand-roll the few
 * icons the align panel needs as custom SVG. They inherit colour + size.
 */
function Svg({ size = 16, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconX = (p) => <Svg size={14} {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconSearch = (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
export const IconClipboard = (p) => <Svg {...p}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /></Svg>;
export const IconUpload = (p) => <Svg {...p}><path d="M12 15V3M7 8l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Svg>;
export const IconDatabase = (p) => <Svg {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Svg>;
export const IconWave = (p) => <Svg {...p}><path d="M2 12h3l2-6 3 12 3-9 2 3h7" /></Svg>;
// Minimal double-helix: two mirrored strands crossing once, three rungs.
// Replaces the earlier lopsided helix (Игорь: «иконка стрёмная»).
export const IconHelix = (p) => <Svg {...p}><path d="M7 4c0 5 10 5 10 8s-10 3-10 8" /><path d="M17 4c0 5-10 5-10 8s10 3 10 8" /><path d="M9 7h6M9.5 12h5M9 17h6" /></Svg>;
export const IconCircle = (p) => <Svg size={13} {...p}><circle cx="12" cy="12" r="8" /></Svg>;
export const IconLinear = (p) => <Svg size={13} {...p}><path d="M3 12h18" /></Svg>;
