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
  const [address, setAddress] = useState(null);
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
    map.addControl(new AttributionControl({ compact: true }));
    mapRef.current = map;
    markerRef.current = new Marker({ element: createDotEl() });
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position?.lat || !position?.lng) return;

    const place = () => {
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
    };

    if (map.isStyleLoaded()) place();
    else map.once('load', place);
  }, [position?.lat, position?.lng]);

  return (
    <div className="lm-wrap">
      <div ref={containerRef} className="lm-canvas" />
      <div className="lm-address mono">{address || 'Locating…'}</div>
    </div>
  );
}
