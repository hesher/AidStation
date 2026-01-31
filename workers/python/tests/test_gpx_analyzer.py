"""
GPX Analyzer Tests

Unit tests for the GPX course analysis module.
"""

import pytest
from src.analysis.gpx_analyzer import GPXCourseAnalyzer


# Sample GPX data for testing
SAMPLE_GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Test Course</name>
    <trkseg>
      <trkpt lat="38.8977" lon="-77.0365">
        <ele>10</ele>
      </trkpt>
      <trkpt lat="38.8987" lon="-77.0365">
        <ele>20</ele>
      </trkpt>
      <trkpt lat="38.8997" lon="-77.0365">
        <ele>30</ele>
      </trkpt>
      <trkpt lat="38.9007" lon="-77.0365">
        <ele>25</ele>
      </trkpt>
      <trkpt lat="38.9017" lon="-77.0365">
        <ele>15</ele>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
"""

# Longer GPX with more points for smoothing tests
LONGER_GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk>
    <name>Longer Course</name>
    <trkseg>
      <trkpt lat="38.8977" lon="-77.0365"><ele>100</ele></trkpt>
      <trkpt lat="38.8987" lon="-77.0365"><ele>110</ele></trkpt>
      <trkpt lat="38.8997" lon="-77.0365"><ele>120</ele></trkpt>
      <trkpt lat="38.9007" lon="-77.0365"><ele>130</ele></trkpt>
      <trkpt lat="38.9017" lon="-77.0365"><ele>140</ele></trkpt>
      <trkpt lat="38.9027" lon="-77.0365"><ele>150</ele></trkpt>
      <trkpt lat="38.9037" lon="-77.0365"><ele>145</ele></trkpt>
      <trkpt lat="38.9047" lon="-77.0365"><ele>135</ele></trkpt>
      <trkpt lat="38.9057" lon="-77.0365"><ele>125</ele></trkpt>
      <trkpt lat="38.9067" lon="-77.0365"><ele>120</ele></trkpt>
    </trkseg>
  </trk>
</gpx>
"""


class TestGPXCourseAnalyzer:
    """Tests for GPXCourseAnalyzer class"""

    def test_init_parses_gpx(self):
        """Should successfully parse valid GPX content"""
        analyzer = GPXCourseAnalyzer(SAMPLE_GPX)
        assert analyzer is not None
        assert analyzer.gpx is not None

    def test_total_distance_calculation(self):
        """Should calculate total distance correctly"""
        analyzer = GPXCourseAnalyzer(SAMPLE_GPX)
        distance = analyzer.get_total_distance_km()
        # Each point is ~0.111 km apart (1/1000 degree latitude)
        assert distance > 0
        assert distance < 10  # Sanity check

    def test_elevation_stats(self):
        """Should calculate elevation gain and loss"""
        analyzer = GPXCourseAnalyzer(SAMPLE_GPX)
        stats = analyzer.get_elevation_stats()

        assert 'elevation_gain_m' in stats
        assert 'elevation_loss_m' in stats
        # Raw data: 10->20->30->25->15
        # Gain: ~20m (with smoothing may vary)
        # Loss: ~15m (with smoothing may vary)
        assert stats['elevation_gain_m'] > 0
        assert stats['elevation_loss_m'] > 0

    def test_kalman_smoothing_applied(self):
        """Should apply Kalman smoothing to elevations"""
        analyzer = GPXCourseAnalyzer(LONGER_GPX)
        # Internal smoothed elevations should exist
        assert len(analyzer._smoothed_elevations) > 0
        assert len(analyzer._raw_elevations) == len(analyzer._smoothed_elevations)

    def test_find_closest_point(self):
        """Should find point closest to given coordinates"""
        analyzer = GPXCourseAnalyzer(SAMPLE_GPX)
        idx, point = analyzer.find_closest_point(38.8987, -77.0365)

        assert idx == 1
        assert point.lat == pytest.approx(38.8987, rel=0.01)

    def test_get_course_coordinates(self):
        """Should return all course coordinates"""
        analyzer = GPXCourseAnalyzer(SAMPLE_GPX)
        coords = analyzer.get_course_coordinates()

        assert len(coords) == 5
        assert 'lat' in coords[0]
        assert 'lon' in coords[0]
        assert 'elevation' in coords[0]
        assert 'distanceKm' in coords[0]

    def test_get_elevation_profile(self):
        """Should return sampled elevation profile"""
        analyzer = GPXCourseAnalyzer(LONGER_GPX)
        profile = analyzer.get_elevation_profile(num_points=5)

        assert len(profile) == 6  # num_points + 1
        assert 'distanceKm' in profile[0]
        assert 'elevation' in profile[0]

    def test_to_dict(self):
        """Should export analysis as dictionary"""
        analyzer = GPXCourseAnalyzer(SAMPLE_GPX)
        result = analyzer.to_dict()

        assert 'total_distance_km' in result
        assert 'total_elevation_gain_m' in result
        assert 'total_elevation_loss_m' in result
        assert 'points_count' in result
        assert 'min_elevation_m' in result
        assert 'max_elevation_m' in result

    def test_analyze_aid_stations(self):
        """Should analyze aid stations with distance markers"""
        analyzer = GPXCourseAnalyzer(LONGER_GPX)

        total_dist = analyzer.get_total_distance_km()

        aid_stations = [
            {'name': 'Start', 'distanceKm': 0},
            {'name': 'Mid', 'distanceKm': total_dist / 2},
            {'name': 'Finish', 'distanceKm': total_dist},
        ]

        result = analyzer.analyze_aid_stations(aid_stations)

        assert len(result) == 3
        assert result[0].name == 'Start'
        assert result[1].name == 'Mid'
        assert result[2].name == 'Finish'

        # First station should have distance_from_prev equal to its distance
        assert result[0].distance_from_prev_km == pytest.approx(0, abs=0.1)

        # Later stations should have distance_from_prev > 0
        assert result[1].distance_from_prev_km > 0
        assert result[2].distance_from_prev_km > 0

    def test_analyze_aid_stations_with_coordinates(self):
        """Should analyze aid stations using lat/lon"""
        analyzer = GPXCourseAnalyzer(SAMPLE_GPX)

        aid_stations = [
            {'name': 'Point A', 'lat': 38.8987, 'lon': -77.0365},
            {'name': 'Point B', 'lat': 38.9007, 'lon': -77.0365},
        ]

        result = analyzer.analyze_aid_stations(aid_stations)

        assert len(result) == 2
        assert result[1].distance_from_prev_km > 0

    def test_gap_calculation(self):
        """Should calculate Grade Adjusted Pace"""
        analyzer = GPXCourseAnalyzer(LONGER_GPX)

        result = analyzer.calculate_gap_for_segment(
            start_distance_km=0,
            end_distance_km=0.5,
            time_seconds=300  # 5 minutes
        )

        assert 'error' not in result
        assert 'actual_pace_min_km' in result
        assert 'grade_adjusted_pace_min_km' in result
        assert 'gradient_percent' in result


class TestHaversineDistance:
    """Tests for haversine distance calculation"""

    def test_same_point_returns_zero(self):
        """Same coordinates should return 0 distance"""
        dist = GPXCourseAnalyzer._haversine_distance(
            38.8977, -77.0365, 38.8977, -77.0365
        )
        assert dist == pytest.approx(0, abs=0.1)

    def test_known_distance(self):
        """Should calculate correct distance for known points"""
        # ~111km per degree of latitude
        dist = GPXCourseAnalyzer._haversine_distance(
            0, 0, 1, 0  # 1 degree latitude difference
        )
        # Should be approximately 111,000 meters
        assert 110000 < dist < 112000


class TestKalmanSmoothing:
    """Tests for Kalman elevation smoothing"""

    def test_smoothing_reduces_noise(self):
        """Smoothing should reduce noise in elevation data"""
        noisy = [100, 102, 98, 103, 97, 101, 99, 100, 102, 98]
        smoothed = GPXCourseAnalyzer._kalman_smooth_elevation(noisy)

        # Calculate variance
        import numpy as np
        original_var = np.var(noisy)
        smoothed_var = np.var(smoothed)

        # Smoothed should have lower variance
        assert smoothed_var < original_var

    def test_preserves_trend(self):
        """Smoothing should preserve overall trend"""
        ascending = [100, 110, 120, 130, 140, 150]
        smoothed = GPXCourseAnalyzer._kalman_smooth_elevation(ascending)

        # Trend should be preserved (end higher than start)
        assert smoothed[-1] > smoothed[0]

    def test_handles_short_list(self):
        """Should handle lists shorter than 2 elements"""
        short = [100]
        result = GPXCourseAnalyzer._kalman_smooth_elevation(short)
        assert result == short
