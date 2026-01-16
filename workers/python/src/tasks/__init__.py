"""
AidStation Worker Tasks Package
"""

from ..celery_app import app

# Import all tasks to ensure they're registered with Celery
from .gpx_tasks import (
    analyze_gpx,
    analyze_gpx_course,
    analyze_user_activity,
    calculate_aid_station_metrics,
    calculate_gap,
    calculate_performance_profile,
    smooth_elevation,
)
from .prediction_tasks import *  # noqa: F401,F403

__all__ = [
    "app",
    "analyze_gpx",
    "analyze_gpx_course",
    "analyze_user_activity",
    "calculate_aid_station_metrics",
    "calculate_gap",
    "calculate_performance_profile",
    "smooth_elevation",
]
