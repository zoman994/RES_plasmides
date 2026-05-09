/**
 * components/StartScreen/index.jsx — Sprint StartScreen-Pixel.
 *
 * Thin re-export shim. The legacy 365-line M-A.x StartScreen
 * (sidebar with «New project» / «Open .bodge» / «Recent
 * projects from store» / «Library» SidebarLink + RecentCard
 * grid + Importer entry) was archived as part of this rebuild —
 * the new pixel-perfect StartScreen lives in StartScreen.jsx
 * and replaces the canonical entry point.
 *
 * App.jsx import (`import StartScreen from './components/StartScreen'`)
 * keeps working unchanged — this re-export ensures backward
 * compatibility with that single callsite.
 */
export { default } from './StartScreen';
