import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, errMsg } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Spinner from './Spinner.jsx';
import { IconPin, IconSave, IconMap, IconLoader } from './icons.js';

/**
 * Interactive map for a single land record.
 *
 * - Fetches GET /api/records/:id/map (server lazy-geocodes on first view).
 * - Renders an OpenStreetMap map with a palette-matched SVG pin.
 * - Officers (revenue_officer / senior_officer / admin) can drag the pin to
 *   the exact plot position and save it (PUT /api/records/:id, gis.source='manual').
 */

const OFFICER_ROLES = ['revenue_officer', 'senior_officer', 'admin'];
const INDIA_CENTER = [22.8, 79];

// SVG pin rendered inline — no image assets, crisp at any DPI, on-palette.
function pinIcon(color) {
  return L.divIcon({
    className: 'lrs-pin',
    html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 1C7.8 1 2 6.8 2 14c0 8.4 9.6 20.6 12.2 26.3a1 1 0 0 0 1.8 0C18.6 34.6 28 22.4 28 14 28 6.8 22.2 1 15 1z"
        fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="15" cy="14" r="5" fill="#ffffff"/>
    </svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -38],
  });
}

const TEAL_PIN = () => pinIcon('#0E7490');
const AMBER_PIN = () => pinIcon('#F59E0B');

function zoomFor(gis) {
  return gis?.precision === 'exact' ? 16 : 13;
}

export default function RecordMap({ recordId, initial = null, height = 'h-72' }) {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = OFFICER_ROLES.includes(user?.role);

  const [gis, setGis] = useState(initial);
  const [state, setState] = useState(initial ? 'ready' : 'loading'); // loading | ready | error | none
  const [errorText, setErrorText] = useState('');
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const adjustingRef = useRef(false);
  adjustingRef.current = adjusting;

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const load = useCallback(() => {
    setState('loading');
    setErrorText('');
    api
      .get(`/records/${recordId}/map`)
      .then((res) => {
        const g = res.data?.gis;
        if (g && g.lat != null && g.lng != null) {
          setGis(g);
          setState('ready');
        } else {
          setGis(null);
          setState('none');
        }
      })
      .catch((err) => {
        setErrorText(errMsg(err));
        setState('error');
      });
  }, [recordId]);

  // Lazy-geocode on first view only when no coordinates came with the record.
  useEffect(() => {
    if (!initial) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  // Create the map when data is ready (with or without coordinates); keep
  // refs for later updates. Guards make StrictMode's double-render safe.
  useEffect(() => {
    if (state !== 'ready' || !containerRef.current || mapRef.current) return undefined;

    const hasPin = gis && gis.lat != null;
    const center = hasPin ? [gis.lat, gis.lng] : INDIA_CENTER;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false, // don't hijack page/modal scrolling
      zoomControl: true,
      attributionControl: true,
    }).setView(center, hasPin ? zoomFor(gis) : 4);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const marker = L.marker(center, {
      icon: hasPin ? TEAL_PIN() : AMBER_PIN(),
      draggable: false,
    }).addTo(map);
    if (hasPin) {
      marker.bindTooltip(
        `${gis.displayName || 'Record location'}${gis.precision === 'approx' ? ' (approximate)' : ''}`,
        { direction: 'top', offset: [0, -40] },
      );
    }

    mapRef.current = map;
    markerRef.current = marker;

    // Re-click while adjusting moves the pin.
    map.on('click', (e) => {
      if (adjustingRef.current) marker.setLatLng(e.latlng);
    });

    // The modal animates in — settle size after layout.
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, recordId]);

  // Recentre when coordinates change after a save.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !gis?.lat) return;
    map.setView([gis.lat, gis.lng], zoomFor(gis));
    marker.setLatLng([gis.lat, gis.lng]);
    marker.setIcon(TEAL_PIN());
    if (marker.getTooltip()) {
      marker.setTooltipContent(
        `${gis.displayName || 'Record location'}${gis.precision === 'approx' ? ' (approximate)' : ''}`,
      );
    } else {
      marker.bindTooltip(
        `${gis.displayName || 'Record location'}${gis.precision === 'approx' ? ' (approximate)' : ''}`,
        { direction: 'top', offset: [0, -40] },
      );
    }
  }, [gis?.lat, gis?.lng, gis?.displayName, gis?.precision]);

  // Toggle adjust mode on the live map instance.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (adjusting) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      marker.dragging.enable();
      marker.setIcon(AMBER_PIN());
    } else {
      marker.dragging.disable();
      map.scrollWheelZoom.disable();
      if (gis?.lat != null) marker.setIcon(TEAL_PIN());
    }
  }, [adjusting, state, gis?.lat]);

  const startAdjust = () => {
    setAdjusting(true);
    if (state === 'none') setState('ready'); // mounts map with a default pin
  };

  const cancelAdjust = () => {
    setAdjusting(false);
    if (markerRef.current && gis?.lat != null) {
      markerRef.current.setLatLng([gis.lat, gis.lng]);
      markerRef.current.setIcon(TEAL_PIN());
    }
  };

  const savePin = async () => {
    const marker = markerRef.current;
    if (!marker) return;
    const { lat, lng } = marker.getLatLng();
    setSaving(true);
    try {
      const res = await api.put(`/records/${recordId}`, { gis: { lat, lng } });
      const saved = res.data?.record?.gis;
      setGis(saved || { lat, lng, displayName: '', source: 'manual', precision: 'exact' });
      setAdjusting(false);
      toast.success('Record location updated.');
    } catch (err) {
      toast.error(errMsg(err), { title: 'Could not save location' });
    } finally {
      setSaving(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 text-slate-400 ${height}`}>
        <Spinner size="lg" />
        <p className="animate-pulse text-sm">Finding the plot on the map…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 text-slate-500 ${height}`}>
        <IconMap className="text-2xl" />
        <p className="text-sm">{errorText || 'Map could not be loaded.'}</p>
        <button onClick={load} className="btn-secondary !px-3 !py-1.5 text-sm">Retry</button>
      </div>
    );
  }

  const showHint = state === 'none' && !adjusting;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <IconPin className="text-xs" /> Plot location
          {gis?.precision === 'approx' && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-100">
              approximate
            </span>
          )}
          {gis?.source === 'manual' && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
              officer-verified pin
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {!adjusting && canEdit && (
            <button
              onClick={startAdjust}
              className="btn-secondary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs"
              title="Set the exact plot position by clicking or dragging the pin"
            >
              <IconPin className="text-[11px]" />
              {state === 'none' ? 'Set location' : 'Adjust location'}
            </button>
          )}
          {adjusting && (
            <>
              <button
                onClick={cancelAdjust}
                disabled={saving}
                className="btn-secondary !px-3 !py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={savePin}
                disabled={saving}
                className="btn-primary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs disabled:opacity-60"
              >
                {saving ? <IconLoader className="animate-spin text-[11px]" /> : <IconSave className="text-[11px]" />}
                Save location
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative isolate w-full overflow-hidden rounded-xl ring-1 ring-slate-200 ${height} ${
          adjusting ? 'cursor-crosshair' : ''
        }`}
        style={{ background: '#e8ecef' }}
      />

      {adjusting && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <IconPin className="text-xs" />
          Click the map or drag the amber pin to the exact plot, then “Save location”.
        </p>
      )}

      {gis && !adjusting && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span className="max-w-md truncate" title={gis.displayName || ''}>
            {gis.displayName || `${gis.lat?.toFixed(5)}, ${gis.lng?.toFixed(5)}`}
          </span>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${gis.lat},${gis.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800"
          >
            Directions ↗
          </a>
        </div>
      )}

      {showHint && (
        <p className="text-xs text-slate-400">
          No coordinates yet — use <strong>Set location</strong> to place this plot on the map.
        </p>
      )}
    </div>
  );
}
