"""
Race Plan Predictor

Advanced race time prediction using Minetti cost function,
fatigue modeling, and nighttime adjustments.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional


class CutoffStatus(Enum):
    SAFE = "safe"  # >30 min buffer
    WARNING = "warning"  # 15-30 min buffer
    DANGER = "danger"  # <15 min buffer
    MISSED = "missed"  # Past cutoff


@dataclass
class AidStationInput:
    """Input data for an aid station"""

    id: str
    name: str
    distance_km: float
    distance_from_prev_km: Optional[float]
    elevation_m: Optional[float]
    elevation_gain_from_prev_m: Optional[float]
    elevation_loss_from_prev_m: Optional[float]
    cutoff_hours_from_start: Optional[float]


@dataclass
class PerformanceProfile:
    """User's performance profile"""

    flat_pace_min_km: float
    climbing_pace_min_km: float
    descending_pace_min_km: float
    fatigue_factor: float  # Riegel exponent, typically 1.02-1.15
    gradient_paces: Optional[Dict[str, float]] = None  # pace by gradient category
    # NEW: Pace decay by race progress percentage (from activity analysis)
    # Keys are "0-10", "10-20", ..., "90-100" -> multiplier values
    pace_decay_by_progress_pct: Optional[Dict[str, float]] = None


@dataclass
class PredictionResult:
    """Prediction result for an aid station"""

    aid_station_id: str
    aid_station_name: str
    distance_km: float
    predicted_arrival_minutes: float
    predicted_arrival_time: datetime
    cutoff_hours_from_start: Optional[float]
    cutoff_time: Optional[datetime]
    buffer_minutes: Optional[float]
    status: CutoffStatus
    segment_pace_min_km: float
    grade_adjusted_pace_min_km: float
    terrain_factor: float
    fatigue_factor: float
    nighttime_factor: float
    is_nighttime: bool


class RacePlanPredictor:
    """
    Predicts race finish times and aid station arrivals using:
    - Minetti cost function for terrain adjustment
    - Progressive fatigue modeling
    - Nighttime slowdown
    """

    # Minetti cost coefficients for walking/running
    # C = 155.4 * i^5 - 30.4 * i^4 - 43.3 * i^3 + 46.3 * i^2 + 19.5 * i + 3.6
    # where i = gradient (rise/run, e.g., 0.10 = 10%)

    # Reference cost on flat ground (gradient = 0)
    FLAT_COST = 3.6  # J/(kg*m)

    # Nighttime hours (21:00 - 06:00)
    NIGHT_START_HOUR = 21
    NIGHT_END_HOUR = 6

    # Default values
    DEFAULT_FLAT_PACE = 6.5  # min/km
    DEFAULT_FATIGUE_FACTOR = 1.08
    DEFAULT_NIGHTTIME_SLOWDOWN = 0.15  # 15%

    def __init__(
        self,
        performance: Optional[PerformanceProfile] = None,
        nighttime_slowdown: float = DEFAULT_NIGHTTIME_SLOWDOWN,
    ):
        """
        Initialize predictor with user's performance profile.

        Args:
            performance: User's performance profile
            nighttime_slowdown: Percentage slowdown during night (0.15 = 15%)
        """
        self.performance = performance or PerformanceProfile(
            flat_pace_min_km=self.DEFAULT_FLAT_PACE,
            climbing_pace_min_km=12.0,
            descending_pace_min_km=5.5,
            fatigue_factor=self.DEFAULT_FATIGUE_FACTOR,
        )
        self.nighttime_slowdown = nighttime_slowdown

    def predict(
        self,
        aid_stations: List[AidStationInput],
        start_time: datetime,
        total_distance_km: float,
        base_pace_min_km: Optional[float] = None,
    ) -> List[PredictionResult]:
        """
        Generate predictions for all aid stations.

        Args:
            aid_stations: List of aid stations with elevation data
            start_time: Race start time
            total_distance_km: Total race distance
            base_pace_min_km: Optional override for flat pace

        Returns:
            List of prediction results for each station
        """
        base_pace = base_pace_min_km or self.performance.flat_pace_min_km

        results: List[PredictionResult] = []
        cumulative_minutes = 0.0
        prev_distance_km = 0.0

        for station in aid_stations:
            segment_distance = self._get_segment_distance(station, prev_distance_km)

            # Calculate terrain factor using Minetti cost
            terrain_factor = self._calculate_terrain_factor(station, segment_distance)

            # Calculate progressive fatigue
            fatigue_factor = self._calculate_fatigue_factor(
                station.distance_km, total_distance_km
            )

            # Check if nighttime
            arrival_time_so_far = start_time + timedelta(minutes=cumulative_minutes)
            is_nighttime = self._is_nighttime(arrival_time_so_far)
            nighttime_factor = 1.0 + self.nighttime_slowdown if is_nighttime else 1.0

            # Calculate segment pace
            segment_pace = (
                base_pace * terrain_factor * fatigue_factor * nighttime_factor
            )
            grade_adjusted_pace = base_pace * terrain_factor

            # Calculate segment time
            segment_time = segment_distance * segment_pace
            cumulative_minutes += segment_time

            # Calculate arrival time
            predicted_arrival = start_time + timedelta(minutes=cumulative_minutes)

            # Determine cutoff status
            cutoff_time, buffer_minutes, status = self._calculate_cutoff_status(
                station, start_time, predicted_arrival
            )

            results.append(
                PredictionResult(
                    aid_station_id=station.id,
                    aid_station_name=station.name,
                    distance_km=station.distance_km,
                    predicted_arrival_minutes=round(cumulative_minutes),
                    predicted_arrival_time=predicted_arrival,
                    cutoff_hours_from_start=station.cutoff_hours_from_start,
                    cutoff_time=cutoff_time,
                    buffer_minutes=round(buffer_minutes) if buffer_minutes else None,
                    status=status,
                    segment_pace_min_km=round(segment_pace * 100) / 100,
                    grade_adjusted_pace_min_km=round(grade_adjusted_pace * 100) / 100,
                    terrain_factor=round(terrain_factor * 100) / 100,
                    fatigue_factor=round(fatigue_factor * 100) / 100,
                    nighttime_factor=round(nighttime_factor * 100) / 100,
                    is_nighttime=is_nighttime,
                )
            )

            prev_distance_km = station.distance_km

        return results

    def _get_segment_distance(
        self, station: AidStationInput, prev_distance_km: float
    ) -> float:
        """Get distance of segment to this station."""
        if station.distance_from_prev_km is not None:
            return station.distance_from_prev_km
        return station.distance_km - prev_distance_km

    def _calculate_terrain_factor(
        self, station: AidStationInput, segment_distance: float
    ) -> float:
        """
        Calculate terrain factor using Minetti cost function.

        The Minetti equation estimates metabolic cost of locomotion
        at different gradients:
        C = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6

        Returns ratio of cost at gradient vs flat cost.
        """
        if segment_distance <= 0:
            return 1.0

        elev_gain = station.elevation_gain_from_prev_m or 0
        elev_loss = station.elevation_loss_from_prev_m or 0

        # Calculate net gradient
        net_elevation = elev_gain - elev_loss
        gradient = net_elevation / (segment_distance * 1000)  # rise/run

        # Clamp gradient to reasonable range (-0.5 to 0.5)
        gradient = max(-0.5, min(0.5, gradient))

        # Apply Minetti cost function
        cost = self._minetti_cost(gradient)

        # Return ratio to flat cost (higher = slower)
        return max(0.5, min(3.0, cost / self.FLAT_COST))

    def _minetti_cost(self, gradient: float) -> float:
        """
        Minetti cost function for metabolic cost of locomotion.

        C = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6

        Args:
            gradient: Rise/run (e.g., 0.10 = 10% grade)

        Returns:
            Metabolic cost in J/(kg*m)
        """
        i = gradient
        cost = (
            155.4 * (i**5)
            - 30.4 * (i**4)
            - 43.3 * (i**3)
            + 46.3 * (i**2)
            + 19.5 * i
            + 3.6
        )
        # Ensure cost is positive
        return max(1.0, cost)

    def _calculate_fatigue_factor(
        self, distance_km: float, total_distance_km: float
    ) -> float:
        """
        Calculate progressive fatigue factor based on race progress.

        If pace_decay_by_progress_pct is available from activity analysis,
        uses actual pacing patterns from previous runs. Otherwise falls back
        to linear Riegel-based estimate.

        The pace_decay data shows how the runner typically slows down:
        - At 0-20% of race: baseline (multiplier ~1.0)
        - At 80-100% of race: peak fatigue (multiplier might be 1.15 = 15% slower)
        """
        if total_distance_km <= 0:
            return 1.0

        # Progress through race (0 to 100)
        progress_pct = (distance_km / total_distance_km) * 100

        # NEW: Use segment-based pace decay if available
        if self.performance.pace_decay_by_progress_pct:
            pace_decay = self.performance.pace_decay_by_progress_pct

            # Find the appropriate bucket for current progress
            bucket_idx = min(int(progress_pct // 10), 9)  # 0-9 for 10 buckets
            bucket_key = f"{bucket_idx * 10}-{(bucket_idx + 1) * 10}"

            if bucket_key in pace_decay:
                # The pace_decay value is already a multiplier (1.0 = baseline)
                # It's based on GAP (terrain-adjusted) so it's pure fatigue
                return pace_decay[bucket_key]

            # Interpolation fallback: if exact bucket not found, interpolate
            # between available buckets
            available_buckets = sorted(
                [(int(k.split("-")[0]), v) for k, v in pace_decay.items()]
            )
            if available_buckets:
                # Find surrounding buckets
                for i, (pct, mult) in enumerate(available_buckets):
                    if pct > progress_pct and i > 0:
                        prev_pct, prev_mult = available_buckets[i - 1]
                        # Linear interpolation
                        ratio = (progress_pct - prev_pct) / (pct - prev_pct)
                        return prev_mult + ratio * (mult - prev_mult)
                # If past all buckets, use last one
                return available_buckets[-1][1]

        # Fallback: linear Riegel-based fatigue estimate
        progress = distance_km / total_distance_km
        base_fatigue = self.performance.fatigue_factor - 1.0
        return 1.0 + base_fatigue * progress

    def _is_nighttime(self, time: datetime) -> bool:
        """Check if given time is during nighttime hours."""
        hour = time.hour
        return hour >= self.NIGHT_START_HOUR or hour < self.NIGHT_END_HOUR

    def _calculate_cutoff_status(
        self,
        station: AidStationInput,
        start_time: datetime,
        predicted_arrival: datetime,
    ) -> tuple[Optional[datetime], Optional[float], CutoffStatus]:
        """Calculate cutoff time, buffer, and status."""
        if not station.cutoff_hours_from_start:
            return None, None, CutoffStatus.SAFE

        cutoff_time = start_time + timedelta(hours=station.cutoff_hours_from_start)
        buffer_minutes = (cutoff_time - predicted_arrival).total_seconds() / 60

        if buffer_minutes < 0:
            status = CutoffStatus.MISSED
        elif buffer_minutes < 15:
            status = CutoffStatus.DANGER
        elif buffer_minutes < 30:
            status = CutoffStatus.WARNING
        else:
            status = CutoffStatus.SAFE

        return cutoff_time, buffer_minutes, status

    def predict_finish(
        self,
        predictions: List[PredictionResult],
        total_distance_km: float,
        start_time: datetime,
    ) -> Dict[str, Any]:
        """
        Calculate total predicted finish time.

        Args:
            predictions: List of aid station predictions
            total_distance_km: Total race distance
            start_time: Race start time

        Returns:
            Dict with finish predictions
        """
        if not predictions:
            return {
                "predicted_total_minutes": 0,
                "predicted_finish_time": start_time,
            }

        last_prediction = predictions[-1]

        # If last station is finish, use its time
        if abs(last_prediction.distance_km - total_distance_km) < 0.5:
            return {
                "predicted_total_minutes": last_prediction.predicted_arrival_minutes,
                "predicted_finish_time": last_prediction.predicted_arrival_time,
            }

        # Extrapolate to finish
        remaining_distance = total_distance_km - last_prediction.distance_km

        # Use last segment's pace as estimate
        estimated_time = remaining_distance * last_prediction.segment_pace_min_km
        total_minutes = last_prediction.predicted_arrival_minutes + estimated_time
        finish_time = start_time + timedelta(minutes=total_minutes)

        return {
            "predicted_total_minutes": round(total_minutes),
            "predicted_finish_time": finish_time,
        }


def create_predictor_from_profile(
    profile_data: Optional[Dict[str, Any]],
    nighttime_slowdown: float = 0.15,
) -> RacePlanPredictor:
    """
    Create a predictor from user profile data.

    Args:
        profile_data: User's performance profile from database
        nighttime_slowdown: Nighttime slowdown percentage

    Returns:
        Configured RacePlanPredictor
    """
    if not profile_data:
        return RacePlanPredictor(nighttime_slowdown=nighttime_slowdown)

    performance = PerformanceProfile(
        flat_pace_min_km=profile_data.get("flat_pace_min_km", 6.5),
        climbing_pace_min_km=profile_data.get("climbing_pace_min_km", 12.0),
        descending_pace_min_km=profile_data.get("descending_pace_min_km", 5.5),
        fatigue_factor=profile_data.get("fatigue_factor", 1.08),
        gradient_paces=profile_data.get("gradient_paces"),
        pace_decay_by_progress_pct=profile_data.get("pace_decay_by_progress_pct"),
    )

    return RacePlanPredictor(
        performance=performance,
        nighttime_slowdown=nighttime_slowdown,
    )
