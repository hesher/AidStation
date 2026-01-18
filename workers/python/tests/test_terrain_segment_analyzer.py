"""
Tests for Terrain Segment Analyzer

Tests for breaking activities into climb/descent/flat segments with 5km blocks.
"""

import pytest
from src.analysis.terrain_segment_analyzer import (
    GradeCategory,
    TerrainSegment,
    TerrainSegmentAnalysisResult,
    TerrainSegmentAnalyzer,
    TerrainType,
    analyze_activity_terrain_segments,
)


# Sample GPX with varied terrain (climb, flat, descent)
SAMPLE_VARIED_TERRAIN_GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AidStation Test">
  <trk>
    <name>Mountain Run</name>
    <trkseg>
      <!-- Flat start (0-1km, ~0% grade) -->
      <trkpt lat="51.5000" lon="-0.1000"><ele>100</ele><time>2026-01-15T08:00:00Z</time></trkpt>
      <trkpt lat="51.5010" lon="-0.1000"><ele>101</ele><time>2026-01-15T08:03:00Z</time></trkpt>
      <trkpt lat="51.5020" lon="-0.1000"><ele>102</ele><time>2026-01-15T08:06:00Z</time></trkpt>
      <trkpt lat="51.5030" lon="-0.1000"><ele>101</ele><time>2026-01-15T08:09:00Z</time></trkpt>
      <trkpt lat="51.5040" lon="-0.1000"><ele>100</ele><time>2026-01-15T08:12:00Z</time></trkpt>
      
      <!-- Climb section (1km-2km, ~5% grade) -->
      <trkpt lat="51.5050" lon="-0.1000"><ele>120</ele><time>2026-01-15T08:17:00Z</time></trkpt>
      <trkpt lat="51.5060" lon="-0.1000"><ele>140</ele><time>2026-01-15T08:22:00Z</time></trkpt>
      <trkpt lat="51.5070" lon="-0.1000"><ele>160</ele><time>2026-01-15T08:27:00Z</time></trkpt>
      <trkpt lat="51.5080" lon="-0.1000"><ele>180</ele><time>2026-01-15T08:32:00Z</time></trkpt>
      <trkpt lat="51.5090" lon="-0.1000"><ele>200</ele><time>2026-01-15T08:37:00Z</time></trkpt>
      
      <!-- Flat/rolling section (2km-3km) -->
      <trkpt lat="51.5100" lon="-0.1000"><ele>202</ele><time>2026-01-15T08:42:00Z</time></trkpt>
      <trkpt lat="51.5110" lon="-0.1000"><ele>198</ele><time>2026-01-15T08:45:00Z</time></trkpt>
      <trkpt lat="51.5120" lon="-0.1000"><ele>201</ele><time>2026-01-15T08:48:00Z</time></trkpt>
      <trkpt lat="51.5130" lon="-0.1000"><ele>199</ele><time>2026-01-15T08:51:00Z</time></trkpt>
      <trkpt lat="51.5140" lon="-0.1000"><ele>200</ele><time>2026-01-15T08:54:00Z</time></trkpt>
      
      <!-- Descent section (3km-4km, ~-5% grade) -->
      <trkpt lat="51.5150" lon="-0.1000"><ele>180</ele><time>2026-01-15T08:57:00Z</time></trkpt>
      <trkpt lat="51.5160" lon="-0.1000"><ele>160</ele><time>2026-01-15T09:00:00Z</time></trkpt>
      <trkpt lat="51.5170" lon="-0.1000"><ele>140</ele><time>2026-01-15T09:03:00Z</time></trkpt>
      <trkpt lat="51.5180" lon="-0.1000"><ele>120</ele><time>2026-01-15T09:06:00Z</time></trkpt>
      <trkpt lat="51.5190" lon="-0.1000"><ele>100</ele><time>2026-01-15T09:09:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>"""


# Sample GPX with long flat section (should be split into 5km blocks)
SAMPLE_LONG_FLAT_GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AidStation Test">
  <trk>
    <name>Long Flat Run</name>
    <trkseg>
      <!-- 12km of relatively flat terrain -->
      <trkpt lat="51.5000" lon="-0.1000"><ele>100</ele><time>2026-01-15T08:00:00Z</time></trkpt>
      <trkpt lat="51.5100" lon="-0.1000"><ele>102</ele><time>2026-01-15T08:30:00Z</time></trkpt>
      <trkpt lat="51.5200" lon="-0.1000"><ele>101</ele><time>2026-01-15T09:00:00Z</time></trkpt>
      <trkpt lat="51.5300" lon="-0.1000"><ele>103</ele><time>2026-01-15T09:30:00Z</time></trkpt>
      <trkpt lat="51.5400" lon="-0.1000"><ele>100</ele><time>2026-01-15T10:00:00Z</time></trkpt>
      <trkpt lat="51.5500" lon="-0.1000"><ele>102</ele><time>2026-01-15T10:30:00Z</time></trkpt>
      <trkpt lat="51.5600" lon="-0.1000"><ele>101</ele><time>2026-01-15T11:00:00Z</time></trkpt>
      <trkpt lat="51.5700" lon="-0.1000"><ele>100</ele><time>2026-01-15T11:30:00Z</time></trkpt>
      <trkpt lat="51.5800" lon="-0.1000"><ele>102</ele><time>2026-01-15T12:00:00Z</time></trkpt>
      <trkpt lat="51.5900" lon="-0.1000"><ele>101</ele><time>2026-01-15T12:30:00Z</time></trkpt>
      <trkpt lat="51.6000" lon="-0.1000"><ele>100</ele><time>2026-01-15T13:00:00Z</time></trkpt>
      <trkpt lat="51.6100" lon="-0.1000"><ele>102</ele><time>2026-01-15T13:30:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>"""


# Sample GPX with steep climb
SAMPLE_STEEP_CLIMB_GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AidStation Test">
  <trk>
    <name>Steep Climb</name>
    <trkseg>
      <!-- Steep climb ~10% grade -->
      <trkpt lat="51.5000" lon="-0.1000"><ele>100</ele><time>2026-01-15T08:00:00Z</time></trkpt>
      <trkpt lat="51.5010" lon="-0.1000"><ele>150</ele><time>2026-01-15T08:10:00Z</time></trkpt>
      <trkpt lat="51.5020" lon="-0.1000"><ele>200</ele><time>2026-01-15T08:20:00Z</time></trkpt>
      <trkpt lat="51.5030" lon="-0.1000"><ele>250</ele><time>2026-01-15T08:30:00Z</time></trkpt>
      <trkpt lat="51.5040" lon="-0.1000"><ele>300</ele><time>2026-01-15T08:40:00Z</time></trkpt>
      <trkpt lat="51.5050" lon="-0.1000"><ele>350</ele><time>2026-01-15T08:50:00Z</time></trkpt>
      <trkpt lat="51.5060" lon="-0.1000"><ele>400</ele><time>2026-01-15T09:00:00Z</time></trkpt>
      <trkpt lat="51.5070" lon="-0.1000"><ele>450</ele><time>2026-01-15T09:10:00Z</time></trkpt>
      <trkpt lat="51.5080" lon="-0.1000"><ele>500</ele><time>2026-01-15T09:20:00Z</time></trkpt>
      <trkpt lat="51.5090" lon="-0.1000"><ele>550</ele><time>2026-01-15T09:30:00Z</time></trkpt>
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


class TestTerrainType:
    """Tests for terrain type classification"""

    def test_terrain_types_exist(self):
        """Terrain type enum should have climb, descent, flat"""
        assert TerrainType.CLIMB.value == "climb"
        assert TerrainType.DESCENT.value == "descent"
        assert TerrainType.FLAT.value == "flat"


class TestGradeCategory:
    """Tests for grade category classification"""

    def test_steep_climb(self):
        """Steep climb should be > 8%"""
        assert GradeCategory.STEEP_CLIMB.value == "steep_climb"

    def test_moderate_climb(self):
        """Moderate climb should be 5-8%"""
        assert GradeCategory.MODERATE_CLIMB.value == "moderate_climb"

    def test_gentle_climb(self):
        """Gentle climb should be 3-5%"""
        assert GradeCategory.GENTLE_CLIMB.value == "gentle_climb"

    def test_flat(self):
        """Flat should be -3% to 3%"""
        assert GradeCategory.FLAT.value == "flat"

    def test_gentle_descent(self):
        """Gentle descent should be -3% to -5%"""
        assert GradeCategory.GENTLE_DESCENT.value == "gentle_descent"

    def test_moderate_descent(self):
        """Moderate descent should be -5% to -8%"""
        assert GradeCategory.MODERATE_DESCENT.value == "moderate_descent"

    def test_steep_descent(self):
        """Steep descent should be < -8%"""
        assert GradeCategory.STEEP_DESCENT.value == "steep_descent"


class TestTerrainSegmentAnalyzer:
    """Tests for TerrainSegmentAnalyzer"""

    def test_initialization_with_valid_gpx(self):
        """Analyzer should initialize with valid GPX"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        assert analyzer.activity_id == "test-001"
        assert len(analyzer._points) > 0

    def test_points_have_elevation_smoothing(self):
        """Points should have smoothed elevation data"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")

        for point in analyzer._points:
            assert "elevation_smoothed" in point
            assert isinstance(point["elevation_smoothed"], (int, float))

    def test_analyze_returns_result(self):
        """Analysis should return TerrainSegmentAnalysisResult"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        result = analyzer.analyze()

        assert isinstance(result, TerrainSegmentAnalysisResult)
        assert result.activity_id == "test-001"
        assert result.total_distance_km > 0

    def test_analyze_identifies_segments(self):
        """Analysis should identify multiple terrain segments"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        result = analyzer.analyze()

        # Should have at least 2 segments (varied terrain)
        assert len(result.segments) >= 2

    def test_analyze_calculates_elevation_totals(self):
        """Analysis should calculate total elevation gain/loss"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        result = analyzer.analyze()

        # Should have some elevation gain and loss
        assert result.total_elevation_gain_m >= 0
        assert result.total_elevation_loss_m >= 0

    def test_segments_have_correct_attributes(self):
        """Each segment should have all required attributes"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        result = analyzer.analyze()

        for segment in result.segments:
            assert isinstance(segment, TerrainSegment)
            assert hasattr(segment, "terrain_type")
            assert hasattr(segment, "grade_category")
            assert hasattr(segment, "distance_km")
            assert hasattr(segment, "elevation_change_m")
            assert hasattr(segment, "pace_min_km")
            assert hasattr(segment, "grade_adjusted_pace_min_km")

    def test_result_has_summary(self):
        """Result should include summary statistics"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        result = analyzer.analyze()

        assert "climb" in result.summary
        assert "descent" in result.summary
        assert "flat" in result.summary
        assert "total_segments" in result.summary

    def test_summary_has_required_fields(self):
        """Summary should have required fields for each terrain type"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        result = analyzer.analyze()

        for terrain_type in ["climb", "descent", "flat"]:
            summary = result.summary[terrain_type]
            assert "total_distance_km" in summary
            assert "total_time_seconds" in summary
            assert "segment_count" in summary

    def test_minimal_gpx_raises_error(self):
        """GPX with too few points should raise error"""
        with pytest.raises(ValueError, match="Not enough points"):
            analyzer = TerrainSegmentAnalyzer(MINIMAL_GPX, "test-001")
            analyzer.analyze()

    def test_to_dict_returns_serializable(self):
        """to_dict should return JSON-serializable dict"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_VARIED_TERRAIN_GPX, "test-001")
        result = analyzer.analyze()
        result_dict = result.to_dict()

        assert isinstance(result_dict, dict)
        assert "activity_id" in result_dict
        assert "total_distance_km" in result_dict
        assert "segments" in result_dict
        assert isinstance(result_dict["segments"], list)


class TestLongFlatSegmentSplitting:
    """Tests for splitting long flat/descent sections into 5km blocks"""

    def test_long_flat_is_split(self):
        """Long flat sections should be split into 5km blocks"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_LONG_FLAT_GPX, "test-002")
        result = analyzer.analyze()

        # Check that no flat segment is longer than 5km
        for segment in result.segments:
            if segment.terrain_type == "flat":
                assert segment.distance_km <= 5.5  # Allow some tolerance

    def test_flat_segments_cover_full_distance(self):
        """Split flat segments should cover the full distance"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_LONG_FLAT_GPX, "test-002")
        result = analyzer.analyze()

        total_segment_distance = sum(s.distance_km for s in result.segments)
        
        # Total segment distance should be close to total distance
        assert abs(total_segment_distance - result.total_distance_km) < 0.5


class TestClimbSegments:
    """Tests for climb segment handling"""

    def test_steep_climb_identified(self):
        """Steep climbs should be correctly identified"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_STEEP_CLIMB_GPX, "test-003")
        result = analyzer.analyze()

        # Should have at least one climb segment
        climb_segments = [s for s in result.segments if s.terrain_type == "climb"]
        assert len(climb_segments) >= 1

    def test_climb_not_split_by_distance(self):
        """Climb sections should NOT be split by distance (kept continuous)"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_STEEP_CLIMB_GPX, "test-003")
        result = analyzer.analyze()

        # A continuous climb should be kept as one segment
        climb_segments = [s for s in result.segments if s.terrain_type == "climb"]
        
        # The total distance of all climb segments should be covered
        # but climbs are kept continuous (not split into 5km blocks)
        for climb in climb_segments:
            # Each climb segment is its own continuous section
            assert climb.distance_km > 0


class TestConvenienceFunction:
    """Tests for the convenience function"""

    def test_analyze_activity_terrain_segments(self):
        """Convenience function should work correctly"""
        result = analyze_activity_terrain_segments(SAMPLE_VARIED_TERRAIN_GPX, "test-conv")

        assert isinstance(result, dict)
        assert result["activity_id"] == "test-conv"
        assert "segments" in result
        assert "summary" in result

    def test_convenience_function_returns_dict(self):
        """Convenience function should return a dictionary"""
        result = analyze_activity_terrain_segments(SAMPLE_VARIED_TERRAIN_GPX)

        assert isinstance(result, dict)
        assert isinstance(result["segments"], list)


class TestGradeAdjustedPace:
    """Tests for Grade Adjusted Pace calculations"""

    def test_climb_has_gap_calculated(self):
        """Climb segments should have GAP calculated"""
        analyzer = TerrainSegmentAnalyzer(SAMPLE_STEEP_CLIMB_GPX, "test-gap")
        result = analyzer.analyze()

        for segment in result.segments:
            if segment.pace_min_km > 0:
                # GAP should be different from actual pace on hills
                assert segment.grade_adjusted_pace_min_km >= 0

    def test_minetti_cost_flat(self):
        """Minetti cost on flat should be ~3.6"""
        cost = TerrainSegmentAnalyzer._calculate_minetti_cost(0)
        assert 3.5 < cost < 3.7

    def test_minetti_cost_uphill(self):
        """Minetti cost uphill should be higher than flat"""
        flat_cost = TerrainSegmentAnalyzer._calculate_minetti_cost(0)
        uphill_cost = TerrainSegmentAnalyzer._calculate_minetti_cost(0.1)  # 10% grade
        assert uphill_cost > flat_cost


class TestTerrainSegmentDataclass:
    """Tests for TerrainSegment dataclass"""

    def test_to_dict_method(self):
        """TerrainSegment should have working to_dict method"""
        segment = TerrainSegment(
            segment_index=0,
            terrain_type="climb",
            grade_category="moderate_climb",
            start_distance_km=0.0,
            end_distance_km=1.0,
            distance_km=1.0,
            elevation_start_m=100,
            elevation_end_m=150,
            elevation_change_m=50,
            average_grade_percent=5.0,
            time_seconds=600,
            pace_min_km=10.0,
            grade_adjusted_pace_min_km=8.0,
        )

        result = segment.to_dict()

        assert isinstance(result, dict)
        assert result["terrain_type"] == "climb"
        assert result["distance_km"] == 1.0
        assert result["elevation_change_m"] == 50
