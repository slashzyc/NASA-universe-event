# Interactive Moon and workspace entry

The home page renders an indexed WebGL sphere (64 latitude by 128 longitude
segments), with an orthographic camera, texture coordinates and shaded normals.
Dragging actually changes the sphere's rotation; it does not rotate a flat image.
The code is local, has no rendering-library CDN dependency, and caps pixel ratio
at 1.5 and rendering at approximately 30 frames per second. It stops rendering
when the Moon is outside the viewport, the document is hidden or the home scene
is detached. Sustained slow draw calls select the 2D fallback.

## Texture provenance

- Asset: `assets/imagery/moon-color-2025-2k.jpg`, 2048 × 1024 pixels.
- Source: [NASA CGI Moon Kit, item 4720](https://svs.gsfc.nasa.gov/4720/).
- Download: [2025 LROC color map, 2K JPEG](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg).
- Credit: **NASA's Scientific Visualization Studio**; visualization by Ernie Wright.
- Retrieved: 2026-11-13.
- SHA-256: `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170`.
- The NASA page says this map is optimized for aesthetics. Its original LROC WAC
  mosaic covers 70° N–70° S; polar areas use lower-resolution LOLA albedo, and color,
  exposure and missing pixels were adjusted for visualization.

This is a visual surface only. The fixed artistic light on the sphere is never
used as a scientific Sun position, terrain elevation or visibility measurement.
The workbench uses the existing verified LOLA terrain horizons and JPL Horizons
ephemerides for the selected coordinates, date and 2 m height.

## Scale and coverage

The global sphere shows **one cluster marker**, Connecting Ridge. Its three
research locations are only about a kilometre apart, so three artificially
separated global markers would be misleading. The regional panel plots them in a
local lunar east/north plane using their stored coordinates, with a 500 m scale.
The local panel then displays the nine actual samples at 25 m spacing in a
50 × 50 m footprint. These are discrete samples, not continuous terrain coverage.

Clicking an arbitrary globe or 2D map coordinate explicitly reports that no
calculable data is available and hides the analysis action. The generic exploration
links return to the supported-location chooser until a supported location is
selected. No nearby point is silently substituted.

The supported list stays available when WebGL is absent, texture loading fails,
or the user chooses 2D mode. The 2D image is not a scientific terrain layer.

## Controls and live navigation

- Mouse drag / one-finger touch: rotate. Two fingers: pinch to zoom.
- The wheel scrolls the page until the user activates the Moon by clicking or
  dragging it. Escape or focus leaving the canvas releases wheel zoom.
- Arrow keys rotate; plus/minus zoom. Reset, South pole, Pause/Auto rotate and 2D
  mode are keyboard-accessible controls. Reduced motion disables initial rotation.
- The home and workspace are both **live DOM** during the 560 ms horizontal slide.
  This does not use a screenshot, rasterized View Transition or prerecorded video.
- The outgoing home DOM is briefly placed in an isolated ShadowRoot, preserving
  its real canvas and event listeners while avoiding duplicate IDs and CSS clashes.
  The navigator remains ordinary DOM. The inactive scene is inert and then detached.
- HTML, styles, app module and current June data are warmed before entry. The
  workspace prepares its data before the slide, with a real waiting message.
  Escape finishes the animation immediately; reduced motion makes it instantaneous.
- `pushState` gives the ordinary `navigator.html` URL with full query parameters.
  Refresh opens the standard navigator. Back restores the selected home point;
  Forward restores the workspace. Keyboard focus moves into the workspace.
- If preparation fails, the home remains usable and the error offers retry.

## Verification

Run `node scripts/build.mjs`, serve `dist`, then run
`LUNAMARGIN_URL=http://127.0.0.1:4255/ node tests/explorer-globe-browser.mjs`
(set the environment variable using the syntax for your shell). The test uses
real built files, real WebGL, touch events and page history. It verifies desktop
and 390 px mobile interaction, two-finger zoom, non-hijacked scrolling, selected
ROI/point transfer, focus, Back/Forward, no horizontal overflow, reduced motion,
WebGL absence, texture failure and unsupported-coordinate blocking. Output and
measured timings are written to `test-results/explorer-globe/validation.json`.

Local browser timings measure this machine and local server, not Internet or
physical-phone performance. The existing R02 entry gate separately exercises all
nine homepage story points in both languages, historical links and saved exports.
