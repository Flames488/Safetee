import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, AttributionControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { reverseGeocode } from '../lib/geocode';
import { MAP_STYLE, createPersonEl, createDestinationEl } from '../lib/mapStyle';
import './live-map.css';

// Bearing between two points, in degrees — used when the device doesn't
// report coords.heading (very common while stationary, and on some
// browsers even while moving), so the marker can still visibly turn to
// face the direction of actual travel between fixes.
function bearingBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Self-contained live tracking map: watches the device's own GPS
// continuously (independent of how often the journey check-in itself
// fires — see LiveTracking.jsx) so the person marker actually animates
// between fixes instead of only jumping once every check-in cycle.
// `destination` is optional ({lat, lng, label}) — journeys created
// before destination coordinates existed, or without picking an
// autocomplete suggestion, just render the live marker alone.
export default function LiveMap({ destination }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const lastFixRef = useRef(null);
  const headingRef = useRef(0);
  const [address, setAddress] = useState(null);
  const [gpsError, setGpsError] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const lastGeocodeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [3.3792, 6.5244],
      zoom: 16,
      pitch: 45,
      attributionControl: false,
      dragRotate: true,
    });
    // compact:true alone — the style's own OSM/OpenFreeMap/OpenMapTiles
    // credit already covers what's legally required; a duplicated custom
    // string on top overflowed into a wall of text in this small a space.
    map.addControl(new AttributionControl({ compact: true }));
    map.on('error', (e) => {
      console.error('Map failed to load:', e.error);
      setMapFailed(true);
    });
    const resizeTimer = setTimeout(() => map.resize(), 150);
    mapRef.current = map;

    markerRef.current = new Marker({ element: createPersonEl(), rotationAlignment: 'map' });

    if (!navigator.geolocation) {
      setGpsError(true);
      return () => {
        clearTimeout(resizeTimer);
        map.remove();
      };
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(false);
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const prev = lastFixRef.current;

        // A real compass heading (when the device provides one) always
        // wins; otherwise derive it from movement, but only once the
        // person has actually moved far enough that the bearing means
        // something — GPS noise while standing still would otherwise
        // make the marker visibly spin in place for no reason.
        let heading = pos.coords.heading;
        if ((heading === null || Number.isNaN(heading)) && prev) {
          if (distanceMeters(prev, fix) > 3) heading = bearingBetween(prev, fix);
          else heading = headingRef.current;
        }
        headingRef.current = heading || 0;
        lastFixRef.current = fix;

        if (!markerRef.current.getElement().isConnected) markerRef.current.setLngLat([fix.lng, fix.lat]).addTo(map);
        else markerRef.current.setLngLat([fix.lng, fix.lat]);
        markerRef.current.setRotation(headingRef.current);

        map.easeTo({ center: [fix.lng, fix.lat], bearing: headingRef.current, duration: 900 });

        // Reverse-geocoded at most once every 20s — a free public
        // geocoder shouldn't get a call on every single GPS fix.
        const now = Date.now();
        if (now - lastGeocodeRef.current > 20_000) {
          lastGeocodeRef.current = now;
          reverseGeocode(fix.lat, fix.lng).then((label) => label && setAddress(label));
        }
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(resizeTimer);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Destination marker/line — kept in its own effect since it only
  // changes when the journey prop does, not on every GPS fix.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !destination?.lat || !destination?.lng) return;

    const addDestination = () => {
      if (destMarkerRef.current) destMarkerRef.current.remove();
      destMarkerRef.current = new Marker({ element: createDestinationEl() })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);

      if (map.getSource('route')) {
        map.removeLayer('route');
        map.removeSource('route');
      }
      const from = lastFixRef.current;
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: from
              ? [[from.lng, from.lat], [destination.lng, destination.lat]]
              : [[destination.lng, destination.lat]],
          },
        },
      });
      map.addLayer({
        id: 'route', type: 'line', source: 'route',
        paint: { 'line-color': '#22C55E', 'line-width': 3, 'line-dasharray': [0.2, 1.5], 'line-opacity': 0.8 },
      });
    };

    if (map.isStyleLoaded()) addDestination();
    else map.once('load', addDestination);
  }, [destination?.lat, destination?.lng]);

  return (
    <div className="lm-wrap">
      <div ref={containerRef} className="lm-canvas" />
      {mapFailed && <div className="lm-error">Map view unavailable right now.</div>}
      <div className="lm-address mono">
        {gpsError ? 'Location unavailable' : address || 'Locating…'}
      </div>
    </div>
  );
}
