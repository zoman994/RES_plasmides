# BodgeGene branding assets

This directory contains the canonical vector sources used to generate the application icons.

| File | Purpose |
|---|---|
| `logo.svg` | Full amber-background application mark |
| `logo-mark.svg` | Transparent mark for UI and publication layouts |

The palette and visual rules are defined in [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Generated PWA icons live in `gui/designer/public/icons/` and are rebuilt from `logo.svg` with:

```powershell
cd gui/designer
node scripts/render-pwa-icons.mjs
```

Do not edit generated PNG files as independent sources. Keep user-facing wording in the locale dictionary rather than in this branding note.
