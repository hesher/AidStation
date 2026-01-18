"""
Terrain Segment Analyzer

Breaks down activities into meaningful terrain segments for performance analysis:
- Climb sections (continuous uphill segments)
- Descent sections (continuous downhill segments)  
- Flat sections broken into 5km blocks

Each segment provides context on terrain type and performance characteristics.
"""

from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

import gpxpy


class TerrainType(Enum):
    """Terrain types for segment classification"""

    CLIMB = "climb"
    DESCENT = "descent"
    FLAT = "flat"


class GradeCategory(Enum):
    """Grade categories within terrain types"""

    STEEP_CLIMB = "steep_climb"  # > 8%
    MODERATE_CLIMB = "moderate_climb"  # 5-8%
    GENTLE_CLIMB = "gentle_climb"  # 3-5%
    FLAT = "flat"  # -3% to 3%
    GENTLE_DESCENT = "gentle_descent"  # -3% to -5%
    MODERATE_DESCENT = "moderate_descent"  # -5% to -8%
    STEEP_DESCENT = "steep_descent"  # < -8%


@dataclass
class TerrainSegment:
    """A segment of terrain with performance data"""

    segment_index: int
    terrain_type: str  # climb, descent, flat
    grade_category: str  # steep_climb, moderate_climb, etc.
    start_distance_km: float
    end_distance_km: float
    distance_km: float
    elevation_start_m: float
    elevation_end_m: float
    elevation_change_m: float
    average_grade_percent: float
    time_seconds: float
    pace_min_km: float
    grade_adjusted_pace_min_km: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TerrainSegmentAnalysisResult:
    """Complete terrain segment analysis for an activity"""

    activity_id: str
    total_distance_km: float
    total_elevation_gain_m: float
    total_elevation_loss_m: float
    total_time_seconds: float
    segments: List[TerrainSegment]
    summary: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "activity_id": self.activity_id,
            "total_distance_km": self.total_distance_km,
            "total_elevation_gain_m": self.total_elevation_gain_m,
            "total_elevation_loss_m": self.total_elevation_loss_m,
            "total_time_seconds": self.total_time_seconds,
            "segments": [s.to_dict() for s in self.segments],
            "summary": self.summary,
        }
        return result


class TerrainSegmentAnalyzer:
    """
    Analyzes activity data and breaks it into meaningful terrain segments.

    Segments are created based on terrain transitions:
    - Climb: When average grade >= 3% for a sustained section
    - Descent: When average grade <= -3% for a sustained section
    - Flat: When grade is between -3% and 3%

    Long flat/descent sections are further broken into 5km blocks for analysis.
    """

    # Thresholds for terrain classification
    CLIMB_THRESHOLD = 3.0  # >= 3% is considered a climb
    DESCENT_THRESHOLD = -3.0  # <= -3% is considered a descent

    # Maximum segment length for flat/descent sections (in km)
    MAX_SEGMENT_LENGTH_KM = 5.0

    # Minimum segment length to avoid tiny fragments (in km)
    MIN_SEGMENT_LENGTH_KM = 0.3

    # Point sampling for analysis (1 point per N meters)
    SAMPLE_INTERVAL_M = 50

    def __init__(self, gpx_content: str, activity_id: str = "unknown"):
        """
        Initialize analyzer with GPX content.

        Args:
            gpx_content: Raw GPX file content
            activity_id: Optional ID for tracking
        """
        self.gpx = gpxpy.parse(gpx_content)
        self.activity_id = activity_id
        self._points: List[Dict[str, Any]] = []
        self._extract_points()

    def _extract_points(self) -> None:
        """Extract and process track points from GPX"""
        cumulative_distance = 0.0
        prev_point = None

        for track in self.gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    if prev_point is not None:
                        dist = self._haversine_distance(
                            prev_point.latitude,
                            prev_point.longitude,
                            point.latitude,
                            point.longitude,
                        )
                        cumulative_distance += dist

                    self._points.append(
                        {
                            "lat": point.latitude,
                            "lon": point.longitude,
                            "elevation": point.elevation or 0.0,
                            "time": point.time,
                            "distance_m": cumulative_distance,
                        }
                    )
                    prev_point = point

        # Apply Kalman smoothing to elevation
        if len(self._points) > 5:
            elevations = [p["elevation"] for p in self._points]
            smoothed = self._kalman_smooth_elevation(elevations)
            for i, point in enumerate(self._points):
                point["elevation_smoothed"] = smoothed[i]
        else:
            for point in self._points:
                point["elevation_smoothed"] = point["elevation"]

    @staticmethod
    def _haversine_distance(
        lat1: float, lon1: float, lat2: float, lon2: float
    ) -> float:
        """Calculate great-circle distance in meters"""
        import math

        R = 6371000
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
        )
        c = 2 * math.asin(min(1.0, math.sqrt(a)))

        return R * c

    @staticmethod
    def _kalman_smooth_elevation(elevations: List[float]) -> List[float]:
        """Apply Kalman filtering for elevation smoothing"""
        n = len(elevations)
        if n < 2:
            return elevations

        R = 10.0  # Measurement noise
        Q = 0.1  # Process noise

        x = elevations[0]
        P = 1.0

        smoothed = [x]

        for i in range(1, n):
            x_pred = x
            P_pred = P + Q

            K = P_pred / (P_pred + R)
            x = x_pred + K * (elevations[i] - x_pred)
            P = (1 - K) * P_pred

            smoothed.append(x)

        return smoothed

    def _categorize_grade(self, grade_percent: float) -> GradeCategory:
        """Categorize grade into standard categories"""
        if grade_percent > 8:
            return GradeCategory.STEEP_CLIMB
        elif grade_percent > 5:
            return GradeCategory.MODERATE_CLIMB
        elif grade_percent >= 3:
            return GradeCategory.GENTLE_CLIMB
        elif grade_percent > -3:
            return GradeCategory.FLAT
        elif grade_percent > -5:
            return GradeCategory.GENTLE_DESCENT
        elif grade_percent > -8:
            return GradeCategory.MODERATE_DESCENT
        else:
            return GradeCategory.STEEP_DESCENT

    def _get_terrain_type(self, grade_percent: float) -> TerrainType:
        """Get terrain type based on grade"""
        if grade_percent >= self.CLIMB_THRESHOLD:
            return TerrainType.CLIMB
        elif grade_percent <= self.DESCENT_THRESHOLD:
            return TerrainType.DESCENT
        else:
            return TerrainType.FLAT

    @staticmethod
    def _calculate_minetti_cost(gradient: float) -> float:
        """
        Calculate metabolic cost using Minetti equation.

        C_r = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6

        Args:
            gradient: Grade as decimal (e.g., 0.05 for 5%)

        Returns:
            Metabolic cost coefficient
        """
        i = gradient
        return 155.4 * i**5 - 30.4 * i**4 - 43.3 * i**3 + 46.3 * i**2 + 19.5 * i + 3.6

    def _calculate_gap(self, pace_min_km: float, grade_percent: float) -> float:
        """Calculate Grade Adjusted Pace"""
        gradient = grade_percent / 100
        flat_cost = 3.6
        actual_cost = self._calculate_minetti_cost(gradient)
        cost_ratio = actual_cost / flat_cost if flat_cost > 0 else 1

        return pace_min_km / cost_ratio if cost_ratio > 0 else pace_min_km

    def _find_point_at_distance(self, target_distance_m: float) -> Optional[int]:
        """Find the index of the point closest to the target distance"""
        for i, point in enumerate(self._points):
            if point["distance_m"] >= target_distance_m:
                return i
        return len(self._points) - 1 if self._points else None

    def _calculate_segment_metrics(
        self, start_idx: int, end_idx: int
    ) -> Optional[Dict[str, Any]]:
        """Calculate metrics for a segment between two point indices"""
        if start_idx >= end_idx or end_idx >= len(self._points):
            return None

        start_point = self._points[start_idx]
        end_point = self._points[end_idx]

        distance_m = end_point["distance_m"] - start_point["distance_m"]
        if distance_m <= 0:
            return None

        distance_km = distance_m / 1000
        elevation_change = (
            end_point["elevation_smoothed"] - start_point["elevation_smoothed"]
        )
        grade_percent = (elevation_change / distance_m) * 100 if distance_m > 0 else 0

        # Calculate time if available
        time_seconds = 0
        if start_point["time"] and end_point["time"]:
            time_delta = end_point["time"] - start_point["time"]
            time_seconds = time_delta.total_seconds()

        # Calculate pace
        pace_min_km = 0
        if time_seconds > 0 and distance_km > 0:
            pace_min_km = (time_seconds / 60) / distance_km

        # Calculate GAP
        gap = self._calculate_gap(pace_min_km, grade_percent)

        return {
            "start_idx": start_idx,
            "end_idx": end_idx,
            "start_distance_m": start_point["distance_m"],
            "end_distance_m": end_point["distance_m"],
            "distance_km": distance_km,
            "elevation_start_m": start_point["elevation_smoothed"],
            "elevation_end_m": end_point["elevation_smoothed"],
            "elevation_change_m": elevation_change,
            "grade_percent": grade_percent,
            "time_seconds": time_seconds,
            "pace_min_km": pace_min_km,
            "gap_min_km": gap,
            "terrain_type": self._get_terrain_type(grade_percent),
            "grade_category": self._categorize_grade(grade_percent),
        }

    def _detect_terrain_changes(self) -> List[Dict[str, Any]]:
        """
        Detect terrain changes along the route using a sliding window approach.
        Returns list of raw segments with terrain type changes.
        """
        if len(self._points) < 10:
            return []

        raw_segments = []
        window_size_m = 200  # 200m window for detecting terrain type
        total_distance = self._points[-1]["distance_m"]

        current_start_idx = 0
        current_terrain = None
        current_distance = 0

        while current_distance < total_distance:
            # Calculate terrain type for current window
            window_end = min(current_distance + window_size_m, total_distance)
            start_idx = self._find_point_at_distance(current_distance)
            end_idx = self._find_point_at_distance(window_end)

            if start_idx is None or end_idx is None or start_idx >= end_idx:
                current_distance += window_size_m
                continue

            segment_metrics = self._calculate_segment_metrics(start_idx, end_idx)
            if segment_metrics is None:
                current_distance += window_size_m
                continue

            new_terrain = segment_metrics["terrain_type"]

            # Initialize or check for terrain change
            if current_terrain is None:
                current_terrain = new_terrain
                current_start_idx = start_idx
            elif new_terrain != current_terrain:
                # Terrain changed - save the current segment
                segment_end_idx = start_idx
                raw_segments.append(
                    {
                        "start_idx": current_start_idx,
                        "end_idx": segment_end_idx,
                        "terrain_type": current_terrain,
                    }
                )
                current_terrain = new_terrain
                current_start_idx = start_idx

            current_distance += window_size_m

        # Add final segment
        if current_terrain is not None and current_start_idx < len(self._points) - 1:
            raw_segments.append(
                {
                    "start_idx": current_start_idx,
                    "end_idx": len(self._points) - 1,
                    "terrain_type": current_terrain,
                }
            )

        return raw_segments

    def _merge_short_segments(
        self, segments: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Merge segments that are too short (< MIN_SEGMENT_LENGTH_KM)"""
        if not segments:
            return []

        merged = []
        i = 0

        while i < len(segments):
            current = segments[i]
            start_dist = self._points[current["start_idx"]]["distance_m"]
            end_dist = self._points[current["end_idx"]]["distance_m"]
            length_km = (end_dist - start_dist) / 1000

            if length_km < self.MIN_SEGMENT_LENGTH_KM and i + 1 < len(segments):
                # Merge with next segment
                next_seg = segments[i + 1]
                merged_seg = {
                    "start_idx": current["start_idx"],
                    "end_idx": next_seg["end_idx"],
                    "terrain_type": next_seg["terrain_type"],
                }
                segments[i + 1] = merged_seg
            elif length_km < self.MIN_SEGMENT_LENGTH_KM and merged:
                # Merge with previous segment
                prev = merged[-1]
                prev["end_idx"] = current["end_idx"]
            else:
                merged.append(current)

            i += 1

        return merged

    def _split_long_flat_descent_segments(
        self, segments: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Split long flat and descent sections into 5km blocks.
        Climb sections are kept as continuous segments regardless of length.
        """
        split_segments = []

        for segment in segments:
            terrain_type = segment["terrain_type"]
            start_distance_m = self._points[segment["start_idx"]]["distance_m"]
            end_distance_m = self._points[segment["end_idx"]]["distance_m"]
            length_km = (end_distance_m - start_distance_m) / 1000

            # Only split flat and descent segments
            if terrain_type == TerrainType.CLIMB or length_km <= self.MAX_SEGMENT_LENGTH_KM:
                split_segments.append(segment)
            else:
                # Split into 5km blocks
                current_start_idx = segment["start_idx"]
                current_start_m = start_distance_m

                while current_start_m < end_distance_m:
                    block_end_m = min(
                        current_start_m + self.MAX_SEGMENT_LENGTH_KM * 1000,
                        end_distance_m,
                    )
                    block_end_idx = self._find_point_at_distance(block_end_m)

                    if block_end_idx is None:
                        break

                    split_segments.append(
                        {
                            "start_idx": current_start_idx,
                            "end_idx": block_end_idx,
                            "terrain_type": terrain_type,
                        }
                    )

                    current_start_idx = block_end_idx
                    current_start_m = block_end_m

        return split_segments

    def analyze(self) -> TerrainSegmentAnalysisResult:
        """
        Perform terrain segment analysis.

        Returns:
            TerrainSegmentAnalysisResult with all segments and metrics
        """
        if len(self._points) < 10:
            raise ValueError(
                f"Not enough points for analysis (found {len(self._points)}, need 10)"
            )

        # Detect terrain changes
        raw_segments = self._detect_terrain_changes()

        # Merge short segments
        merged_segments = self._merge_short_segments(raw_segments)

        # Split long flat/descent segments into 5km blocks
        final_segments = self._split_long_flat_descent_segments(merged_segments)

        # Calculate full metrics for each segment
        terrain_segments: List[TerrainSegment] = []
        total_elevation_gain = 0.0
        total_elevation_loss = 0.0
        total_time = 0.0

        climb_stats = {"distance_km": 0, "time_seconds": 0, "elevation_m": 0}
        descent_stats = {"distance_km": 0, "time_seconds": 0, "elevation_m": 0}
        flat_stats = {"distance_km": 0, "time_seconds": 0}

        for idx, segment in enumerate(final_segments):
            metrics = self._calculate_segment_metrics(
                segment["start_idx"], segment["end_idx"]
            )
            if metrics is None:
                continue

            terrain_type = segment["terrain_type"]

            # Track elevation changes
            if metrics["elevation_change_m"] > 0:
                total_elevation_gain += metrics["elevation_change_m"]
            else:
                total_elevation_loss += abs(metrics["elevation_change_m"])

            total_time += metrics["time_seconds"]

            # Track stats by terrain type
            if terrain_type == TerrainType.CLIMB:
                climb_stats["distance_km"] += metrics["distance_km"]
                climb_stats["time_seconds"] += metrics["time_seconds"]
                climb_stats["elevation_m"] += metrics["elevation_change_m"]
            elif terrain_type == TerrainType.DESCENT:
                descent_stats["distance_km"] += metrics["distance_km"]
                descent_stats["time_seconds"] += metrics["time_seconds"]
                descent_stats["elevation_m"] += abs(metrics["elevation_change_m"])
            else:
                flat_stats["distance_km"] += metrics["distance_km"]
                flat_stats["time_seconds"] += metrics["time_seconds"]

            terrain_segments.append(
                TerrainSegment(
                    segment_index=idx,
                    terrain_type=terrain_type.value,
                    grade_category=metrics["grade_category"].value,
                    start_distance_km=round(metrics["start_distance_m"] / 1000, 2),
                    end_distance_km=round(metrics["end_distance_m"] / 1000, 2),
                    distance_km=round(metrics["distance_km"], 2),
                    elevation_start_m=round(metrics["elevation_start_m"], 0),
                    elevation_end_m=round(metrics["elevation_end_m"], 0),
                    elevation_change_m=round(metrics["elevation_change_m"], 0),
                    average_grade_percent=round(metrics["grade_percent"], 1),
                    time_seconds=round(metrics["time_seconds"], 0),
                    pace_min_km=round(metrics["pace_min_km"], 2),
                    grade_adjusted_pace_min_km=round(metrics["gap_min_km"], 2),
                )
            )

        total_distance_km = self._points[-1]["distance_m"] / 1000

        # Build summary
        summary = {
            "climb": {
                "total_distance_km": round(climb_stats["distance_km"], 2),
                "total_time_seconds": round(climb_stats["time_seconds"], 0),
                "total_elevation_m": round(climb_stats["elevation_m"], 0),
                "average_pace_min_km": round(
                    (climb_stats["time_seconds"] / 60) / climb_stats["distance_km"], 2
                )
                if climb_stats["distance_km"] > 0
                else 0,
                "segment_count": sum(
                    1 for s in terrain_segments if s.terrain_type == "climb"
                ),
            },
            "descent": {
                "total_distance_km": round(descent_stats["distance_km"], 2),
                "total_time_seconds": round(descent_stats["time_seconds"], 0),
                "total_elevation_m": round(descent_stats["elevation_m"], 0),
                "average_pace_min_km": round(
                    (descent_stats["time_seconds"] / 60) / descent_stats["distance_km"],
                    2,
                )
                if descent_stats["distance_km"] > 0
                else 0,
                "segment_count": sum(
                    1 for s in terrain_segments if s.terrain_type == "descent"
                ),
            },
            "flat": {
                "total_distance_km": round(flat_stats["distance_km"], 2),
                "total_time_seconds": round(flat_stats["time_seconds"], 0),
                "average_pace_min_km": round(
                    (flat_stats["time_seconds"] / 60) / flat_stats["distance_km"], 2
                )
                if flat_stats["distance_km"] > 0
                else 0,
                "segment_count": sum(
                    1 for s in terrain_segments if s.terrain_type == "flat"
                ),
            },
            "total_segments": len(terrain_segments),
        }

        return TerrainSegmentAnalysisResult(
            activity_id=self.activity_id,
            total_distance_km=round(total_distance_km, 2),
            total_elevation_gain_m=round(total_elevation_gain, 0),
            total_elevation_loss_m=round(total_elevation_loss, 0),
            total_time_seconds=round(total_time, 0),
            segments=terrain_segments,
            summary=summary,
        )


def analyze_activity_terrain_segments(
    gpx_content: str, activity_id: str = "unknown"
) -> Dict[str, Any]:
    """
    Convenience function to analyze terrain segments from GPX content.

    Args:
        gpx_content: Raw GPX file content
        activity_id: Optional ID for tracking

    Returns:
        Dictionary with terrain segment analysis results
    """
    analyzer = TerrainSegmentAnalyzer(gpx_content, activity_id)
    result = analyzer.analyze()
    return result.to_dict()
