"""
GPX Course Analyzer

Provides comprehensive analysis of GPX course data including:
- Distance calculations
- Elevation gain/loss between points
- Kalman filtering for elevation smoothing
- Grade Adjusted Pace calculations
- Aid station metric calculations
"""

import gpxpy
from scipy import signal
from typing import Dict, Any, List, Tuple
from dataclasses import dataclass
from math import radians, cos, sin, asin, sqrt


@dataclass
class CoursePoint:
    """Represents a point on the course"""
    lat: float
    lon: float
    elevation: float
    distance_from_start_m: float


@dataclass
class AidStationAnalysis:
    """Detailed analysis for an aid station"""
    name: str
    distance_km: float
    elevation_m: float
    distance_from_prev_km: float
    elevation_gain_from_prev_m: float
    elevation_loss_from_prev_m: float
    avg_gradient_percent: float


class GPXCourseAnalyzer:
    """Analyzes GPX course data for race planning"""

    def __init__(self, gpx_content: str):
        """
        Initialize analyzer with GPX content.

        Args:
            gpx_content: Raw GPX file content as string
        """
        self.gpx = gpxpy.parse(gpx_content)
        self._points: List[CoursePoint] = []
        self._raw_elevations: List[float] = []
        self._smoothed_elevations: List[float] = []
        self._extract_points()

    def _extract_points(self) -> None:
        """Extract all track points from GPX"""
        cumulative_distance = 0.0
        prev_point = None

        for track in self.gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    if prev_point is not None:
                        # Calculate distance from previous point
                        dist = self._haversine_distance(
                            prev_point.latitude, prev_point.longitude,
                            point.latitude, point.longitude
                        )
                        cumulative_distance += dist

                    elevation = point.elevation or 0.0
                    self._raw_elevations.append(elevation)

                    self._points.append(CoursePoint(
                        lat=point.latitude,
                        lon=point.longitude,
                        elevation=elevation,
                        distance_from_start_m=cumulative_distance
                    ))
                    prev_point = point

        # Apply elevation smoothing
        if len(self._raw_elevations) > 5:
            self._smoothed_elevations = self._kalman_smooth_elevation(self._raw_elevations)
        else:
            self._smoothed_elevations = self._raw_elevations.copy()

        # Update points with smoothed elevation
        for i, point in enumerate(self._points):
            if i < len(self._smoothed_elevations):
                point.elevation = self._smoothed_elevations[i]

    @staticmethod
    def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate the great-circle distance between two points.

        Args:
            lat1, lon1: First point coordinates (degrees)
            lat2, lon2: Second point coordinates (degrees)

        Returns:
            Distance in meters
        """
        R = 6371000  # Earth's radius in meters

        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)

        a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
        c = 2 * asin(sqrt(a))

        return R * c

    @staticmethod
    def _kalman_smooth_elevation(elevations: List[float]) -> List[float]:
        """
        Apply Kalman filtering to smooth GPS elevation data.

        Kalman filter is superior to simple moving averages for GPS data
        as it accounts for measurement noise and state prediction.

        Args:
            elevations: Raw elevation values

        Returns:
            Smoothed elevation values
        """
        n = len(elevations)
        if n < 2:
            return elevations

        # Kalman filter parameters
        R = 10.0  # Measurement noise (GPS elevation variance ~10m)
        Q = 0.1   # Process noise

        # Initial state
        x = elevations[0]  # State estimate
        P = 1.0            # State variance

        smoothed = [x]

        for i in range(1, n):
            # Predict
            x_pred = x
            P_pred = P + Q

            # Update
            K = P_pred / (P_pred + R)  # Kalman gain
            x = x_pred + K * (elevations[i] - x_pred)
            P = (1 - K) * P_pred

            smoothed.append(x)

        return smoothed

    def get_total_distance_km(self) -> float:
        """Get total course distance in kilometers"""
        if not self._points:
            return 0.0
        return self._points[-1].distance_from_start_m / 1000

    def get_elevation_stats(self) -> Dict[str, float]:
        """
        Calculate total elevation gain and loss.

        Returns:
            Dict with elevation_gain_m and elevation_loss_m
        """
        if len(self._smoothed_elevations) < 2:
            return {'elevation_gain_m': 0, 'elevation_loss_m': 0}

        gain = 0.0
        loss = 0.0

        for i in range(1, len(self._smoothed_elevations)):
            diff = self._smoothed_elevations[i] - self._smoothed_elevations[i - 1]
            if diff > 0:
                gain += diff
            else:
                loss += abs(diff)

        return {
            'elevation_gain_m': round(gain, 1),
            'elevation_loss_m': round(loss, 1)
        }

    def find_closest_point(self, lat: float, lon: float) -> Tuple[int, CoursePoint]:
        """
        Find the point on the course closest to the given coordinates.

        Args:
            lat, lon: Target coordinates

        Returns:
            Tuple of (index, CoursePoint)
        """
        if not self._points:
            raise ValueError("No points in course")

        min_dist = float('inf')
        closest_idx = 0

        for i, point in enumerate(self._points):
            dist = self._haversine_distance(lat, lon, point.lat, point.lon)
            if dist < min_dist:
                min_dist = dist
                closest_idx = i

        return closest_idx, self._points[closest_idx]

    def analyze_aid_stations(
        self,
        aid_stations: List[Dict[str, Any]]
    ) -> List[AidStationAnalysis]:
        """
        Calculate detailed metrics for aid stations based on course data.

        Args:
            aid_stations: List of aid station dicts with name, lat, lon OR distanceKm

        Returns:
            List of AidStationAnalysis with calculated metrics
        """
        results = []
        prev_station_idx = 0
        prev_elevation = self._smoothed_elevations[0] if self._smoothed_elevations else 0
        prev_distance_km = 0.0

        for station in aid_stations:
            name = station.get('name', 'Unknown')

            # Find station position on course
            if 'lat' in station and 'lon' in station:
                idx, point = self.find_closest_point(station['lat'], station['lon'])
            elif 'distanceKm' in station:
                # Find point closest to specified distance
                target_m = station['distanceKm'] * 1000
                idx = self._find_point_at_distance(target_m)
                point = self._points[idx]
            else:
                continue

            # Calculate metrics from previous station
            distance_km = point.distance_from_start_m / 1000
            elevation_m = point.elevation
            distance_from_prev_km = distance_km - prev_distance_km

            # Calculate elevation gain/loss between stations
            gain, loss = self._calculate_elevation_change(prev_station_idx, idx)

            # Calculate average gradient
            if distance_from_prev_km > 0:
                net_elevation_change = elevation_m - prev_elevation
                avg_gradient = (net_elevation_change / (distance_from_prev_km * 1000)) * 100
            else:
                avg_gradient = 0.0

            results.append(AidStationAnalysis(
                name=name,
                distance_km=round(distance_km, 2),
                elevation_m=round(elevation_m, 0),
                distance_from_prev_km=round(distance_from_prev_km, 2),
                elevation_gain_from_prev_m=round(gain, 0),
                elevation_loss_from_prev_m=round(loss, 0),
                avg_gradient_percent=round(avg_gradient, 1)
            ))

            prev_station_idx = idx
            prev_elevation = elevation_m
            prev_distance_km = distance_km

        return results

    def _find_point_at_distance(self, target_distance_m: float) -> int:
        """Find index of point closest to target distance"""
        closest_idx = 0
        min_diff = float('inf')

        for i, point in enumerate(self._points):
            diff = abs(point.distance_from_start_m - target_distance_m)
            if diff < min_diff:
                min_diff = diff
                closest_idx = i

        return closest_idx

    def _calculate_elevation_change(
        self,
        start_idx: int,
        end_idx: int
    ) -> Tuple[float, float]:
        """
        Calculate elevation gain and loss between two point indices.

        Returns:
            Tuple of (gain, loss) in meters
        """
        if start_idx >= end_idx or end_idx >= len(self._smoothed_elevations):
            return (0.0, 0.0)

        gain = 0.0
        loss = 0.0

        for i in range(start_idx + 1, end_idx + 1):
            diff = self._smoothed_elevations[i] - self._smoothed_elevations[i - 1]
            if diff > 0:
                gain += diff
            else:
                loss += abs(diff)

        return (gain, loss)

    def get_course_coordinates(self) -> List[Dict[str, float]]:
        """
        Get course coordinates for map rendering.

        Returns:
            List of coordinate dicts with lat, lon, elevation
        """
        return [
            {
                'lat': p.lat,
                'lon': p.lon,
                'elevation': p.elevation,
                'distanceKm': p.distance_from_start_m / 1000
            }
            for p in self._points
        ]

    def get_elevation_profile(self, num_points: int = 100) -> List[Dict[str, float]]:
        """
        Get elevation profile data for charting.

        Args:
            num_points: Number of points to sample

        Returns:
            List of dicts with distanceKm and elevation
        """
        if not self._points:
            return []

        total_distance = self._points[-1].distance_from_start_m
        step = total_distance / num_points if num_points > 0 else total_distance

        profile = []
        for i in range(num_points + 1):
            target_dist = i * step
            idx = self._find_point_at_distance(target_dist)
            point = self._points[idx]

            profile.append({
                'distanceKm': round(target_dist / 1000, 2),
                'elevation': round(point.elevation, 1)
            })

        return profile

    def calculate_gap_for_segment(
        self,
        start_distance_km: float,
        end_distance_km: float,
        time_seconds: float
    ) -> Dict[str, float]:
        """
        Calculate Grade Adjusted Pace for a segment using Minetti equations.

        The Minetti equation models metabolic cost at different gradients:
        C_r = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6

        Args:
            start_distance_km: Start of segment
            end_distance_km: End of segment
            time_seconds: Time taken

        Returns:
            Dict with pace metrics
        """
        start_idx = self._find_point_at_distance(start_distance_km * 1000)
        end_idx = self._find_point_at_distance(end_distance_km * 1000)

        if start_idx >= end_idx or time_seconds <= 0:
            return {'error': 'Invalid segment'}

        start_point = self._points[start_idx]
        end_point = self._points[end_idx]

        distance_m = end_point.distance_from_start_m - start_point.distance_from_start_m
        elevation_diff = end_point.elevation - start_point.elevation

        if distance_m <= 0:
            return {'error': 'Invalid distance'}

        # Calculate gradient
        gradient = elevation_diff / distance_m

        # Minetti cost function
        i = gradient
        cost = (155.4 * i**5 - 30.4 * i**4 - 43.3 * i**3 +
                46.3 * i**2 + 19.5 * i + 3.6)

        # Flat running cost
        flat_cost = 3.6

        # Cost ratio
        cost_ratio = cost / flat_cost if flat_cost > 0 else 1

        # Actual pace (min/km)
        actual_pace = (time_seconds / 60) / (distance_m / 1000)

        # Grade adjusted pace
        gap = actual_pace / cost_ratio if cost_ratio > 0 else actual_pace

        return {
            'distance_km': round(distance_m / 1000, 2),
            'elevation_change_m': round(elevation_diff, 1),
            'gradient_percent': round(gradient * 100, 1),
            'actual_pace_min_km': round(actual_pace, 2),
            'grade_adjusted_pace_min_km': round(gap, 2),
            'cost_ratio': round(cost_ratio, 3)
        }

    def to_dict(self) -> Dict[str, Any]:
        """
        Export analysis results as dictionary.

        Returns:
            Complete analysis as dict
        """
        elevation_stats = self.get_elevation_stats()

        return {
            'total_distance_km': round(self.get_total_distance_km(), 2),
            'elevation_gain_m': elevation_stats['elevation_gain_m'],
            'elevation_loss_m': elevation_stats['elevation_loss_m'],
            'points_count': len(self._points),
            'start_elevation_m': round(self._smoothed_elevations[0], 1) if self._smoothed_elevations else 0,
            'end_elevation_m': round(self._smoothed_elevations[-1], 1) if self._smoothed_elevations else 0,
            'min_elevation_m': round(min(self._smoothed_elevations), 1) if self._smoothed_elevations else 0,
            'max_elevation_m': round(max(self._smoothed_elevations), 1) if self._smoothed_elevations else 0,
        }
