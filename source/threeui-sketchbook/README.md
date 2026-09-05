# ThreeUI · Meng To Sketchbook

User-supplied reference: https://threeui.com/landing-pages/meng-to-sketchbook-landing-page

Canonical document: https://threeui.com/landing-pages/meng-to-sketchbook.html

Registered bundle: https://threeui.com/source-code/meng-to-sketchbook-landing-page.json

Retrieved 2026-09-05. Original HTML revision: `e0330548b1ac905cf1b81698163ffa29f8a3a8c39b8d39f9b71ba5b9255b6dd1`.
All six registered source files are archived here unchanged. `manifest.json` contains the upstream source and the exact binary manifest. Original ownership remains with the source authors; this archive does not assert a new license.

Runtime integration:

- `public/landing-pages/meng-to-sketchbook.html`: byte-exact canonical document, served locally with all 17 original assets at their original paths.
- `src/viewer/sketchbook/vendor/`: unmodified frame, typography helpers and recipes. The component body is extracted without alteration into `MengToSketchbookLandingPage.tsx`; unrelated landing page imports are omitted.
- `src/viewer/sketchbookScene.jsx`: uses the configured component props from the user's prompt, mounts lazily as scene nine, pauses on exit, restores page state, and releases its document on disposal.
- `src/viewer/sketchbook/localization.js` and `.css`: appended to the local document. Chinese copy, CJK serif fallback, localized index and accessibility labels, smaller responsive loupe, touch support, pause/reduced-motion handling, native viewer controls and asset error/retry notice. Authored artwork, 18-strip curled page geometry, lighting and original desktop riffle intro are preserved. The original bitmap lettering remains untouched.

No ThreeUI documentation page is embedded and no runtime CDN or package installation is required. The original registered shared stylesheet is archived; its unrelated component styles are not injected into the host viewer because the frame supplies its own inline layout and the authored document owns its CSS.

Verification: `npm test` checks all supplied hashes, including runtime copies. Browser tests exercise nine pages, loupe, zoom, touch, keyboard, reduced motion and scene isolation.
