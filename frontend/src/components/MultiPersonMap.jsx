import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, AttributionControl, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, createLabeledPersonEl, colorForIndex } from '../lib/mapStyle';
import './live-map.css';

const STALE_MS = 90_000; // no fresh frame in 90s reads as "last seen", not "live"

// Shows several people's live positions on one map at once — each a
// labeled, colored marker (an initial in a ring, not just a dot; color
// alone stops being enough to tell people apart past two) — instead of
// making a viewer open one person's share at a time. `people` is
// [{id, name, position: {lat,lng}|null, updatedAt: number|null}]; a
// missing/null position just means that person hasn't sent a fix yet
// (still connecting) and is shown in the legend without a map marker.
export default function MultiPersonMap({ people }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> Marker
  const [mapFailed, setMapFailed] = useState(false);
  const [, setTick] = useState(0); // re-render every 20s so "last seen" freshness stays live
  const hasFramedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [3.3792, 6.5244],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new AttributionControl({ compact: true }));
    map.on('error', (e) => {
      console.error('Map failed to load:', e.error);
      setMapFailed(true);
    });
    const resizeTimer = setTimeout(() => map.resize(), 150);
    mapRef.current = map;

    const tick = setInterval(() => setTick((t) => t + 1), 20_000);
    return () => {
      clearTimeout(resizeTimer);
      clearInterval(tick);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const place = () => {
      const withFix = people.filter((p) => p.position?.lat && p.position?.lng);
      const seenIds = new Set();

      withFix.forEach((person, i) => {
        seenIds.add(person.id);
        const color = colorForIndex(i);
        let marker = markersRef.current.get(person.id);
        if (!marker) {
          marker = new Marker({ element: createLabeledPersonEl(person.name, color) });
          markersRef.current.set(person.id, marker);
        }
        marker.setLngLat([person.position.lng, person.position.lat]);
        if (!marker.getElement().isConnected) marker.addTo(map);
      });

      // A person who dropped out of the list entirely (share ended)
      // loses their marker; one who's just between frames keeps their
      // last known position rather than disappearing on every gap.
      for (const [id, marker] of markersRef.current) {
        if (!seenIds.has(id) && !people.some((p) => p.id === id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }

      if (withFix.length > 0) {
        const coords = withFix.map((p) => [p.position.lng, p.position.lat]);
        if (!hasFramedRef.current) {
          hasFramedRef.current = true;
          if (coords.length === 1) {
            map.jumpTo({ center: coords[0], zoom: 15 });
          } else {
            const bounds = coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
            map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
          }
        } else if (coords.length === 1) {
          map.easeTo({ center: coords[0], duration: 900 });
        } else {
          const bounds = coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
          map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 900 });
        }
      }
    };

    if (map.isStyleLoaded()) place();
    else map.once('load', place);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(people.map((p) => [p.id, p.position?.lat, p.position?.lng]))]);

  const now = Date.now();

  return (
    <div className="lm-wrap">
      <div ref={containerRef} className="lm-canvas" />
      {mapFailed && <div className="lm-error">Map view unavailable right now.</div>}
      <div className="lm-legend">
        {people.map((person, i) => {
          const stale = !person.position || !person.updatedAt || now - person.updatedAt > STALE_MS;
          return (
            <span key={person.id} className={`lm-legend-item ${stale ? 'lm-legend-stale' : ''}`}>
              <span className="lm-legend-dot" style={{ background: colorForIndex(i) }} />
              {person.name}{!person.position ? ' · connecting…' : stale ? ' · last seen' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
