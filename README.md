# Asset Desk

A standalone, browser-local GLB inspection desk extracted from the Street Racer
asset showroom. Street Racer and its original showroom are unchanged. No game
models, game logic, game-specific assessments or Evolution Lab are included.

Open self-contained GLB files using **Open GLB files** or drag-and-drop. Multiple
files form a temporary session library. Nothing is uploaded or saved to a server;
refreshing clears the library. Model resources cannot request external URLs.

Includes orbit/pan/zoom, fly navigation, fit/reset, scene selection, searchable
objects, isolation/focus, animations and speed controls, studio light/exposure/grid,
source/runtime statistics, frame-time/draw-call overlay and inventory JSON export.
Fly navigation uses a keyboard and has no collision; orbit works with touch.
Dimensions use model units. Texture memory is estimated, not measured GPU memory.

Supports glTF 2 binary GLB with embedded resources and meshopt. Separate .gltf
folders, ZIP, FBX, Blender, Draco and KTX2 are not supported in this first version.
Large models can exhaust a phone's memory; files over 100 MB ask before opening.
This is an inspector, not an asset optimiser or a game-readiness certification.

## Develop

Node 22.12+ (24 LTS recommended):

```sh
npm ci
npm test
npm run build
npm run dev
```

Vercel uses `npm run build` and `dist`. No secrets, backend or database required.
Use feature branches and previews for future changes. Only the app is deployed;
models opened in the app remain in the visitor's tab. No analytics or upload API.

Source origin: amaanmalik/streetRacer showroom, copied November 2026. Three.js
and Vite retain their respective MIT notices under THIRD_PARTY_NOTICES/. This
repository does not grant redistribution rights to models you open yourself.
