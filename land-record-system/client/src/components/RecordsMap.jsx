import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, errMsg } from '../services/api.js';
import Spinner from './Spinner.jsx';
import { IconMap, IconPin, IconRefresh } from './icons.js';

/**
 * Full-record map view: plots every geocoded land record as a dot on an
 * OpenStreetMap map (data from GET /api/records/geo as GeoJSON). Clicking a
 * dot opens that record's detail modal via onPick(id).
 */
export default function RecordsMap({ onPick, height = 'h-[420px]' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  const [state, setState] = useState('loading'); // loading | ready | error
  const [errorText, setErrorText] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/records/geo')
      .then(async (res) => {
        if (cancelled) return;
        const geo = res.data;

        // Mount (or reuse) the map.
        if (!mapRef.current && containerRef.current) {
          const map = L.map(containerRef.current, { scrollWheelZoom: true });
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).addTo(map);
          mapRef.current = map;
        }
        const map = mapRef.current;

        // Fresh layer each load so refetches don't stack dots.
        if (map._lrsLayer) map.removeLayer(map._lrsLayer);
        const layer = L.featureGroup().addTo(map);
        map._lrsLayer = layer;

        (geo.features || []).forEach((f) => {
          const p = f.properties || {};
          const [lng, lat] = f.geometry.coordinates;
          const marker = L.circleMarker([lat, lng], {
            radius: 7,
            color: '#0E7490',
            weight: 2,
            fillColor: p.landType === 'Agricultural' ? '#15803D' : p.landType === 'Commercial' ? '#F59E0B' : '#0E7490',
            fillOpacity: 0.85,
          });
          marker.bindPopup(
            `<div style="min-width:180px;font-family:inherit">
               <div style="font-weight:700;color:#0f172a">${escapeHtml(p.ownerName || 'Unknown owner')}</div>
               <div style="color:#475569;font-size:12px;margin-top:2px">
                 ${escapeHtml([p.village, p.district].filter(Boolean).join(', ') || '—')}
               </div>
               <div style="color:#64748b;font-size:12px;margin-top:2px">
                 Khatian ${escapeHtml(p.khatianNumber || '—')} · Plot ${escapeHtml(p.plotNumber || '—')}
                 ${p.area ? ` · ${escapeHtml(String(p.area))} ${escapeHtml(p.areaUnit || '')}` : ''}
               </div>
               <button data-record-id="${p.id}" class="lrs-popup-open"
                 style="margin-top:8px;background:#0E7490;color:#fff;border:0;border-radius:8px;
                        padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer">
                 View full record
               </button>
             </div>`,
          );
          layer.addLayer(marker);
        });

        setTotal(geo.features?.length || 0);
        if ((geo.features || []).length) {
          map.fitBounds(layer.getBounds().pad(0.15));
        } else {
          map.setView([22.8, 79], 4);
        }
        setTimeout(() => map.invalidateSize(), 100);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorText(errMsg(err));
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Delegate popup button clicks to open the record modal.
  useEffect(() => {
    const onOpenClick = (e) => {
      const btn = e.target.closest?.('.lrs-popup-open');
      if (btn?.dataset.recordId && pickRef.current) pickRef.current(btn.dataset.recordId);
    };
    document.addEventListener('click', onOpenClick);
    return () => document.removeEventListener('click', onOpenClick);
  }, []);

  // Leaflet needs a size recalculation when it becomes visible.
  useEffect(() => {
    if (state === 'ready' && mapRef.current) {
      const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state]);

  useEffect(
    () => () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    },
    [],
  );

  const refetch = () => window.location.reload(); // simple; list refresh also re-renders map

  if (state === 'loading') {
    return (
      <div className={`panel flex flex-col items-center justify-center gap-2 ${height}`}>
        <Spinner size="lg" />
        <p className="animate-pulse text-sm text-slate-400">Loading map of all records…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={`panel flex flex-col items-center justify-center gap-3 ${height}`}>
        <IconMap className="text-2xl text-slate-400" />
        <p className="text-sm text-slate-500">{errorText || 'Map could not be loaded.'}</p>
        <button onClick={refetch} className="btn-secondary inline-flex items-center gap-1.5 !px-3 !py-1.5 text-sm">
          <IconRefresh className="text-xs" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <IconPin className="text-xs" /> Records with a known location
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {total} plotted
          </span>
        </p>
        <p className="hidden items-center gap-3 text-[11px] text-slate-400 sm:flex">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#15803D' }} /> Agricultural</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#F59E0B' }} /> Commercial</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#0E7490' }} /> Other</span>
        </p>
      </div>
      <div
        ref={containerRef}
        className={`relative z-0 w-full overflow-hidden rounded-xl ring-1 ring-slate-200 ${height}`}
        style={{ background: '#e8ecef' }}
      />
      <style>{`
        .leaflet-popup-content-wrapper { border-radius: 12px; }
        .leaflet-container { font-family: inherit; }
      `}</style>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
