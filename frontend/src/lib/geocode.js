// Photon (komoot.io) — a free, no-API-key geocoder built on OpenStreetMap
// data, specifically designed for autocomplete-as-you-type use (unlike
// raw Nominatim, which asks callers not to hit it that way). Used for
// both forward search (JourneySetup's destination field) and reverse
// geocoding (LiveMap's current-position address).
const BASE_URL = 'https://photon.komoot.io/api/';
const REVERSE_URL = 'https://photon.komoot.io/reverse';

function formatFeature(feature) {
  const p = feature.properties || {};
  // Prefer a real street address; fall back through progressively less
  // precise fields rather than ever showing raw coordinates when a name
  // is available — a named landmark (p.name, when it's a POI rather than
  // just repeating the street) is the most useful fallback when there's
  // no house number for this exact point.
  if (p.housenumber && p.street) return `${p.housenumber} ${p.street}, ${p.city || p.district || ''}`.trim().replace(/,$/, '');
  if (p.street) return `${p.street}, ${p.city || p.district || ''}`.trim().replace(/,$/, '');
  if (p.name) return [p.name, p.city || p.district].filter(Boolean).join(', ');
  if (p.district) return [p.district, p.city].filter(Boolean).join(', ');
  return p.city || p.state || p.country || null;
}

// Forward search for autocomplete. Returns [] on any failure — a flaky
// geocoder should never block typing a destination manually.
export async function searchPlaces(query, { limit = 5 } = {}) {
  if (!query || query.trim().length < 3) return [];
  try {
    const url = `${BASE_URL}?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || [])
      .map((f) => ({
        label: formatFeature(f) || query,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      }))
      .filter((r) => r.label);
  } catch {
    return [];
  }
}

// Reverse geocode a live position into a readable address — street if
// available, else the nearest named place Photon knows about (a real
// landmark/suburb), never just raw coordinates unless the lookup itself
// fails entirely.
export async function reverseGeocode(lat, lng) {
  try {
    const url = `${REVERSE_URL}?lon=${lng}&lat=${lat}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.[0];
    return feature ? formatFeature(feature) : null;
  } catch {
    return null;
  }
}
