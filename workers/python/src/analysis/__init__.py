"""
Analysis Module

Provides GPX/FIT course and activity analysis.
"""

# Import performance_analyzer first (no external dependencies except gpxpy)
from .performance_analyzer import (
    ActivityAnalysisResult,
    ActivityPerformanceAnalyzer,
    aggregate_performance_profiles,
    GradientCategory,
    PerformanceProfile,
    SegmentMetrics,
)

from .gpx_analyzer import AidStationAnalysis, CoursePoint, GPXCourseAnalyzer
from .terrain_segment_analyzer import (
    analyze_activity_terrain_segments,
    GradeCategory,
    TerrainSegment,
    TerrainSegmentAnalysisResult,
    TerrainSegmentAnalyzer,
    TerrainType,
)

# FIT parser is optional (requires fitparse library)
try:
    from .fit_parser import (
        FitActivityData,
        FitTrackPoint,
        parse_fit_content,
        parse_fit_to_gpx,
    )
    _FIT_AVAILABLE = True
except ImportError:
    FitActivityData = None
    FitTrackPoint = None
    parse_fit_content = None
    parse_fit_to_gpx = None
    _FIT_AVAILABLE = False

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
    "TerrainSegmentAnalyzer",
    "TerrainSegment",
    "TerrainSegmentAnalysisResult",
    "TerrainType",
    "GradeCategory",
    "analyze_activity_terrain_segments",
]
