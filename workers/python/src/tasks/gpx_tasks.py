"""
GPX/FIT Analysis Tasks

Celery tasks for parsing and analyzing GPX/FIT activity files
and race courses.
"""

import logging
import math
from dataclasses import asdict
from typing import Any, Dict, List

import gpxpy
from scipy import signal

from ..analysis import (
    ActivityPerformanceAnalyzer,
    aggregate_performance_profiles,
    GPXCourseAnalyzer,
)
from . import app

logger = logging.getLogger(__name__)


@app.task(name="analyze_gpx_course")
def analyze_gpx_course(
    gpx_content: str, aid_stations: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Analyze a GPX course file with optional aid station analysis.

    This is the primary task for processing race course GPX files.
    It applies Kalman filtering for elevation smoothing and calculates
    all metrics needed for race planning.

    Args:
        gpx_content: Raw GPX file content as string
        aid_stations: Optional list of aid station dicts with:
            - name: Station name
            - distanceKm: Distance from start in km (or lat/lon)
            - lat/lon: Coordinates (alternative to distanceKm)

    Returns:
        Dict containing:
            - course_stats: Overall course metrics
            - aid_stations: Enriched aid station data
            - elevation_profile: Sampled elevation data for charting
            - coordinates: Course coordinates for map rendering
    """
    try:
        analyzer = GPXCourseAnalyzer(gpx_content)

        result = {
            "success": True,
            "course_stats": analyzer.to_dict(),
            "elevation_profile": analyzer.get_elevation_profile(100),
        }

        # Analyze aid stations if provided
        if aid_stations:
            analyzed_stations = analyzer.analyze_aid_stations(aid_stations)
            result["aid_stations"] = [asdict(s) for s in analyzed_stations]

        # Include coordinates for map rendering (sampled to reduce payload)
        all_coords = analyzer.get_course_coordinates()
        if len(all_coords) > 500:
            # Sample to ~500 points for map rendering
            step = len(all_coords) // 500
            result["coordinates"] = all_coords[::step]
        else:
            result["coordinates"] = all_coords

        return result

    except Exception as e:
        return {"success": False, "error": str(e)}


@app.task(name="analyze_gpx")
def analyze_gpx(gpx_content: str) -> Dict[str, Any]:
    """
    Parse and analyze a GPX file (basic analysis).

    This is a simpler analysis suitable for user activity uploads
    rather than full course analysis.

    Args:
        gpx_content: Raw GPX file content as string

    Returns:
        Dict containing parsed track data and calculated metrics
    """
    try:
        gpx = gpxpy.parse(gpx_content)

        points = []
        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    points.append(
                        {
                            "lat": point.latitude,
                            "lon": point.longitude,
                            "elevation": point.elevation,
                            "time": point.time.isoformat() if point.time else None,
                        }
                    )

        if not points:
            return {"error": "No track points found"}

        # Calculate metrics
        total_distance = gpx.length_3d()  # meters
        uphill, downhill = gpx.get_uphill_downhill()
        moving_data = gpx.get_moving_data()

        return {
            "success": True,
            "points_count": len(points),
            "total_distance_m": total_distance,
            "total_distance_km": total_distance / 1000,
            "elevation_gain_m": uphill,
            "elevation_loss_m": downhill,
            "moving_time_s": moving_data.moving_time if moving_data else None,
            "stopped_time_s": moving_data.stopped_time if moving_data else None,
            "points": points,  # For map rendering
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


@app.task(name="calculate_gap")
def calculate_gap(
    distance_m: float, elevation_diff_m: float, time_seconds: float
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
        return {"error": "Invalid distance or time"}

    # Calculate gradient (rise/run)
    gradient = elevation_diff_m / distance_m if distance_m > 0 else 0

    # Minetti cost function
    i = gradient
    cost = 155.4 * i**5 - 30.4 * i**4 - 43.3 * i**3 + 46.3 * i**2 + 19.5 * i + 3.6

    # Flat running cost (i=0)
    flat_cost = 3.6

    # Cost ratio determines pace adjustment
    cost_ratio = cost / flat_cost if flat_cost > 0 else 1

    # Actual pace (min/km)
    actual_pace = (time_seconds / 60) / (distance_m / 1000)

    # Grade adjusted pace
    gap = actual_pace / cost_ratio if cost_ratio > 0 else actual_pace

    return {
        "success": True,
        "gradient_percent": gradient * 100,
        "actual_pace_min_km": actual_pace,
        "grade_adjusted_pace_min_km": gap,
        "cost_ratio": cost_ratio,
    }


@app.task(name="smooth_elevation")
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

    smoothed = signal.savgol_filter(elevations, window_length=window_size, polyorder=2)

    return smoothed.tolist()


@app.task(name="calculate_aid_station_metrics")
def calculate_aid_station_metrics(
    gpx_content: str, aid_stations: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate detailed metrics for aid stations from GPX course.

    Args:
        gpx_content: GPX file content
        aid_stations: List of aid stations with name and distanceKm

    Returns:
        Dict with analyzed aid station data
    """
    try:
        analyzer = GPXCourseAnalyzer(gpx_content)
        analyzed = analyzer.analyze_aid_stations(aid_stations)

        return {"success": True, "aid_stations": [asdict(s) for s in analyzed]}

    except Exception as e:
        return {"success": False, "error": str(e)}


@app.task(name="analyze_user_activity", bind=True)
def analyze_user_activity(self, activity_id: str, gpx_content: str) -> Dict[str, Any]:
    """
    Analyze a user's GPX activity for performance metrics.

    Extracts detailed performance data including:
    - Pace by gradient category
    - Grade Adjusted Pace (GAP)
    - Fatigue curve (pace degradation)
    - Elevation and distance stats

    Args:
        activity_id: Unique ID for the activity
        gpx_content: Raw GPX file content

    Returns:
        Dict containing complete activity analysis
    """
    logger.info(
        f"[Task {self.request.id}] Starting analyze_user_activity for activity_id={activity_id}"
    )
    logger.info(
        f"[Task {self.request.id}] GPX content length: {len(gpx_content)} chars"
    )

    try:
        logger.info(f"[Task {self.request.id}] Creating ActivityPerformanceAnalyzer...")
        analyzer = ActivityPerformanceAnalyzer(gpx_content, activity_id)

        logger.info(f"[Task {self.request.id}] Running analysis...")
        result = analyzer.analyze()

        logger.info(
            f"[Task {self.request.id}] Analysis complete. "
            f"Distance: {result.total_distance_km:.2f}km, "
            f"Elevation gain: {result.elevation_gain_m:.0f}m, "
            f"Avg pace: {result.average_pace_min_km:.2f} min/km"
        )

        return {
            "success": True,
            "analysis": asdict(result),
        }

    except Exception as e:
        logger.error(
            f"[Task {self.request.id}] Error analyzing activity {activity_id}: {e}",
            exc_info=True,
        )
        return {
            "success": False,
            "error": str(e),
            "activity_id": activity_id,
        }


@app.task(name="calculate_performance_profile")
def calculate_performance_profile(
    activity_analyses: List[Dict[str, Any]], recency_half_life_days: int = 90
) -> Dict[str, Any]:
    """
    Calculate aggregated performance profile from multiple activity analyses.

    Uses recency weighting to give more importance to recent activities.

    Args:
        activity_analyses: List of ActivityAnalysisResult dicts from analyze_user_activity
        recency_half_life_days: Half-life for exponential decay (default 90 days)

    Returns:
        Dict containing performance profile with weighted metrics
    """
    from datetime import datetime

    from ..analysis import ActivityAnalysisResult, PerformanceProfile

    try:
        if not activity_analyses:
            return {
                "success": False,
                "error": "No activities provided",
            }

        # Reconstruct ActivityAnalysisResult objects
        analyses = []
        weights = []
        now = datetime.now()

        for activity in activity_analyses:
            # Skip failed analyses
            if not activity.get("success", True):
                continue

            analysis_data = activity.get("analysis", activity)

            # Calculate recency weight
            activity_date_str = analysis_data.get("activity_date")
            if activity_date_str:
                try:
                    activity_date = datetime.fromisoformat(
                        activity_date_str.replace("Z", "+00:00")
                    )
                    days_ago = (now - activity_date.replace(tzinfo=None)).days
                    weight = math.exp(-days_ago / recency_half_life_days)
                except Exception:
                    weight = 0.5  # Default weight for parse errors
            else:
                weight = 0.5  # Default weight if no date

            # Create ActivityAnalysisResult from dict
            result = ActivityAnalysisResult(
                activity_id=analysis_data.get("activity_id", "unknown"),
                name=analysis_data.get("name"),
                activity_date=analysis_data.get("activity_date"),
                total_distance_km=analysis_data.get("total_distance_km", 0),
                elevation_gain_m=analysis_data.get("elevation_gain_m", 0),
                elevation_loss_m=analysis_data.get("elevation_loss_m", 0),
                total_time_seconds=analysis_data.get("total_time_seconds", 0),
                moving_time_seconds=analysis_data.get("moving_time_seconds", 0),
                stopped_time_seconds=analysis_data.get("stopped_time_seconds", 0),
                average_pace_min_km=analysis_data.get("average_pace_min_km", 0),
                grade_adjusted_pace_min_km=analysis_data.get(
                    "grade_adjusted_pace_min_km", 0
                ),
                pace_by_gradient=analysis_data.get("pace_by_gradient", {}),
                fatigue_curve=analysis_data.get("fatigue_curve", []),
                fatigue_factor=analysis_data.get("fatigue_factor", 0),
                segment_count=analysis_data.get("segment_count", 0),
            )

            analyses.append(result)
            weights.append(weight)

        if not analyses:
            return {
                "success": False,
                "error": "No valid activities to analyze",
            }

        # Aggregate profiles with weights
        profile = aggregate_performance_profiles(analyses, weights)

        return {
            "success": True,
            "profile": asdict(profile),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }
