"""
Convert Antarctic Grounded Iceberg GPKG -> GeoJSON Lines for God's Eye View.

Reads the final dataset GPKG (EPSG:3031), reprojects polygon geometry to
EPSG:4326 (WGS84), selects display-relevant fields, and writes one GeoJSON
Feature per line to src/data/local_data/icebergs/icebergs.geojsonl.

Usage:
    python scripts/convert-icebergs-gpkg.py
"""

import json
import os
import sys

try:
    import geopandas as gpd
    from shapely.geometry import mapping
except ImportError:
    print("ERROR: geopandas and shapely are required.")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

INPUT_GPKG = os.path.join(
    os.path.dirname(PROJECT_ROOT),
    "Antarctic-Grounded-Iceberg-Detection",
    "demo_data",
    "Final_Product",
    "Grounded_Icebergs_Dataset_Final.gpkg",
)

OUTPUT_DIR = os.path.join(PROJECT_ROOT, "src", "data", "local_data", "icebergs")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "icebergs.geojsonl")

PROPERTY_FIELDS = [
    "Global_UID",
    "Timestamp",
    "Area_Mean_km2",
    "Bed_Depth",
    "Fast_Ice_Overlap_Status",
    "Latitude",
    "Longitude",
]


def round_coords(coords, precision):
    if isinstance(coords, (int, float)):
        return round(coords, precision)
    return [round_coords(c, precision) for c in coords]


def main():
    if not os.path.exists(INPUT_GPKG):
        print(f"ERROR: Source GPKG not found at:\n  {INPUT_GPKG}")
        sys.exit(1)

    print(f"Reading {INPUT_GPKG} ...")
    gdf = gpd.read_file(INPUT_GPKG)
    print(f"  {len(gdf)} features, CRS={gdf.crs}")

    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print(f"  Reprojecting from {gdf.crs} to EPSG:4326 ...")
        gdf = gdf.to_crs(epsg=4326)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Writing {OUTPUT_FILE} ...")
    count = 0
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for idx, row in gdf.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue

            # Build properties dict
            properties = {}
            for field in PROPERTY_FIELDS:
                val = row.get(field)
                if val is not None and hasattr(val, "item"):
                    val = val.item()
                properties[field] = val

            # Use Global_UID as the feature name for overlay labels
            properties["name"] = str(properties.get("Global_UID", f"Iceberg_{idx}"))

            # Convert geometry, rounding coords to 6 decimal places
            geom_dict = mapping(geom)
            geom_dict["coordinates"] = round_coords(geom_dict["coordinates"], 6)

            feature = {
                "type": "Feature",
                "geometry": geom_dict,
                "properties": properties,
            }
            f.write(json.dumps(feature, separators=(",", ":")) + "\n")
            count += 1

    print(f"  Wrote {count} features to {OUTPUT_FILE}")
    file_size = os.path.getsize(OUTPUT_FILE)
    print(f"  File size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
