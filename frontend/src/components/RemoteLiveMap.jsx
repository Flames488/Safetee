import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, AttributionControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { reverseGeocode } from '../lib/geocode';
import { MAP_STYLE, createDotEl } from '../lib/mapStyle';
import './live-map.css';

// The viewer's side of a location share or journey tracker: plots a
// position handed to it as a prop (streamed in over the websocket — see
// LocationShareView.jsx/JourneyShareView.jsx) rather than sourcing GPS
// itself, since this is someone else's location, not the viewer's own.
// Same map system as LiveMap so both read as one consistent product
// instead of "real map here, bare link to Google Maps there."
export default function RemoteLiveMap({ position }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const hasFramedRef = useRef(false);
  const styleLoadedRef = useRef(false);
  const [address, setAddress] = useState(null);
  const [mapFailed, setMapFailed] = useState(false);
  const lastGeocodeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [3.3792, 6.5244],
      zoom: 15,
      attributionControl: false,
    });
    // compact:true alone (no customAttribution) — the style's own OSM/
    // OpenFreeMap/OpenMapTiles credit already covers what's legally
    // required; adding our own string on top just doubled it up into an
    // overflowing wall of text in this small a container.
    map.addControl(new AttributionControl({ compact: true }));
    // A real tile/style load failure (bad network, the tile host down)
    // previously left a silent black canvas with "Locating…" stuck
    // forever — no different, visually, from a slow-but-working load.
    // This surfaces it as an actual state instead, so the always-present
    // "Open in Google Maps" fallback reads as the obvious next step
    // rather than the map just looking broken.
    map.on('error', (e) => {
      console.error('Map failed to load:', e.error);
      setMapFailed(true);
    });
    // Defensive against a container that had zero size at construction
    // time (e.g. a layout pass not yet settled) — MapLibre doesn't always
    // pick this up on its own once the container's real size resolves.
    const resizeTimer = setTimeout(() => map.resize(), 150);
    mapRef.current = map;
    markerRef.current = new Marker({ element: createDotEl() });
    // Registered exactly once here, not inside the position effect below
    // — that effect re-runs on every websocket frame, and if it each
    // registered its own `once('load', ...)` while the (heavier, vector)
    // style was still loading, multiple stale closures would queue up
    // and fire in order once 'load' finally happened: the OLDEST queued
    // position would win the initial jumpTo, then each next-oldest one
    // would visibly yank the camera again right after. A single flag set
    // once here means a frame that arrives before the style is ready is
    // simply skipped — the next frame (another arrives every few
    // seconds) picks it up instead, with nothing stale left to replay.
    map.once('load', () => { styleLoadedRef.current = true; });
    return () => {
      clearTimeout(resizeTimer);
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current || !position?.lat || !position?.lng) return;

    if (!markerRef.current.getElement().isConnected) {
      markerRef.current.setLngLat([position.lng, position.lat]).addTo(map);
    } else {
      markerRef.current.setLngLat([position.lng, position.lat]);
    }
    // Only the very first fix snaps the camera — later updates ease
    // into place so a viewer who's zoomed/panned around isn't yanked
    // back to center on every single frame.
    if (!hasFramedRef.current) {
      hasFramedRef.current = true;
      map.jumpTo({ center: [position.lng, position.lat], zoom: 16 });
    } else {
      map.easeTo({ center: [position.lng, position.lat], duration: 900 });
    }

    const now = Date.now();
    if (now - lastGeocodeRef.current > 20_000) {
      lastGeocodeRef.current = now;
      reverseGeocode(position.lat, position.lng).then((label) => label && setAddress(label));
    }
  }, [position?.lat, position?.lng]);

  return (
    <div className="lm-wrap">
      <div ref={containerRef} className="lm-canvas" />
      {mapFailed && (
        <div className="lm-error">Map view unavailable right now — use "Open in Google Maps" below.</div>
      )}
      <div className="lm-address mono">{address || 'Locating…'}</div>
    </div>
  );
}
