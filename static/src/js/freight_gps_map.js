/** @odoo-module */

import { rpc } from "@web/core/network/rpc";

// ── init map for div ──────────────────────────────────
function initFreightGpsMap(el) {

    const tripId = parseInt(el.dataset.tripId);
    const lat    = parseFloat(el.dataset.lat);
    const lng    = parseFloat(el.dataset.lng);
    const destName = el.dataset.destName || '';
    const name   = el.dataset.name || 'Trip';

    // ── Status Bar ─────────────────────────────────────────────
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
                <span>📍 <span class="gps-coord">${lat.toFixed(5)}, ${lng.toFixed(5)}</span></span>
                <span>🕐 <span class="gps-time">--:--:--</span></span>
            </div>
        </div>
        <div class="gps-map-container" style="width:100%; height:420px; border-radius: 0 0 12px 12px; overflow:hidden;"></div>
    `;

    const mapContainer = el.querySelector('.gps-map-container');
    const coordEl      = el.querySelector('.gps-coord');
    const timeEl       = el.querySelector('.gps-time');

    // ── load leaflet ──────────────────────────────────────────
    loadLeaflet().then(() => {
        const L = window.L;

        // map
        const map = L.map(mapContainer).setView([lat, lng], 13);

        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=ar', {
            attribution: '© Google Maps',
            maxZoom: 20,
        }).addTo(map);

        // truck icon
        const truckIcon = L.divIcon({
            className: '',
            html: '<div style="font-size:30px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">🚛</div>',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
        });

        const marker = L.marker([lat, lng], { icon: truckIcon })
            .addTo(map)
            .bindPopup(`<strong>🚛 ${name}</strong>`);

        // path (live GPS)
        const pathLine = L.polyline([], {
            color: '#0077ff',
            weight: 4,
            opacity: 0.8,
        }).addTo(map);

        // draw Planned Route (Start to Dest)
        if (destName && destName.trim().length > 3) {
            const query = encodeURIComponent(destName);
            fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`)
                .then(r => r.json())
                .then(geoData => {
                    if (geoData && geoData.length > 0) {
                        const destLat = parseFloat(geoData[0].lat);
                        const destLng = parseFloat(geoData[0].lon);
                        
                        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson`;
                        fetch(osrmUrl)
                          .then(r => r.json())
                          .then(data => {
                              if (data.routes && data.routes.length > 0) {
                                  // Draw dotted line for the planned path
                                  L.geoJSON(data.routes[0].geometry, {
                                      style: { color: '#ff4d4d', weight: 4, opacity: 0.7, dashArray: '10, 10' }
                                  }).addTo(map);
                                  
                                  // Destination Marker
                                  L.marker([destLat, destLng], {
                                      icon: L.divIcon({ html: '<div style="font-size:28px;">🏁</div>', className: '', iconSize: [28,28], iconAnchor: [14, 28] })
                                  }).addTo(map).bindPopup('<strong>Destination</strong>');
                              }
                          }).catch(e => console.warn('OSRM error:', e));
                    }
                }).catch(e => console.warn('Geocoding error:', e));
        }

        // ── Polling ────────────────────────────────────────────
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
                const newPos = L.latLng(cur.latitude, cur.longitude);

                // move marker
                marker.setLatLng(newPos);
                map.panTo(newPos, { animate: true, duration: 1.0 });

                // draw path
                if (data.path && data.path.length > 1) {
                    pathLine.setLatLngs(
                        data.path.map(p => [p.lat, p.lng])
                    );
                }

                // update Status Bar
                coordEl.textContent = `${cur.latitude.toFixed(5)}, ${cur.longitude.toFixed(5)}`;

                const now = new Date();
                timeEl.textContent = [
                    now.getHours().toString().padStart(2, '0'),
                    now.getMinutes().toString().padStart(2, '0'),
                    now.getSeconds().toString().padStart(2, '0'),
                ].join(':');

            } catch (e) {
                console.warn('GPS poll error:', e);
            }
        }

        // start
        pollGPS();
        const intervalId = setInterval(pollGPS, 5000);

        // element polling
        const observer = new MutationObserver(() => {
            if (!document.contains(el)) {
                clearInterval(intervalId);
                observer.disconnect();
            }
        });
        const targetNode = document.body || document.documentElement;
        observer.observe(targetNode, { childList: true, subtree: true });
    });
}

// ── load leaflet ──────────────────────────
function loadLeaflet() {
    if (window.L) return Promise.resolve();

    return new Promise((resolve) => {
        // CSS
        if (!document.querySelector('link[href*="leaflet"]')) {
            const link = document.createElement('link');
            link.rel  = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        // JS
        const script = document.createElement('script');
        script.src   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

// ── Observer─────
function observeGpsMaps() {
    const tryInit = () => {
        document.querySelectorAll('.freight-live-map:not([data-initialized])').forEach(el => {
            el.setAttribute('data-initialized', '1');
            initFreightGpsMap(el);
        });
    };

    // when page load
    tryInit();

    // DOM (when Odoo open form)
    const observer = new MutationObserver(tryInit);
    const targetNode = document.body || document.documentElement;
    observer.observe(targetNode, { childList: true, subtree: true });
}

// ──start point────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeGpsMaps);
} else {
    observeGpsMaps();
}