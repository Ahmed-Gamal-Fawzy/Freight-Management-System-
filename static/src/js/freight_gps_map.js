/** @odoo-module */

import { rpc } from "@web/core/network/rpc";

// ── init map for div ──────────────────────────────────
function initFreightGpsMap(el) {

    const tripId    = parseInt(el.dataset.tripId);
    const initLat   = parseFloat(el.dataset.lat);
    const initLng   = parseFloat(el.dataset.lng);
    const startName = el.dataset.startName || '';
    const destName  = el.dataset.destName  || '';
    const name      = el.dataset.name      || 'Trip';

    // ── Status Bar ────────────────────────────────────────────
    el.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            color: white; padding: 10px 16px;
            display: flex; align-items: center;
            justify-content: space-between;
            font-size: 13px; flex-wrap: wrap; gap: 8px;
            border-radius: 12px 12px 0 0;
        ">
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="gps-live-dot" style="
                    width:10px; height:10px; border-radius:50%;
                    background:#00ff88; display:inline-block;
                "></span>
                <strong>🛰 LIVE GPS</strong> — ${name}
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
                <span>📍 <span class="gps-coord">${initLat.toFixed(5)}, ${initLng.toFixed(5)}</span></span>
                <span>🧭 <span class="gps-heading">--</span></span>
                <span>🕐 <span class="gps-time">--:--:--</span></span>
            </div>
        </div>
        <div class="gps-map-container" style="width:100%; height:420px; border-radius: 0 0 12px 12px; overflow:hidden;"></div>
    `;

    const mapContainer = el.querySelector('.gps-map-container');
    const coordEl      = el.querySelector('.gps-coord');
    const headingEl    = el.querySelector('.gps-heading');
    const timeEl       = el.querySelector('.gps-time');

    loadLeaflet().then(() => {
        const L = window.L;

        const map = L.map(mapContainer).setView([initLat, initLng], 7);

        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=ar', {
            attribution: '© Google Maps',
            maxZoom: 20,
        }).addTo(map);

        // ── truck marker ──────────────────────────────────────
        const truckIcon = L.divIcon({
            className: '',
            html: '<div class="truck-icon" style="font-size:30px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4)); transition:transform 0.5s ease; display:inline-block;">🚛</div>',
            iconSize:   [36, 36],
            iconAnchor: [18, 18],
        });

        const marker = L.marker([initLat, initLng], { icon: truckIcon })
            .addTo(map)
            .bindPopup(`<strong>🚛 ${name}</strong>`);

        // ── traveled path (blue solid) ────────────────────────
        const pathLine = L.polyline([], {
            color: '#0077ff', weight: 4, opacity: 0.85,
        }).addTo(map);

        // ── planned route (red dashed) ────────────────────────
        let plannedRouteLayer = null;

        // ── geocode helper ────────────────────────────────────
        function geocode(placeName) {
            const q = encodeURIComponent(placeName);
            return fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`)
                .then(r => r.json())
                .then(data => {
                    if (data && data.length > 0) {
                        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                    }
                    return null;
                })
                .catch(() => null);
        }

        // ── draw OSRM route between two points ────────────────
        function drawRoute(fromLat, fromLng, toLat, toLng) {
            const url = `https://router.project-osrm.org/route/v1/driving/` +
                `${fromLng},${fromLat};${toLng},${toLat}` +
                `?overview=full&geometries=geojson`;

            fetch(url)
                .then(r => r.json())
                .then(data => {
                    if (!data.routes || data.routes.length === 0) return;
                    if (plannedRouteLayer) map.removeLayer(plannedRouteLayer);
                    plannedRouteLayer = L.geoJSON(data.routes[0].geometry, {
                        style: {
                            color: '#ff4d4d', weight: 4,
                            opacity: 0.75, dashArray: '10, 10',
                        }
                    }).addTo(map);
                })
                .catch(e => console.warn('OSRM error:', e));
        }

        // ── state: resolved coords ────────────────────────────
        let startCoords = null;   // نقطة البداية (starting_point)
        let destCoords  = null;   // الوجهة (destination)

        // geocode both points then draw initial full route
        const geocodePromises = [];

        if (startName && startName.trim().length > 2) {
            geocodePromises.push(
                geocode(startName).then(c => { if (c) startCoords = c; })
            );
        }

        if (destName && destName.trim().length > 2) {
            geocodePromises.push(
                geocode(destName).then(c => {
                    if (c) {
                        destCoords = c;
                        // destination marker
                        L.marker([c.lat, c.lng], {
                            icon: L.divIcon({
                                html: '<div style="font-size:28px;">🏁</div>',
                                className: '', iconSize: [28, 28], iconAnchor: [14, 28],
                            })
                        }).addTo(map).bindPopup('<strong>Destination</strong>');
                    }
                })
            );
        }

        // after both geocodes done → draw full planned route (start → dest)
        Promise.all(geocodePromises).then(() => {
            if (startCoords && destCoords) {
                // draw the full planned route start → destination
                drawRoute(startCoords.lat, startCoords.lng, destCoords.lat, destCoords.lng);

                // start marker
                L.marker([startCoords.lat, startCoords.lng], {
                    icon: L.divIcon({
                        html: '<div style="font-size:24px;">🟢</div>',
                        className: '', iconSize: [24, 24], iconAnchor: [12, 12],
                    })
                }).addTo(map).bindPopup('<strong>Starting Point</strong>');

                // fit map to show the full route
                const bounds = L.latLngBounds(
                    [startCoords.lat, startCoords.lng],
                    [destCoords.lat,  destCoords.lng]
                );
                map.fitBounds(bounds, { padding: [40, 40] });
            } else if (destCoords) {
                drawRoute(initLat, initLng, destCoords.lat, destCoords.lng);
            }
        });

        // ── heading helpers ───────────────────────────────────
        let prevLat = initLat;
        let prevLng = initLng;

        function calcHeading(lat1, lng1, lat2, lng2) {
            const toRad = d => d * Math.PI / 180;
            const toDeg = r => r * 180 / Math.PI;
            const dLng  = toRad(lng2 - lng1);
            const y = Math.sin(dLng) * Math.cos(toRad(lat2));
            const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
            return (toDeg(Math.atan2(y, x)) + 360) % 360;
        }

        function headingLabel(deg) {
            return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
        }

        function rotateTruck(heading) {
            const iconEl = marker.getElement();
            if (iconEl) {
                const div = iconEl.querySelector('.truck-icon');
                if (div) div.style.transform = `rotate(${heading}deg)`;
            }
        }

        // ── polling ───────────────────────────────────────────
        let pollCount = 0;

        async function pollGPS() {
            try {
                const data = await rpc('/web/dataset/call_kw', {
                    model:  'freight.trip',
                    method: 'get_live_gps_data',
                    args:   [[tripId]],
                    kwargs: {},
                });

                if (!data || !data.current || !data.current.latitude) return;

                const cur    = data.current;
                const newLat = cur.latitude;
                const newLng = cur.longitude;

                const moved = Math.abs(newLat - prevLat) > 0.00001 ||
                              Math.abs(newLng - prevLng) > 0.00001;

                if (moved) {
                    const heading = calcHeading(prevLat, prevLng, newLat, newLng);
                    rotateTruck(heading);
                    headingEl.textContent = `${Math.round(heading)}° ${headingLabel(heading)}`;

                    // refresh remaining route (truck → dest) every 3 polls
                    if (pollCount % 3 === 0 && destCoords) {
                        drawRoute(newLat, newLng, destCoords.lat, destCoords.lng);
                    }

                    prevLat = newLat;
                    prevLng = newLng;
                }

                marker.setLatLng([newLat, newLng]);
                map.panTo([newLat, newLng], { animate: true, duration: 1.0 });

                if (data.path && data.path.length > 1) {
                    pathLine.setLatLngs(data.path.map(p => [p.lat, p.lng]));
                }

                coordEl.textContent = `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`;
                const now = new Date();
                timeEl.textContent = [
                    now.getHours().toString().padStart(2, '0'),
                    now.getMinutes().toString().padStart(2, '0'),
                    now.getSeconds().toString().padStart(2, '0'),
                ].join(':');

                pollCount++;
            } catch (e) {
                console.warn('GPS poll error:', e);
            }
        }

        pollGPS();
        const intervalId = setInterval(pollGPS, 5000);

        const observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                clearInterval(intervalId);
                observer.disconnect();
            }
        });
        observer.observe(document.body || document.documentElement, {
            childList: true, subtree: true,
        });
    });
}

// ── load leaflet ──────────────────────────────────────────────
function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise(resolve => {
        if (!document.querySelector('link[href*="leaflet"]')) {
            const link = document.createElement('link');
            link.rel  = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        const script  = document.createElement('script');
        script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

// ── observe DOM ───────────────────────────────────────────────
function observeGpsMaps() {
    const tryInit = () => {
        document.querySelectorAll('.freight-live-map:not([data-initialized])').forEach(el => {
            el.setAttribute('data-initialized', '1');
            initFreightGpsMap(el);
        });
    };
    tryInit();
    const observer = new MutationObserver(tryInit);
    observer.observe(document.body || document.documentElement, {
        childList: true, subtree: true,
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeGpsMaps);
} else {
    observeGpsMaps();
}