"""
Race Time Prediction Tasks

Handles race time predictions using various algorithms.
"""

from . import app
from typing import Dict, Any, List
import math


@app.task(name='predict_race_time')
def predict_race_time(
    known_distance_km: float,
    known_time_minutes: float,
    target_distance_km: float,
    fatigue_factor: float = 1.06
) -> Dict[str, Any]:
    """
    Predict race time using the Riegel formula.

    Formula: T2 = T1 * (D2/D1)^fatigue_factor

    Args:
        known_distance_km: Distance of known race in km
        known_time_minutes: Time of known race in minutes
        target_distance_km: Target race distance in km
        fatigue_factor: Riegel exponent (default 1.06, range 1.02-1.15)

    Returns:
        Dict with predicted time and pace
    """
    if known_distance_km <= 0 or known_time_minutes <= 0:
        return {'error': 'Invalid input values'}

    # Riegel formula
    predicted_time = known_time_minutes * math.pow(
        target_distance_km / known_distance_km,
        fatigue_factor
    )

    # Calculate pace
    predicted_pace = predicted_time / target_distance_km

    return {
        'predicted_time_minutes': predicted_time,
        'predicted_time_formatted': format_time(predicted_time),
        'predicted_pace_min_km': predicted_pace,
        'predicted_pace_formatted': format_pace(predicted_pace),
        'fatigue_factor_used': fatigue_factor,
    }


@app.task(name='calculate_fatigue_factor')
def calculate_fatigue_factor(
    races: List[Dict[str, float]]
) -> Dict[str, float]:
    """
    Calculate personalized fatigue factor from past race data.

    Uses linear regression on log-transformed data to find
    the user's personal Riegel exponent.

    Args:
        races: List of dicts with 'distance_km' and 'time_minutes'

    Returns:
        Dict with calculated fatigue factor
    """
    if len(races) < 2:
        return {
            'fatigue_factor': 1.06,
            'confidence': 'low',
            'message': 'Need at least 2 races for personalization'
        }

    # Log-transform the data
    log_distances = [math.log(r['distance_km']) for r in races]
    log_times = [math.log(r['time_minutes']) for r in races]

    # Simple linear regression
    n = len(races)
    sum_x = sum(log_distances)
    sum_y = sum(log_times)
    sum_xy = sum(x * y for x, y in zip(log_distances, log_times))
    sum_x2 = sum(x * x for x in log_distances)

    # Slope is the fatigue factor
    slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)

    # Clamp to reasonable range
    fatigue_factor = max(1.02, min(1.15, slope))

    confidence = 'high' if len(races) >= 5 else 'medium'

    return {
        'fatigue_factor': fatigue_factor,
        'confidence': confidence,
        'races_analyzed': len(races),
    }


@app.task(name='predict_aid_station_times')
def predict_aid_station_times(
    aid_stations: List[Dict[str, Any]],
    base_pace_min_km: float,
    start_time_iso: str,
    nighttime_slowdown: float = 0.15,
    fatigue_curve: List[float] = None
) -> List[Dict[str, Any]]:
    """
    Predict arrival times at each aid station.

    Args:
        aid_stations: List of aid station data (distance, elevation, cutoff)
        base_pace_min_km: User's base flat pace in min/km
        start_time_iso: Race start time in ISO format
        nighttime_slowdown: Percentage slowdown during night (0.15 = 15%)
        fatigue_curve: Optional list of fatigue multipliers by distance

    Returns:
        List of aid stations with predicted times
    """
    from datetime import datetime, timedelta

    start_time = datetime.fromisoformat(start_time_iso.replace('Z', '+00:00'))
    current_time = start_time
    prev_distance = 0

    results = []

    for i, station in enumerate(aid_stations):
        distance_km = station.get('distance_km', 0)
        segment_distance = distance_km - prev_distance

        # Apply terrain adjustment (simplified GAP)
        elevation_gain = station.get('elevation_gain_from_prev', 0)
        terrain_factor = 1 + (elevation_gain / 1000) * 0.1  # 10% slower per 1000m gain

        # Apply fatigue (increases with distance)
        if fatigue_curve and i < len(fatigue_curve):
            fatigue_mult = fatigue_curve[i]
        else:
            fatigue_mult = 1 + (distance_km / 100) * 0.1  # 10% slower per 100km

        # Check if nighttime (simplified: 9PM - 6AM)
        hour = current_time.hour
        is_night = hour >= 21 or hour < 6
        night_factor = 1 + nighttime_slowdown if is_night else 1

        # Calculate segment time
        adjusted_pace = base_pace_min_km * terrain_factor * fatigue_mult * night_factor
        segment_time_minutes = segment_distance * adjusted_pace

        # Update arrival time
        current_time += timedelta(minutes=segment_time_minutes)

        # Check cutoff
        cutoff_time = station.get('cutoff_time_iso')
        buffer_minutes = None
        status = 'green'

        if cutoff_time:
            cutoff = datetime.fromisoformat(cutoff_time.replace('Z', '+00:00'))
            buffer_minutes = (cutoff - current_time).total_seconds() / 60

            if buffer_minutes < 0:
                status = 'red'  # Missed cutoff
            elif buffer_minutes < 15:
                status = 'red'  # Critical
            elif buffer_minutes < 30:
                status = 'orange'  # Warning

        results.append({
            **station,
            'predicted_arrival_time': current_time.isoformat(),
            'elapsed_time_minutes': (current_time - start_time).total_seconds() / 60,
            'segment_pace_min_km': adjusted_pace,
            'buffer_minutes': buffer_minutes,
            'cutoff_status': status,
            'is_night_segment': is_night,
        })

        prev_distance = distance_km

    return results


def format_time(minutes: float) -> str:
    """Format minutes as HH:MM:SS"""
    hours = int(minutes // 60)
    mins = int(minutes % 60)
    secs = int((minutes * 60) % 60)
    return f"{hours:02d}:{mins:02d}:{secs:02d}"


def format_pace(pace_min_km: float) -> str:
    """Format pace as M:SS /km"""
    mins = int(pace_min_km)
    secs = int((pace_min_km - mins) * 60)
    return f"{mins}:{secs:02d} /km"
