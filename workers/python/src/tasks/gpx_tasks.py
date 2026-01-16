"""
GPX/FIT Analysis Tasks

Handles parsing and analysis of activity files.
"""

from . import app
import gpxpy
import numpy as np
from typing import Dict, Any, List
from scipy import signal


@app.task(name='analyze_gpx')
def analyze_gpx(gpx_content: str) -> Dict[str, Any]:
    """
    Parse and analyze a GPX file.

    Args:
        gpx_content: Raw GPX file content as string

    Returns:
        Dict containing parsed track data and calculated metrics
    """
    gpx = gpxpy.parse(gpx_content)

    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for point in segment.points:
                points.append({
                    'lat': point.latitude,
                    'lon': point.longitude,
                    'elevation': point.elevation,
                    'time': point.time.isoformat() if point.time else None,
                })

    if not points:
        return {'error': 'No track points found'}

    # Calculate metrics
    total_distance = gpx.length_3d()  # meters
    uphill, downhill = gpx.get_uphill_downhill()
    moving_data = gpx.get_moving_data()

    return {
        'points_count': len(points),
        'total_distance_m': total_distance,
        'total_distance_km': total_distance / 1000,
        'elevation_gain_m': uphill,
        'elevation_loss_m': downhill,
        'moving_time_s': moving_data.moving_time if moving_data else None,
        'stopped_time_s': moving_data.stopped_time if moving_data else None,
        'points': points,  # For map rendering
    }


@app.task(name='calculate_gap')
def calculate_gap(
    distance_m: float,
    elevation_diff_m: float,
    time_seconds: float
) -> Dict[str, float]:
    """
    Calculate Grade Adjusted Pace using Minetti equations.

    The Minetti equation models metabolic cost at different gradients:
    C_r = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6

    Args:
        distance_m: Horizontal distance in meters
        elevation_diff_m: Elevation change (positive = uphill)
        time_seconds: Time taken in seconds

    Returns:
        Dict with actual pace and grade-adjusted pace
    """
    if distance_m <= 0 or time_seconds <= 0:
        return {'error': 'Invalid distance or time'}

    # Calculate gradient (rise/run)
    gradient = elevation_diff_m / distance_m if distance_m > 0 else 0

    # Minetti cost function
    i = gradient
    cost = (155.4 * i**5 - 30.4 * i**4 - 43.3 * i**3 +
            46.3 * i**2 + 19.5 * i + 3.6)

    # Flat running cost (i=0)
    flat_cost = 3.6

    # Cost ratio determines pace adjustment
    cost_ratio = cost / flat_cost if flat_cost > 0 else 1

    # Actual pace (min/km)
    actual_pace = (time_seconds / 60) / (distance_m / 1000)

    # Grade adjusted pace
    gap = actual_pace / cost_ratio if cost_ratio > 0 else actual_pace

    return {
        'gradient_percent': gradient * 100,
        'actual_pace_min_km': actual_pace,
        'grade_adjusted_pace_min_km': gap,
        'cost_ratio': cost_ratio,
    }


@app.task(name='smooth_elevation')
def smooth_elevation(elevations: List[float], window_size: int = 5) -> List[float]:
    """
    Apply Savitzky-Golay filter to smooth noisy GPS elevation data.

    Args:
        elevations: List of raw elevation values
        window_size: Size of smoothing window (must be odd)

    Returns:
        List of smoothed elevation values
    """
    if len(elevations) < window_size:
        return elevations

    # Ensure window size is odd
    if window_size % 2 == 0:
        window_size += 1

    smoothed = signal.savgol_filter(
        elevations,
        window_length=window_size,
        polyorder=2
    )

    return smoothed.tolist()
