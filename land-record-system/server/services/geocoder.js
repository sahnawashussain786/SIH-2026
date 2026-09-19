/**
 * Geocoding service — resolves a land record's address parts (village, tehsil,
 * district, state) into latitude/longitude so records can be shown on a map.
 *
 * Uses OpenStreetMap's free Nominatim API (no API key needed), scoped to India.
 * A per-process in-memory cache prevents repeat lookups, and a minimum spacing
 * between live requests respects Nominatim's usage policy (≤1 req/sec).
 *
 * Every function is best-effort: on any failure it resolves to null and the
 * caller simply stores no coordinates — extraction and approval flows must
 * never fail because of a map lookup.
 */

import axios from "axios";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const APP_UA = "BHOOMI-AI/1.0 (land-record-digitization; SIH 2026)";
const TIMEOUT_MS = parseInt(process.env.GEOCODE_TIMEOUT_MS || "8000", 10);
const MIN_SPACING_MS = 1100; // Nominatim usage policy: max 1 request/second
const MAX_QUERY_LEN = 180;

/** @type {Map<string, {lat:number,lng:number,displayName:string}|null>} */
const cache = new Map();
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Build the most specific address query Nominatim can work with. */
export function buildQuery({ village, tehsil, district, state } = {}) {
  const parts = [village, tehsil, district, state]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    // Drop stray OCR labels that Nominatim would choke on ("Dist.", "Tehsil:")
    .map((p) => p.replace(/\b(dist\.?|district|tehsil|tahsil|block|circle|mouza|village|zilla|prant)\b\.?/gi, "").trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return `${parts.join(", ")}, India`.slice(0, MAX_QUERY_LEN);
}

/** One Nominatim lookup, cache-first, rate-limit-spaced. Returns null on failure. */
async function nominatimSearch(query) {
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const wait = MIN_SPACING_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);

  try {
    lastCallAt = Date.now();
    const { data } = await axios.get(NOMINATIM_URL, {
      params: {
        q: query,
        format: "jsonv2",
        limit: 1,
        countrycodes: "in",
        "accept-language": "en",
      },
      timeout: TIMEOUT_MS,
      headers: { "User-Agent": APP_UA },
    });

    const hit = Array.isArray(data) && data[0];
    const result = hit
      ? {
          lat: parseFloat(hit.lat),
          lng: parseFloat(hit.lon),
          displayName: String(hit.display_name || ""),
        }
      : null;
    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn("[geocoder] lookup failed for", JSON.stringify(query), "—", err.message);
    cache.set(key, null); // don't retry the same dead query forever
    return null;
  }
}

/**
 * Geocode a land record from its address fields. Tries the full address
 * (village + tehsil + district + state) first, then progressively coarser
 * combinations, so a missing village still yields an approximate district
 * location (precision: "approx").
 *
 * @returns {Promise<{lat:number,lng:number,displayName:string,precision:'exact'|'approx'}|null>}
 */
export async function geocodeAddress({ village, tehsil, district, state } = {}) {
  const combos = [
    [village, tehsil, district, state],
    [village, district, state],
    [tehsil, district, state],
    [district, state],
  ]
    .map((parts) => buildQuery(Object.fromEntries(
      parts.map((p, i) => [["village", "tehsil", "district", "state"][i], p]),
    )))
    .filter(Boolean);

  for (let i = 0; i < combos.length; i++) {
    const hit = await nominatimSearch(combos[i]);
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
      return { ...hit, precision: i === 0 ? "exact" : "approx" };
    }
  }
  return null;
}

/** Resolve (and persist) coordinates for a LandRecord document. Best-effort. */
export async function geocodeRecord(record) {
  try {
    if (!record?.village && !record?.district) return null;
    const hit = await geocodeAddress({
      village: record.village,
      tehsil: record.tehsil,
      district: record.district,
      state: record.state,
    });
    if (!hit) return null;
    record.gis = {
      lat: hit.lat,
      lng: hit.lng,
      displayName: hit.displayName,
      source: "nominatim",
      precision: hit.precision,
      geocodedAt: new Date(),
    };
    await record.save();
    return record.gis;
  } catch (err) {
    console.warn("[geocoder] geocodeRecord failed —", err.message);
    return null;
  }
}
