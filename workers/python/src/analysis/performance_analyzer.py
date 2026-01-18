"""
Activity Performance Analyzer

Analyzes user GPX activity files to extract performance characteristics:
- Pace at different gradients (flat, uphill, downhill)
- Performance degradation over distance (fatigue curve)
- Grade Adjusted Pace (GAP) using Minetti equations
- Overall performance profile for race predictions
"""

import math
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import gpxpy


class GradientCategory(Enum):
    """Gradient categories for pace analysis"""

    STEEP_DOWNHILL = "steep_downhill"  # < -8%
    DOWNHILL = "downhill"  # -8% to -3%
    GENTLE_DOWNHILL = "gentle_downhill"  # -3% to -1%
    FLAT = "flat"  # -1% to 1%
    GENTLE_UPHILL = "gentle_uphill"  # 1% to 3%
    UPHILL = "uphill"  # 3% to 8%
    STEEP_UPHILL = "steep_uphill"  # > 8%


@dataclass
class SegmentMetrics:
    """Metrics for a segment of the activity"""

    start_distance_km: float
    end_distance_km: float
    distance_km: float
    elevation_change_m: float
    gradient_percent: float
    time_seconds: float
    actual_pace_min_km: float
    grade_adjusted_pace_min_km: float
    gradient_category: str


@dataclass
class DistanceSegmentPace:
    """Pace data for a distance segment (e.g., first 5km, second 5km)"""

    segment_start_km: float
    segment_end_km: float
    actual_pace_min_km: float
    grade_adjusted_pace_min_km: float
    elevation_gain_m: float
    elevation_loss_m: float


@dataclass
class NormalizedPaceProfile:
    """
    Pace profile normalized by percentage of total distance.
    Allows comparison across activities of different lengths.
    """

    # Pace multipliers by race progress (1.0 = baseline pace)
    # Keys are percentage ranges: "0-10", "10-20", ..., "90-100"
    pace_by_progress_pct: Dict[str, float]

    # GAP-based multipliers (terrain-adjusted)
    gap_by_progress_pct: Dict[str, float]

    # The baseline pace used for normalization (first 20% average)
    baseline_pace_min_km: float
    baseline_gap_min_km: float

    # Activity distance for context
    activity_distance_km: float


@dataclass
class ActivityAnalysisResult:
    """Complete analysis result for an activity"""

    # Basic activity info
    activity_id: str
    name: Optional[str]
    activity_date: Optional[str]

    # Distance and elevation
    total_distance_km: float
    elevation_gain_m: float
    elevation_loss_m: float

    # Time metrics
    total_time_seconds: float
    moving_time_seconds: float
    stopped_time_seconds: float

    # Pace metrics
    average_pace_min_km: float
    grade_adjusted_pace_min_km: float

    # Performance by gradient
    pace_by_gradient: Dict[str, float]

    # Fatigue curve (pace degradation per km)
    fatigue_curve: List[Dict[str, float]]
    fatigue_factor: float  # Percentage increase in pace per km

    # NEW: Distance-based pace segments (absolute 5km buckets)
    pace_by_distance_5k: List[Dict[str, float]] = field(default_factory=list)

    # NEW: Normalized pace profile (percentage of total distance)
    normalized_pace_profile: Optional[Dict[str, Any]] = None

    # Segment analysis
    segment_count: int = 0

    # Metadata
    analysis_version: str = "2.0"


@dataclass
class PerformanceProfile:
    """Aggregated performance profile from multiple activities"""

    # Average paces by terrain
    flat_pace_min_km: float
    gentle_uphill_pace_min_km: float
    uphill_pace_min_km: float
    steep_uphill_pace_min_km: float
    gentle_downhill_pace_min_km: float
    downhill_pace_min_km: float
    steep_downhill_pace_min_km: float

    # Overall metrics
    overall_gap_min_km: float  # Grade adjusted pace

    # Fatigue modeling
    fatigue_factor: float  # Pace increase per 10km

    # NEW: Aggregated normalized pace profile across all activities
    # Shows how pace degrades by percentage of race distance (terrain-adjusted)
    pace_decay_by_progress_pct: Dict[str, float] = field(default_factory=dict)

    # Confidence metrics
    activities_analyzed: int = 0
    total_distance_km: float = 0.0

    # Gradient-specific sample sizes
    gradient_sample_sizes: Dict[str, int] = field(default_factory=dict)


class ActivityPerformanceAnalyzer:
    """Analyzes a single GPX activity for performance metrics"""

    # Segment length for analysis (1km segments work well for trail running)
    SEGMENT_LENGTH_KM = 1.0

    # Minimum points for analysis
    MIN_POINTS = 10

    def __init__(self, gpx_content: str, activity_id: str = None):
        """
        Initialize analyzer with GPX content.

        Args:
            gpx_content: Raw GPX file content
            activity_id: Optional ID for tracking
        """
        self.gpx = gpxpy.parse(gpx_content)
        self.activity_id = activity_id or "unknown"
        self._points: List[Dict[str, Any]] = []
        self._segments: List[SegmentMetrics] = []
        self._extract_points()

    def _extract_points(self) -> None:
        """Extract track points with time and elevation"""
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
        R = 6371000
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
        )
        c = 2 * math.asin(math.sqrt(a))

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

    def _categorize_gradient(self, gradient_percent: float) -> GradientCategory:
        """Categorize gradient into standard categories"""
        if gradient_percent < -8:
            return GradientCategory.STEEP_DOWNHILL
        elif gradient_percent < -3:
            return GradientCategory.DOWNHILL
        elif gradient_percent < -1:
            return GradientCategory.GENTLE_DOWNHILL
        elif gradient_percent < 1:
            return GradientCategory.FLAT
        elif gradient_percent < 3:
            return GradientCategory.GENTLE_UPHILL
        elif gradient_percent < 8:
            return GradientCategory.UPHILL
        else:
            return GradientCategory.STEEP_UPHILL

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

    def _analyze_segments(self) -> List[SegmentMetrics]:
        """Divide activity into segments and calculate metrics"""
        if len(self._points) < self.MIN_POINTS:
            return []

        segments = []
        total_distance_m = self._points[-1]["distance_m"]
        segment_length_m = self.SEGMENT_LENGTH_KM * 1000

        # Calculate metrics for each segment
        current_segment_start = 0

        for i, point in enumerate(self._points):
            if i == 0:
                continue

            # Check if we've completed a segment
            distance_in_segment = (
                point["distance_m"] - self._points[current_segment_start]["distance_m"]
            )

            if distance_in_segment >= segment_length_m or i == len(self._points) - 1:
                # Calculate segment metrics
                start_point = self._points[current_segment_start]
                end_point = point

                distance_km = (
                    end_point["distance_m"] - start_point["distance_m"]
                ) / 1000
                elevation_change = (
                    end_point["elevation_smoothed"] - start_point["elevation_smoothed"]
                )

                # Time calculation
                if start_point["time"] and end_point["time"]:
                    time_delta = end_point["time"] - start_point["time"]
                    time_seconds = time_delta.total_seconds()
                else:
                    time_seconds = 0

                # Skip segments with no valid time
                if time_seconds <= 0 or distance_km <= 0:
                    current_segment_start = i
                    continue

                # Calculate gradient
                gradient = elevation_change / (distance_km * 1000)
                gradient_percent = gradient * 100

                # Calculate paces
                actual_pace = (time_seconds / 60) / distance_km

                # Grade adjusted pace using Minetti
                flat_cost = 3.6
                actual_cost = self._calculate_minetti_cost(gradient)
                cost_ratio = actual_cost / flat_cost if flat_cost > 0 else 1
                gap = actual_pace / cost_ratio if cost_ratio > 0 else actual_pace

                category = self._categorize_gradient(gradient_percent)

                segments.append(
                    SegmentMetrics(
                        start_distance_km=round(start_point["distance_m"] / 1000, 2),
                        end_distance_km=round(end_point["distance_m"] / 1000, 2),
                        distance_km=round(distance_km, 2),
                        elevation_change_m=round(elevation_change, 1),
                        gradient_percent=round(gradient_percent, 1),
                        time_seconds=round(time_seconds, 0),
                        actual_pace_min_km=round(actual_pace, 2),
                        grade_adjusted_pace_min_km=round(gap, 2),
                        gradient_category=category.value,
                    )
                )

                current_segment_start = i

        self._segments = segments
        return segments

    def _calculate_pace_by_gradient(self) -> Dict[str, float]:
        """Calculate average pace for each gradient category"""
        if not self._segments:
            self._analyze_segments()

        pace_sums: Dict[str, List[float]] = {cat.value: [] for cat in GradientCategory}

        for segment in self._segments:
            pace_sums[segment.gradient_category].append(segment.actual_pace_min_km)

        result = {}
        for category, paces in pace_sums.items():
            if paces:
                result[category] = round(sum(paces) / len(paces), 2)
            else:
                result[category] = None

        return result

    def _calculate_fatigue_curve(self) -> Tuple[List[Dict[str, float]], float]:
        """
        Calculate fatigue curve showing pace degradation over distance.

        Returns:
            Tuple of (fatigue_curve data, fatigue_factor)
        """
        if not self._segments:
            self._analyze_segments()

        if len(self._segments) < 3:
            return [], 0.0

        # Use GAP to remove terrain effects
        curve_data = []
        for segment in self._segments:
            curve_data.append(
                {
                    "distance_km": segment.start_distance_km,
                    "gap_min_km": segment.grade_adjusted_pace_min_km,
                }
            )

        # Fit linear trend to find fatigue factor
        if len(curve_data) > 2:
            distances = [d["distance_km"] for d in curve_data]
            paces = [d["gap_min_km"] for d in curve_data]

            try:
                # Simple linear regression
                n = len(distances)
                sum_x = sum(distances)
                sum_y = sum(paces)
                sum_xy = sum(x * y for x, y in zip(distances, paces))
                sum_x2 = sum(x * x for x in distances)

                slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)

                # Fatigue factor as percentage increase per 10km
                avg_pace = sum_y / n
                fatigue_per_10km = (slope * 10 / avg_pace) * 100 if avg_pace > 0 else 0
                fatigue_factor = round(fatigue_per_10km, 2)
            except Exception:
                fatigue_factor = 0.0
        else:
            fatigue_factor = 0.0

        return curve_data, fatigue_factor

    def _calculate_pace_by_distance_5k(self) -> List[Dict[str, float]]:
        """
        Calculate pace for each 5km segment of the activity.

        This provides absolute distance-based pacing analysis:
        - First 5km, second 5km, third 5km, etc.

        Returns:
            List of dicts with segment data for each 5k block
        """
        if not self._segments:
            self._analyze_segments()

        if not self._segments:
            return []

        BUCKET_SIZE_KM = 5.0
        total_distance_km = self._points[-1]["distance_m"] / 1000

        buckets = []
        current_bucket_start = 0.0

        while current_bucket_start < total_distance_km:
            bucket_end = min(current_bucket_start + BUCKET_SIZE_KM, total_distance_km)

            # Find all segments that fall within this bucket
            bucket_segments = [
                seg
                for seg in self._segments
                if seg.start_distance_km >= current_bucket_start
                and seg.start_distance_km < bucket_end
            ]

            if bucket_segments:
                # Calculate weighted average pace (by distance) for this bucket
                total_dist = sum(seg.distance_km for seg in bucket_segments)
                if total_dist > 0:
                    weighted_pace = sum(
                        seg.actual_pace_min_km * seg.distance_km
                        for seg in bucket_segments
                    ) / total_dist
                    weighted_gap = sum(
                        seg.grade_adjusted_pace_min_km * seg.distance_km
                        for seg in bucket_segments
                    ) / total_dist

                    # Calculate elevation for this bucket
                    elev_gain = sum(
                        max(0, seg.elevation_change_m) for seg in bucket_segments
                    )
                    elev_loss = sum(
                        abs(min(0, seg.elevation_change_m)) for seg in bucket_segments
                    )

                    buckets.append(
                        {
                            "segment_start_km": round(current_bucket_start, 1),
                            "segment_end_km": round(bucket_end, 1),
                            "actual_pace_min_km": round(weighted_pace, 2),
                            "grade_adjusted_pace_min_km": round(weighted_gap, 2),
                            "elevation_gain_m": round(elev_gain, 0),
                            "elevation_loss_m": round(elev_loss, 0),
                            "distance_km": round(total_dist, 2),
                        }
                    )

            current_bucket_start = bucket_end

        return buckets

    def _calculate_normalized_pace_profile(self) -> Optional[Dict[str, Any]]:
        """
        Calculate normalized pace profile by percentage of total distance.

        This allows comparing pacing across activities of different lengths:
        - How did you run at 10% of the race? 50%? 90%?
        - Normalized as multipliers relative to your first 20% (baseline)

        Returns:
            Dict with normalized pace profile data, or None if not enough data
        """
        if not self._segments:
            self._analyze_segments()

        if len(self._segments) < 5:
            return None

        total_distance_km = self._points[-1]["distance_m"] / 1000
        if total_distance_km < 5.0:  # Need at least 5km for meaningful analysis
            return None

        # Define 10% buckets
        BUCKET_PCT = 10
        pace_by_pct: Dict[str, List[float]] = {}
        gap_by_pct: Dict[str, List[float]] = {}

        for i in range(0, 100, BUCKET_PCT):
            key = f"{i}-{i + BUCKET_PCT}"
            pace_by_pct[key] = []
            gap_by_pct[key] = []

        # Assign each segment to its percentage bucket
        for seg in self._segments:
            seg_center_km = (seg.start_distance_km + seg.end_distance_km) / 2
            pct_of_race = (seg_center_km / total_distance_km) * 100

            # Find the right bucket
            bucket_idx = min(int(pct_of_race // BUCKET_PCT), 9)  # Cap at 90-100 bucket
            key = f"{bucket_idx * BUCKET_PCT}-{(bucket_idx + 1) * BUCKET_PCT}"

            pace_by_pct[key].append(seg.actual_pace_min_km)
            gap_by_pct[key].append(seg.grade_adjusted_pace_min_km)

        # Calculate averages for each bucket
        avg_pace_by_pct: Dict[str, float] = {}
        avg_gap_by_pct: Dict[str, float] = {}

        for key in pace_by_pct:
            if pace_by_pct[key]:
                avg_pace_by_pct[key] = sum(pace_by_pct[key]) / len(pace_by_pct[key])
            if gap_by_pct[key]:
                avg_gap_by_pct[key] = sum(gap_by_pct[key]) / len(gap_by_pct[key])

        # Calculate baseline from first 20% (first two buckets)
        baseline_paces = pace_by_pct.get("0-10", []) + pace_by_pct.get("10-20", [])
        baseline_gaps = gap_by_pct.get("0-10", []) + gap_by_pct.get("10-20", [])

        if not baseline_paces or not baseline_gaps:
            return None

        baseline_pace = sum(baseline_paces) / len(baseline_paces)
        baseline_gap = sum(baseline_gaps) / len(baseline_gaps)

        # Convert to multipliers (1.0 = baseline, 1.1 = 10% slower, etc.)
        pace_multipliers: Dict[str, float] = {}
        gap_multipliers: Dict[str, float] = {}

        for key, avg_pace in avg_pace_by_pct.items():
            pace_multipliers[key] = round(avg_pace / baseline_pace, 3)

        for key, avg_gap in avg_gap_by_pct.items():
            gap_multipliers[key] = round(avg_gap / baseline_gap, 3)

        return {
            "pace_by_progress_pct": pace_multipliers,
            "gap_by_progress_pct": gap_multipliers,
            "baseline_pace_min_km": round(baseline_pace, 2),
            "baseline_gap_min_km": round(baseline_gap, 2),
            "activity_distance_km": round(total_distance_km, 2),
        }

    def analyze(self) -> ActivityAnalysisResult:
        """
        Perform complete analysis of the activity.

        Returns:
            ActivityAnalysisResult with all metrics
        """
        if len(self._points) < self.MIN_POINTS:
            raise ValueError(
                f"Not enough points for analysis (found {len(self._points)}, need {self.MIN_POINTS})"
            )

        # Analyze segments
        self._analyze_segments()

        # Calculate basic metrics
        total_distance_km = self._points[-1]["distance_m"] / 1000

        # Elevation gain/loss
        elevation_gain = 0.0
        elevation_loss = 0.0
        for i in range(1, len(self._points)):
            diff = (
                self._points[i]["elevation_smoothed"]
                - self._points[i - 1]["elevation_smoothed"]
            )
            if diff > 0:
                elevation_gain += diff
            else:
                elevation_loss += abs(diff)

        # Time metrics
        start_time = self._points[0]["time"]
        end_time = self._points[-1]["time"]

        if start_time and end_time:
            total_time = (end_time - start_time).total_seconds()
            moving_time = (
                self.gpx.get_moving_data().moving_time
                if self.gpx.get_moving_data()
                else total_time
            )
            stopped_time = total_time - moving_time
        else:
            total_time = 0
            moving_time = 0
            stopped_time = 0

        # Average paces
        if moving_time > 0 and total_distance_km > 0:
            avg_pace = (moving_time / 60) / total_distance_km
        else:
            avg_pace = 0

        # Calculate overall GAP
        if self._segments:
            gap_sum = sum(s.grade_adjusted_pace_min_km for s in self._segments)
            overall_gap = gap_sum / len(self._segments)
        else:
            overall_gap = avg_pace

        # Pace by gradient
        pace_by_gradient = self._calculate_pace_by_gradient()

        # Fatigue curve
        fatigue_curve, fatigue_factor = self._calculate_fatigue_curve()

        # Activity metadata
        name = None
        activity_date = None
        for track in self.gpx.tracks:
            if track.name:
                name = track.name
                break
        if start_time:
            activity_date = start_time.isoformat()

        # NEW: Calculate distance-based pace segments
        pace_by_distance_5k = self._calculate_pace_by_distance_5k()

        # NEW: Calculate normalized pace profile
        normalized_pace_profile = self._calculate_normalized_pace_profile()

        return ActivityAnalysisResult(
            activity_id=self.activity_id,
            name=name,
            activity_date=activity_date,
            total_distance_km=round(total_distance_km, 2),
            elevation_gain_m=round(elevation_gain, 0),
            elevation_loss_m=round(elevation_loss, 0),
            total_time_seconds=round(total_time, 0),
            moving_time_seconds=round(moving_time, 0),
            stopped_time_seconds=round(stopped_time, 0),
            average_pace_min_km=round(avg_pace, 2),
            grade_adjusted_pace_min_km=round(overall_gap, 2),
            pace_by_gradient=pace_by_gradient,
            fatigue_curve=fatigue_curve,
            fatigue_factor=fatigue_factor,
            pace_by_distance_5k=pace_by_distance_5k,
            normalized_pace_profile=normalized_pace_profile,
            segment_count=len(self._segments),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Export analysis as dictionary"""
        result = self.analyze()
        return asdict(result)


def aggregate_performance_profiles(
    analyses: List[ActivityAnalysisResult],
    recency_weights: Optional[List[float]] = None,
) -> PerformanceProfile:
    """
    Aggregate multiple activity analyses into a single performance profile.

    Args:
        analyses: List of ActivityAnalysisResult objects
        recency_weights: Optional weights for each analysis (most recent should be higher)

    Returns:
        PerformanceProfile with weighted averages
    """
    if not analyses:
        raise ValueError("No analyses provided")

    # Default weights if not provided (uniform)
    if recency_weights is None:
        recency_weights = [1.0] * len(analyses)

    # Normalize weights
    total_weight = sum(recency_weights)
    weights = [w / total_weight for w in recency_weights]

    # Initialize accumulators
    gradient_paces: Dict[str, List[Tuple[float, float]]] = {
        cat.value: [] for cat in GradientCategory
    }
    all_gaps = []
    all_fatigues = []
    total_distance = 0.0

    # NEW: Accumulator for normalized pace profiles (GAP-based multipliers)
    pace_decay_by_pct: Dict[str, List[Tuple[float, float]]] = {
        f"{i}-{i + 10}": [] for i in range(0, 100, 10)
    }

    for analysis, weight in zip(analyses, weights):
        # Accumulate pace by gradient
        for gradient, pace in analysis.pace_by_gradient.items():
            if pace is not None:
                gradient_paces[gradient].append((pace, weight))

        # Accumulate overall metrics
        all_gaps.append((analysis.grade_adjusted_pace_min_km, weight))
        all_fatigues.append((analysis.fatigue_factor, weight))
        total_distance += analysis.total_distance_km

        # NEW: Accumulate normalized pace profiles
        # Weight longer activities more (they provide more reliable pacing data)
        if analysis.normalized_pace_profile:
            profile = analysis.normalized_pace_profile
            gap_multipliers = profile.get("gap_by_progress_pct", {})
            distance_weight = weight * analysis.total_distance_km

            for pct_key, multiplier in gap_multipliers.items():
                if pct_key in pace_decay_by_pct:
                    pace_decay_by_pct[pct_key].append((multiplier, distance_weight))

    # Calculate weighted averages
    def weighted_average(values_weights: List[Tuple[float, float]]) -> Optional[float]:
        if not values_weights:
            return None
        total_w = sum(w for _, w in values_weights)
        if total_w == 0:
            return None
        return sum(v * w for v, w in values_weights) / total_w

    # Build profile
    gradient_sample_sizes = {k: len(v) for k, v in gradient_paces.items()}

    flat_pace = weighted_average(gradient_paces.get(GradientCategory.FLAT.value, []))
    gentle_up = weighted_average(
        gradient_paces.get(GradientCategory.GENTLE_UPHILL.value, [])
    )
    up = weighted_average(gradient_paces.get(GradientCategory.UPHILL.value, []))
    steep_up = weighted_average(
        gradient_paces.get(GradientCategory.STEEP_UPHILL.value, [])
    )
    gentle_down = weighted_average(
        gradient_paces.get(GradientCategory.GENTLE_DOWNHILL.value, [])
    )
    down = weighted_average(gradient_paces.get(GradientCategory.DOWNHILL.value, []))
    steep_down = weighted_average(
        gradient_paces.get(GradientCategory.STEEP_DOWNHILL.value, [])
    )

    # NEW: Calculate aggregated pace decay profile
    aggregated_pace_decay: Dict[str, float] = {}
    for pct_key, values_weights in pace_decay_by_pct.items():
        avg = weighted_average(values_weights)
        if avg is not None:
            aggregated_pace_decay[pct_key] = round(avg, 3)

    return PerformanceProfile(
        flat_pace_min_km=round(flat_pace, 2) if flat_pace else 0.0,
        gentle_uphill_pace_min_km=round(gentle_up, 2) if gentle_up else 0.0,
        uphill_pace_min_km=round(up, 2) if up else 0.0,
        steep_uphill_pace_min_km=round(steep_up, 2) if steep_up else 0.0,
        gentle_downhill_pace_min_km=round(gentle_down, 2) if gentle_down else 0.0,
        downhill_pace_min_km=round(down, 2) if down else 0.0,
        steep_downhill_pace_min_km=round(steep_down, 2) if steep_down else 0.0,
        overall_gap_min_km=round(weighted_average(all_gaps) or 0.0, 2),
        fatigue_factor=round(weighted_average(all_fatigues) or 0.0, 2),
        pace_decay_by_progress_pct=aggregated_pace_decay,
        activities_analyzed=len(analyses),
        total_distance_km=round(total_distance, 2),
        gradient_sample_sizes=gradient_sample_sizes,
    )
