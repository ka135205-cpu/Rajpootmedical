# PWA Icons — placeholder

This project needs real PNG icons at:

- `/public/icons/icon-192.png` (192x192)
- `/public/icons/icon-512.png` (512x512)
- `/public/icons/icon-maskable-512.png` (512x512, safe-zone padded for maskable)

I could not generate actual binary image assets in this environment (no
image-generation tool available here). Options for Claude Code / whoever
picks this up next:

1. Export simple icons from the Rajput Medical Store logo (once you have
   one) using any image editor or an online PWA icon generator
   (e.g. https://realfavicongenerator.net or `npx pwa-asset-generator`).
2. Until then, `app/manifest.ts` references these paths — the app will
   still run and be installable, just with a broken/default icon in the
   install prompt until real files exist here.
