"""
Convert Antarctic Grounded Iceberg Dataset Sentinel-1 v1.2 GPKG → GeoJSON Lines for God's Eye View.

Reads the full dataset GPKG (EPSG:3031), reprojects polygon geometry to
EPSG:4326 (WGS84), rounds coordinates to 5 decimal places (~1 m precision),
selects display-relevant fields, and writes one GeoJSON Feature per line.
"""

import sys
import os
import json
import time
import geopandas as gpd
from shapely.geometry import mapping

GPKG_PATH = r"D:\D--Download\Antarctic_Grounded_Iceberg_Dataset_Sentinel1_v1.2.gpkg"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "data", "local_data", "icebergs_full")
OUT_FILE = os.path.join(OUT_DIR, "icebergs_full.geojsonl")

FIELDS = [
    "Global_UID", "Orbit", "Timestamp", "Date_Range",
    "Area_Mean_km2", "Area_Range_km2", "Bed_Depth",
    "Acquisition_Mode", "Latitude", "Longitude",
    "Fast_Ice_Overlap_Status"
]

def round_coords(geom, precision=5):
    if geom.is_empty:
        return geom
    geojson = mapping(geom)
    def _round_list(lst):
        if not lst:
            return lst
        if isinstance(lst[0], (int, float)):
            return [round(x, precision) for x in lst]
        return [_round_list(sub) for sub in lst]
    geojson['coordinates'] = _round_list(geojson['coordinates'])
    return geojson

def main():
    if not os.path.exists(GPKG_PATH):
        print(f"Error: Source GPKG not found at {GPKG_PATH}")
        sys.exit(1)

    print(f"Loading GPKG: {GPKG_PATH}...")
    t0 = time.time()
    gdf = gpd.read_file(GPKG_PATH)
    print(f"Loaded {len(gdf)} features in {time.time()-t0:.2f}s")

    print("Reprojecting EPSG:3031 -> EPSG:4326...")
    t0 = time.time()
    gdf = gdf.to_crs(epsg=4326)
    print(f"Reprojected in {time.time()-t0:.2f}s")

    os.makedirs(OUT_DIR, exist_ok=True)

    print("Converting features to GeoJSONL...")
    t0 = time.time()
    lines = []
    for idx, row in gdf.iterrows():
        props = {}
        for f in FIELDS:
            if f in row and row[f] is not None and str(row[f]) != 'nan':
                val = row[f]
                if isinstance(val, (float, int)):
                    props[f] = round(float(val), 4) if 'Area' in f else round(float(val), 5)
                else:
                    props[f] = str(val)

        geom = row.geometry
        if geom is None or geom.is_empty:
            continue

        feature = {
            "type": "Feature",
            "geometry": round_coords(geom, 5),
            "properties": props
        }
        lines.append(json.dumps(feature))

    print(f"Writing {len(lines)} features to {OUT_FILE}...")
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    size_mb = os.path.getsize(OUT_FILE) / (1024 * 1024)
    print(f"Successfully wrote {len(lines)} features ({size_mb:.2f} MB) in {time.time()-t0:.2f}s")

if __name__ == "__main__":
    main()
