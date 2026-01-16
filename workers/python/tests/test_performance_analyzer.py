"""
Tests for Activity Performance Analyzer

Tests for user activity analysis and performance profile generation.
"""

import pytest
from src.analysis.performance_analyzer import (
    ActivityAnalysisResult,
    ActivityPerformanceAnalyzer,
    aggregate_performance_profiles,
    GradientCategory,
    PerformanceProfile,
    SegmentMetrics,
)


# Sample GPX with time data for pace calculations
SAMPLE_GPX_WITH_TIME = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AidStation Test">
  <trk>
    <name>Morning Trail Run</name>
    <trkseg>
      <trkpt lat="51.5000" lon="-0.1000">
        <ele>100</ele>
        <time>2026-01-15T08:00:00Z</time>
      </trkpt>
      <trkpt lat="51.5010" lon="-0.1000">
        <ele>110</ele>
        <time>2026-01-15T08:03:00Z</time>
      </trkpt>
      <trkpt lat="51.5020" lon="-0.1000">
        <ele>120</ele>
        <time>2026-01-15T08:06:00Z</time>
      </trkpt>
      <trkpt lat="51.5030" lon="-0.1000">
        <ele>130</ele>
        <time>2026-01-15T08:09:00Z</time>
      </trkpt>
      <trkpt lat="51.5040" lon="-0.1000">
        <ele>140</ele>
        <time>2026-01-15T08:12:00Z</time>
      </trkpt>
      <trkpt lat="51.5050" lon="-0.1000">
        <ele>150</ele>
        <time>2026-01-15T08:15:00Z</time>
      </trkpt>
      <trkpt lat="51.5060" lon="-0.1000">
        <ele>160</ele>
        <time>2026-01-15T08:18:00Z</time>
      </trkpt>
      <trkpt lat="51.5070" lon="-0.1000">
        <ele>165</ele>
        <time>2026-01-15T08:21:00Z</time>
      </trkpt>
      <trkpt lat="51.5080" lon="-0.1000">
        <ele>170</ele>
        <time>2026-01-15T08:24:00Z</time>
      </trkpt>
      <trkpt lat="51.5090" lon="-0.1000">
        <ele>175</ele>
        <time>2026-01-15T08:27:00Z</time>
      </trkpt>
      <trkpt lat="51.5100" lon="-0.1000">
        <ele>180</ele>
        <time>2026-01-15T08:30:00Z</time>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"""

# Minimal GPX for edge cases
MINIMAL_GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="51.5" lon="-0.1"><ele>100</ele></trkpt>
      <trkpt lat="51.51" lon="-0.1"><ele>110</ele></trkpt>
    </trkseg>
  </trk>
</gpx>"""


class TestGradientCategory:
    """Tests for gradient categorization"""

    def test_steep_downhill(self):
        """Gradients < -8% should be steep downhill"""
        assert GradientCategory.STEEP_DOWNHILL.value == "steep_downhill"

    def test_flat_category(self):
        """Flat terrain should be -1% to 1%"""
        assert GradientCategory.FLAT.value == "flat"

    def test_steep_uphill(self):
        """Gradients > 8% should be steep uphill"""
        assert GradientCategory.STEEP_UPHILL.value == "steep_uphill"


class TestActivityPerformanceAnalyzer:
    """Tests for ActivityPerformanceAnalyzer"""

    def test_initialization_with_valid_gpx(self):
        """Analyzer should initialize with valid GPX"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")
        assert analyzer.activity_id == "test-001"
        assert len(analyzer._points) > 0

    def test_points_have_elevation_smoothing(self):
        """Points should have smoothed elevation data"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")

        # Check that smoothed elevation exists
        for point in analyzer._points:
            assert "elevation_smoothed" in point
            assert isinstance(point["elevation_smoothed"], (int, float))

    def test_haversine_distance_calculation(self):
        """Haversine distance should be calculated correctly"""
        # Distance between two points ~1.11km apart (0.01 degrees latitude)
        dist = ActivityPerformanceAnalyzer._haversine_distance(51.5, -0.1, 51.51, -0.1)

        # Should be approximately 1.1km
        assert 1000 < dist < 1200

    def test_minetti_cost_flat(self):
        """Minetti cost on flat ground should be ~3.6"""
        cost = ActivityPerformanceAnalyzer._calculate_minetti_cost(0)
        assert 3.5 < cost < 3.7

    def test_minetti_cost_uphill(self):
        """Uphill cost should be higher than flat"""
        flat_cost = ActivityPerformanceAnalyzer._calculate_minetti_cost(0)
        uphill_cost = ActivityPerformanceAnalyzer._calculate_minetti_cost(
            0.1
        )  # 10% grade

        assert uphill_cost > flat_cost

    def test_minetti_cost_downhill(self):
        """Gentle downhill should have lower cost than flat"""
        flat_cost = ActivityPerformanceAnalyzer._calculate_minetti_cost(0)
        downhill_cost = ActivityPerformanceAnalyzer._calculate_minetti_cost(
            -0.05
        )  # -5% grade

        # Gentle downhill is more efficient
        assert downhill_cost < flat_cost

    def test_analyze_returns_result(self):
        """Analysis should return ActivityAnalysisResult"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")
        result = analyzer.analyze()

        assert isinstance(result, ActivityAnalysisResult)
        assert result.activity_id == "test-001"
        assert result.total_distance_km > 0

    def test_analyze_extracts_activity_name(self):
        """Analysis should extract activity name from GPX"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")
        result = analyzer.analyze()

        assert result.name == "Morning Trail Run"

    def test_analyze_calculates_elevation_stats(self):
        """Analysis should calculate elevation gain/loss"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")
        result = analyzer.analyze()

        # Sample GPX goes from 100m to 180m = 80m gain
        assert result.elevation_gain_m > 0

    def test_analyze_pace_by_gradient(self):
        """Analysis should include pace breakdown by gradient"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")
        result = analyzer.analyze()

        assert isinstance(result.pace_by_gradient, dict)
        # Check all gradient categories are present
        for category in GradientCategory:
            assert category.value in result.pace_by_gradient

    def test_analyze_calculates_gap(self):
        """Analysis should calculate Grade Adjusted Pace"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")
        result = analyzer.analyze()

        assert result.grade_adjusted_pace_min_km > 0

    def test_to_dict_returns_serializable(self):
        """to_dict should return JSON-serializable dict"""
        analyzer = ActivityPerformanceAnalyzer(SAMPLE_GPX_WITH_TIME, "test-001")
        result = analyzer.to_dict()

        assert isinstance(result, dict)
        assert "activity_id" in result
        assert "total_distance_km" in result
        assert "grade_adjusted_pace_min_km" in result

    def test_minimal_gpx_raises_error(self):
        """GPX with too few points should raise error"""
        with pytest.raises(ValueError, match="Not enough points"):
            analyzer = ActivityPerformanceAnalyzer(MINIMAL_GPX, "test-001")
            analyzer.analyze()


class TestAggregatePerformanceProfiles:
    """Tests for performance profile aggregation"""

    def _create_mock_result(
        self,
        activity_id: str,
        activity_date: str,
        flat_pace: float = 5.5,
        fatigue_factor: float = 2.0,
        distance_km: float = 10.0,
    ) -> ActivityAnalysisResult:
        """Create a mock ActivityAnalysisResult for testing"""
        return ActivityAnalysisResult(
            activity_id=activity_id,
            name=f"Test Activity {activity_id}",
            activity_date=activity_date,
            total_distance_km=distance_km,
            elevation_gain_m=300,
            elevation_loss_m=280,
            total_time_seconds=3600,
            moving_time_seconds=3500,
            stopped_time_seconds=100,
            average_pace_min_km=flat_pace + 0.2,
            grade_adjusted_pace_min_km=flat_pace,
            pace_by_gradient={
                "steep_downhill": flat_pace - 1.0,
                "downhill": flat_pace - 0.5,
                "gentle_downhill": flat_pace - 0.3,
                "flat": flat_pace,
                "gentle_uphill": flat_pace + 0.5,
                "uphill": flat_pace + 1.5,
                "steep_uphill": flat_pace + 3.0,
            },
            fatigue_curve=[
                {"distance_km": 0, "gap_min_km": flat_pace},
                {"distance_km": 5, "gap_min_km": flat_pace + 0.1},
                {"distance_km": 10, "gap_min_km": flat_pace + 0.2},
            ],
            fatigue_factor=fatigue_factor,
            segment_count=10,
        )

    def test_aggregate_single_activity(self):
        """Aggregating single activity should return similar values"""
        activity = self._create_mock_result("1", "2026-01-15T08:00:00Z", flat_pace=5.5)

        profile = aggregate_performance_profiles([activity])

        assert isinstance(profile, PerformanceProfile)
        assert profile.flat_pace_min_km == 5.5
        assert profile.activities_analyzed == 1

    def test_aggregate_multiple_activities_uniform_weight(self):
        """Multiple activities with uniform weight should average"""
        activities = [
            self._create_mock_result("1", "2026-01-15T08:00:00Z", flat_pace=5.0),
            self._create_mock_result("2", "2026-01-15T08:00:00Z", flat_pace=6.0),
        ]

        profile = aggregate_performance_profiles(activities)

        # Average of 5.0 and 6.0
        assert profile.flat_pace_min_km == 5.5
        assert profile.activities_analyzed == 2

    def test_aggregate_with_custom_weights(self):
        """Custom weights should affect averages"""
        activities = [
            self._create_mock_result("1", "2026-01-15T08:00:00Z", flat_pace=5.0),
            self._create_mock_result("2", "2026-01-15T08:00:00Z", flat_pace=6.0),
        ]

        # Weight first activity 3x more than second
        profile = aggregate_performance_profiles(activities, recency_weights=[3.0, 1.0])

        # Weighted average: (5.0*3 + 6.0*1) / 4 = 5.25
        assert profile.flat_pace_min_km == 5.25

    def test_aggregate_calculates_total_distance(self):
        """Profile should sum total distance across activities"""
        activities = [
            self._create_mock_result("1", "2026-01-15T08:00:00Z", distance_km=10.0),
            self._create_mock_result("2", "2026-01-15T08:00:00Z", distance_km=15.0),
        ]

        profile = aggregate_performance_profiles(activities)

        assert profile.total_distance_km == 25.0

    def test_aggregate_empty_raises_error(self):
        """Empty list should raise ValueError"""
        with pytest.raises(ValueError, match="No analyses provided"):
            aggregate_performance_profiles([])

    def test_profile_includes_gradient_sample_sizes(self):
        """Profile should track sample sizes per gradient"""
        activity = self._create_mock_result("1", "2026-01-15T08:00:00Z")

        profile = aggregate_performance_profiles([activity])

        assert "flat" in profile.gradient_sample_sizes
        assert profile.gradient_sample_sizes["flat"] >= 1


class TestKalmanElevationSmoothing:
    """Tests for Kalman filter elevation smoothing"""

    def test_smoothing_reduces_noise(self):
        """Kalman smoothing should reduce elevation noise"""
        # Create noisy elevation data
        noisy = [100, 150, 95, 140, 105, 145, 100, 150]

        smoothed = ActivityPerformanceAnalyzer._kalman_smooth_elevation(noisy)

        # Smoothed values should have less variance
        noisy_variance = sum((x - sum(noisy) / len(noisy)) ** 2 for x in noisy) / len(
            noisy
        )
        smoothed_variance = sum(
            (x - sum(smoothed) / len(smoothed)) ** 2 for x in smoothed
        ) / len(smoothed)

        assert smoothed_variance < noisy_variance

    def test_smoothing_preserves_trend(self):
        """Smoothing should preserve overall elevation trend"""
        # Steadily increasing elevation
        increasing = [100, 110, 120, 130, 140, 150]

        smoothed = ActivityPerformanceAnalyzer._kalman_smooth_elevation(increasing)

        # Should still be generally increasing
        assert smoothed[-1] > smoothed[0]

    def test_smoothing_handles_short_list(self):
        """Short lists should be returned as-is"""
        short = [100]

        smoothed = ActivityPerformanceAnalyzer._kalman_smooth_elevation(short)

        assert smoothed == short
