/**
 * ANTARIS Sea-Ice Cesium Data Layer
 *
 * Visualizes 2026-01-01 Antarctic Sea Ice concentration data directly
 * on the Cesium 3D Globe with qualitative color coding:
 * - Low (0.01 - 0.10): Translucent Cyan (#00e5ff, alpha 0.3)
 * - Moderate (0.11 - 0.30): Soft Blue (#0088ff, alpha 0.5)
 * - High (0.31 - 0.60): Indigo Purple (#7000ff, alpha 0.7)
 * - Very High (0.61 - 1.00): Deep Crimson/Magenta (#ff0080, alpha 0.85)
 */

import * as Cesium from 'cesium';

let _enabled = false;
let _pointPrimitiveCollection = null;
let _count = 0;
let _lastUpdate = null;
let _error = null;

/**
 * Color classification helper for Cesium Points.
 */
function getSeaIceCesiumColor(concentration) {
  const c = Math.max(0, Math.min(1, Number(concentration) || 0));
  if (c <= 0.05) return Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.2);
  if (c <= 0.10) return Cesium.Color.fromCssColorString('#00e5ff').withAlpha(0.4);
  if (c <= 0.30) return Cesium.Color.fromCssColorString('#0088ff').withAlpha(0.6);
  if (c <= 0.60) return Cesium.Color.fromCssColorString('#7000ff').withAlpha(0.75);
  return Cesium.Color.fromCssColorString('#ff0080').withAlpha(0.9);
}

export const seaIceLayer = {
  id: 'local-sea-ice',
  name: 'Sea Ice Concentration',
  icon: '❄️',
  source: 'Antarctic Sea Ice · 2026-01-01',
  updateInterval: 0,
  statsRefreshInterval: 1000,

  init: async (viewer) => {
    // Initialized on enable
  },

  update: async (viewer) => {
    // Static dataset; no auto-polling needed
  },

  getStats: () => {
    return {
      count: _count,
      lastUpdate: _lastUpdate,
      error: _error,
    };
  },

  enable: async (viewer) => {
    if (_enabled) return;
    _enabled = true;

    if (!_pointPrimitiveCollection && viewer) {
      try {
        _pointPrimitiveCollection = new Cesium.PointPrimitiveCollection();
        viewer.scene.primitives.add(_pointPrimitiveCollection);

        // Sample spatial points for visualization from backend point/profile API
        const response = await fetch('/api/sea-ice/status');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const statusData = await response.json();

        // Sample a spatial grid across Antarctic sea ice domain (-80° to -45° lat)
        const samplePoints = [];
        for (let lat = -78.0; lat <= -45.0; lat += 0.75) {
          for (let lon = -180.0; lon < 180.0; lon += 1.5) {
            samplePoints.push({ latitude: lat, longitude: lon });
          }
        }

        const profileRes = await fetch('/api/sea-ice/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: samplePoints }),
        });

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const items = profileData.profile || [];
          let activeCount = 0;

          for (const item of items) {
            const conc = item.sea_ice_concentration || 0;
            if (conc > 0.01) {
              const color = getSeaIceCesiumColor(conc);
              _pointPrimitiveCollection.add({
                position: Cesium.Cartesian3.fromDegrees(item.longitude, item.latitude, 1000),
                pixelSize: conc > 0.3 ? 6 : 4,
                color,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12000000),
              });
              activeCount++;
            }
          }

          _count = activeCount;
          _lastUpdate = Date.now();
          console.log(`[SEA ICE LAYER] Visualized ${activeCount} sea-ice concentration grid cells`);
        }
      } catch (err) {
        _error = `Failed to load sea ice visualization: ${err?.message || err}`;
        console.error('[SEA ICE LAYER] Load error:', err);
      }
    }

    if (_pointPrimitiveCollection) {
      _pointPrimitiveCollection.show = true;
    }
    viewer?.scene?.requestRender?.();
  },

  disable: (viewer) => {
    _enabled = false;
    if (_pointPrimitiveCollection) {
      _pointPrimitiveCollection.show = false;
    }
    viewer?.scene?.requestRender?.();
  },

  destroy: (viewer) => {
    _enabled = false;
    if (_pointPrimitiveCollection && viewer) {
      try {
        viewer.scene.primitives.remove(_pointPrimitiveCollection);
      } catch {
        /* ignore */
      }
      _pointPrimitiveCollection = null;
    }
  },
};

export default seaIceLayer;
