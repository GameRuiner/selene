#!/usr/bin/env python3
"""Calculate terrain-following lengths for the meridians drawn on Earth.

The script uses NOAA ETOPO 2022 surface elevation at 60 arc-seconds. It
downloads only the columns adjacent to the model's 30-degree meridians,
interpolates each meridian to its exact longitude, clamps elevations below
sea level to zero, and places the resulting heights on the WGS84 ellipsoid.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import tempfile
import urllib.request
from pathlib import Path


WGS84_A = 6_378_137.0
WGS84_INVERSE_FLATTENING = 298.257223563
WGS84_F = 1.0 / WGS84_INVERSE_FLATTENING
WGS84_E2 = 2.0 * WGS84_F - WGS84_F**2
ORIENTATIONS = tuple(range(0, 180, 30))
DATASET_URL = (
    "https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/"
    "60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc.ascii"
)
EAST_QUERY = "?z%5B0:1:10799%5D%5B0:1800:19800%5D"
WEST_QUERY = "?z%5B0:1:10799%5D%5B1799:1800:21599%5D"


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    urllib.request.urlretrieve(url, destination)


def parse_opendap_ascii(path: Path) -> tuple[list[float], list[list[float]], list[float]]:
    rows: list[list[float]] = []
    latitudes: list[float] = []
    longitudes: list[float] = []
    section = ""
    with path.open(encoding="utf-8") as source:
        for raw_line in source:
            line = raw_line.strip()
            if line.startswith("z.z["):
                section = "z"
                continue
            if line.startswith("z.lat["):
                section = "lat"
                continue
            if line.startswith("z.lon["):
                section = "lon"
                continue
            if not line:
                continue
            if section == "z" and line.startswith("["):
                _, values = line.split("]", 1)
                rows.append([float(value) for value in values.lstrip(", ").split(",")])
            elif section in {"lat", "lon"} and re.match(r"^-?\d", line):
                values = [float(value) for value in line.split(",")]
                if section == "lat":
                    latitudes.extend(values)
                else:
                    longitudes.extend(values)
    if len(rows) != 10_800 or len(latitudes) != 10_800 or len(longitudes) != 12:
        raise ValueError(f"Unexpected ETOPO subset dimensions in {path}")
    return latitudes, rows, longitudes


def wgs84_point(latitude_degrees: float, longitude_degrees: float, height: float) -> tuple[float, float, float]:
    latitude = math.radians(latitude_degrees)
    longitude = math.radians(longitude_degrees)
    sin_latitude = math.sin(latitude)
    cos_latitude = math.cos(latitude)
    prime_vertical_radius = WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_latitude**2)
    return (
        (prime_vertical_radius + height) * cos_latitude * math.cos(longitude),
        (prime_vertical_radius + height) * cos_latitude * math.sin(longitude),
        (prime_vertical_radius * (1.0 - WGS84_E2) + height) * sin_latitude,
    )


def distance(first: tuple[float, float, float], second: tuple[float, float, float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(first, second)))


def loop_length(latitudes: list[float], first_heights: list[float], second_heights: list[float], orientation: int) -> float:
    points = [wgs84_point(lat, orientation, height) for lat, height in zip(latitudes, first_heights)]
    opposite = orientation + 180
    points.extend(
        wgs84_point(lat, opposite, height)
        for lat, height in zip(reversed(latitudes), reversed(second_heights))
    )
    return sum(distance(points[index], points[(index + 1) % len(points)]) for index in range(len(points)))


def exact_meridian_columns(east_rows: list[list[float]], west_rows: list[list[float]]) -> dict[int, list[float]]:
    columns: dict[int, list[float]] = {}
    boundaries = tuple(range(-180, 180, 30))
    for index, longitude in enumerate(boundaries):
        lower_index = 11 if index == 0 else index - 1
        # The source cell centers are 1/120 degree to either side. Equal
        # weighting therefore interpolates to the exact 30-degree meridian.
        columns[longitude] = [
            max((east[index] + west[lower_index]) / 2.0, 0.0)
            for east, west in zip(east_rows, west_rows)
        ]
    return columns


def normalized_longitude(longitude: int) -> int:
    return ((longitude + 180) % 360) - 180


def calculate(east_path: Path, west_path: Path) -> dict[str, object]:
    latitudes, east_rows, east_longitudes = parse_opendap_ascii(east_path)
    west_latitudes, west_rows, west_longitudes = parse_opendap_ascii(west_path)
    if latitudes != west_latitudes:
        raise ValueError("ETOPO subsets have different latitude coordinates")
    columns = exact_meridian_columns(east_rows, west_rows)
    zero = [0.0] * len(latitudes)
    baseline_m = loop_length(latitudes, zero, zero, 0)
    loops = []
    for orientation in ORIENTATIONS:
        first_longitude = normalized_longitude(orientation)
        second_longitude = normalized_longitude(orientation + 180)
        length_m = loop_length(
            latitudes,
            columns[first_longitude],
            columns[second_longitude],
            orientation,
        )
        loops.append(
            {
                "orientationDegrees": orientation,
                "oppositeLongitudeDegrees": orientation + 180,
                "lengthKm": round(length_m / 1_000.0, 3),
                "terrainExcessKm": round((length_m - baseline_m) / 1_000.0, 3),
            }
        )
    return {
        "dataset": "NOAA NCEI ETOPO 2022 v1, ice surface elevation",
        "datasetResolutionArcSeconds": 60,
        "datasetUrl": "https://www.ncei.noaa.gov/products/etopo-global-relief-model",
        "heightRule": "max(ETOPO elevation, 0 m)",
        "referenceEllipsoid": {
            "name": "WGS84",
            "semiMajorAxisMeters": WGS84_A,
            "inverseFlattening": WGS84_INVERSE_FLATTENING,
        },
        "sampleLatitudeCountPerHalfMeridian": len(latitudes),
        "ellipsoidBaselineKm": round(baseline_m / 1_000.0, 3),
        "sourceColumnCentersDegrees": {
            "east": east_longitudes,
            "west": west_longitudes,
        },
        "loops": loops,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    default_cache = Path(tempfile.gettempdir()) / "moonwalk-etopo"
    parser.add_argument("--east-file", type=Path, default=default_cache / "east.txt")
    parser.add_argument("--west-file", type=Path, default=default_cache / "west.txt")
    parser.add_argument("--output", type=Path, default=Path("lib/earth-meridian-lengths.json"))
    args = parser.parse_args()
    if not args.east_file.exists():
        download(DATASET_URL + EAST_QUERY, args.east_file)
    if not args.west_file.exists():
        download(DATASET_URL + WEST_QUERY, args.west_file)
    result = calculate(args.east_file, args.west_file)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
