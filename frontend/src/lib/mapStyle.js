// Shared between LiveMap (self GPS) and RemoteLiveMap (a position streamed
// in from someone else over the websocket) — same look, same free no-API-
// key tile source, so both read as one consistent map system rather than
// two different UIs.

// OpenFreeMap's hosted "dark" vector style — explicitly free forever, no
// API key, no signup, no rate limit (unlike CARTO's legacy raster tiles,
// which started demanding a key and broke this feature in production —
// see git history). MapLibre fetches this URL itself and resolves its
// own vector/sprite/glyph sources, so no local style JSON to maintain.
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

export function createPersonEl() {
  const el = document.createElement('div');
  el.className = 'lm-person';
  el.innerHTML = `
    <span class="lm-person-pulse"></span>
    <svg class="lm-person-arrow" viewBox="0 0 32 32" width="32" height="32">
      <path d="M16 2 L27 27 L16 21 L5 27 Z" fill="#22C55E" stroke="#08090D" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `;
  return el;
}

// Same silhouette, no rotation — used where there's no heading data at
// all (a viewer receiving someone else's shared position has no compass
// stream, just lat/lng), so a fixed-orientation dot with the same pulse
// reads as "live" without implying a direction that isn't real data.
export function createDotEl() {
  const el = document.createElement('div');
  el.className = 'lm-person';
  el.innerHTML = `
    <span class="lm-person-pulse"></span>
    <span class="lm-dot"></span>
  `;
  return el;
}

export function createDestinationEl() {
  const el = document.createElement('div');
  el.className = 'lm-destination';
  el.innerHTML = `
    <svg viewBox="0 0 24 32" width="26" height="34">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="#F5A623"/>
      <circle cx="12" cy="12" r="4.5" fill="#08090D"/>
    </svg>
  `;
  return el;
}
