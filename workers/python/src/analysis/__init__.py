"""
Analysis Module

Provides GPX/FIT course and activity analysis.
"""

from .fit_parser import (
    FitActivityData,
    FitTrackPoint,
    parse_fit_content,
    parse_fit_to_gpx,
)
from .gpx_analyzer import AidStationAnalysis, CoursePoint, GPXCourseAnalyzer
from .performance_analyzer import (
    ActivityAnalysisResult,
    ActivityPerformanceAnalyzer,
    aggregate_performance_profiles,
    GradientCategory,
    PerformanceProfile,
    SegmentMetrics,
)

__all__ = [
    "GPXCourseAnalyzer",
    "CoursePoint",
    "AidStationAnalysis",
    "ActivityPerformanceAnalyzer",
    "ActivityAnalysisResult",
    "PerformanceProfile",
    "GradientCategory",
    "SegmentMetrics",
    "aggregate_performance_profiles",
    "FitActivityData",
    "FitTrackPoint",
    "parse_fit_content",
    "parse_fit_to_gpx",
]
