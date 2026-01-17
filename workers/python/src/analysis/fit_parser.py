"""
FIT File Parser

Parses Garmin/ANT+ FIT files and extracts activity data in a format
compatible with the GPX-based ActivityPerformanceAnalyzer.

Uses the fitparse library to decode FIT files.
"""

import io
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from fitparse import FitFile


@dataclass
class FitTrackPoint:
    """A single track point extracted from a FIT file"""
    latitude: float
    longitude: float
    elevation: Optional[float]
    time: Optional[datetime]
    heart_rate: Optional[int] = None
    cadence: Optional[int] = None
    speed: Optional[float] = None
    power: Optional[int] = None


@dataclass
class FitActivityData:
    """Complete activity data extracted from a FIT file"""
    name: Optional[str]
    activity_type: Optional[str]
    start_time: Optional[datetime]
    total_distance_m: float
    total_elapsed_time_s: float
    total_timer_time_s: float
    total_ascent_m: Optional[float]
    total_descent_m: Optional[float]
    avg_heart_rate: Optional[int]
    max_heart_rate: Optional[int]
    avg_speed: Optional[float]
    max_speed: Optional[float]
    points: List[FitTrackPoint]


def parse_fit_content(fit_content: bytes) -> FitActivityData:
    """
    Parse FIT file content and extract activity data.
    
    Args:
        fit_content: Raw FIT file content as bytes
        
    Returns:
        FitActivityData containing all extracted data
    """
    fitfile = FitFile(io.BytesIO(fit_content))
    
    # Initialize data
    name = None
    activity_type = None
    start_time = None
    total_distance_m = 0.0
    total_elapsed_time_s = 0.0
    total_timer_time_s = 0.0
    total_ascent_m = None
    total_descent_m = None
    avg_heart_rate = None
    max_heart_rate = None
    avg_speed = None
    max_speed = None
    points: List[FitTrackPoint] = []
    
    # Iterate through all messages
    for record in fitfile.get_messages():
        record_type = record.name
        
        if record_type == 'session':
            # Session-level data
            for field in record.fields:
                if field.name == 'sport':
                    activity_type = str(field.value) if field.value else None
                elif field.name == 'start_time':
                    start_time = field.value
                elif field.name == 'total_distance':
                    total_distance_m = float(field.value) if field.value else 0.0
                elif field.name == 'total_elapsed_time':
                    total_elapsed_time_s = float(field.value) if field.value else 0.0
                elif field.name == 'total_timer_time':
                    total_timer_time_s = float(field.value) if field.value else 0.0
                elif field.name == 'total_ascent':
                    total_ascent_m = float(field.value) if field.value else None
                elif field.name == 'total_descent':
                    total_descent_m = float(field.value) if field.value else None
                elif field.name == 'avg_heart_rate':
                    avg_heart_rate = int(field.value) if field.value else None
                elif field.name == 'max_heart_rate':
                    max_heart_rate = int(field.value) if field.value else None
                elif field.name == 'avg_speed' or field.name == 'enhanced_avg_speed':
                    avg_speed = float(field.value) if field.value else None
                elif field.name == 'max_speed' or field.name == 'enhanced_max_speed':
                    max_speed = float(field.value) if field.value else None
                    
        elif record_type == 'file_id':
            # File metadata
            for field in record.fields:
                if field.name == 'type':
                    if field.value:
                        name = f"FIT Activity - {field.value}"
                        
        elif record_type == 'record':
            # Track point data
            lat = None
            lon = None
            elevation = None
            timestamp = None
            hr = None
            cadence = None
            speed = None
            power = None
            
            for field in record.fields:
                if field.name == 'position_lat':
                    # FIT uses semicircles, convert to degrees
                    if field.value is not None:
                        lat = field.value * (180.0 / 2**31)
                elif field.name == 'position_long':
                    if field.value is not None:
                        lon = field.value * (180.0 / 2**31)
                elif field.name == 'altitude' or field.name == 'enhanced_altitude':
                    elevation = float(field.value) if field.value is not None else None
                elif field.name == 'timestamp':
                    timestamp = field.value
                elif field.name == 'heart_rate':
                    hr = int(field.value) if field.value is not None else None
                elif field.name == 'cadence':
                    cadence = int(field.value) if field.value is not None else None
                elif field.name == 'speed' or field.name == 'enhanced_speed':
                    speed = float(field.value) if field.value is not None else None
                elif field.name == 'power':
                    power = int(field.value) if field.value is not None else None
                    
            # Only add points with valid GPS coordinates
            if lat is not None and lon is not None:
                points.append(FitTrackPoint(
                    latitude=lat,
                    longitude=lon,
                    elevation=elevation,
                    time=timestamp,
                    heart_rate=hr,
                    cadence=cadence,
                    speed=speed,
                    power=power,
                ))
    
    return FitActivityData(
        name=name,
        activity_type=activity_type,
        start_time=start_time,
        total_distance_m=total_distance_m,
        total_elapsed_time_s=total_elapsed_time_s,
        total_timer_time_s=total_timer_time_s,
        total_ascent_m=total_ascent_m,
        total_descent_m=total_descent_m,
        avg_heart_rate=avg_heart_rate,
        max_heart_rate=max_heart_rate,
        avg_speed=avg_speed,
        max_speed=max_speed,
        points=points,
    )


def fit_to_gpx_format(fit_data: FitActivityData) -> str:
    """
    Convert FIT activity data to GPX XML format.
    
    This allows us to reuse the existing GPX-based analyzers.
    
    Args:
        fit_data: Parsed FIT activity data
        
    Returns:
        GPX file content as string
    """
    gpx_header = '''<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AidStation FIT Converter"
     xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>{name}</name>
    <time>{time}</time>
  </metadata>
  <trk>
    <name>{name}</name>
    <trkseg>
'''.format(
        name=fit_data.name or 'FIT Activity',
        time=fit_data.start_time.isoformat() if fit_data.start_time else ''
    )
    
    gpx_points = []
    for point in fit_data.points:
        point_xml = f'      <trkpt lat="{point.latitude}" lon="{point.longitude}">'
        if point.elevation is not None:
            point_xml += f'\n        <ele>{point.elevation}</ele>'
        if point.time is not None:
            point_xml += f'\n        <time>{point.time.isoformat()}</time>'
        point_xml += '\n      </trkpt>'
        gpx_points.append(point_xml)
    
    gpx_footer = '''
    </trkseg>
  </trk>
</gpx>'''
    
    return gpx_header + '\n'.join(gpx_points) + gpx_footer


def parse_fit_to_gpx(fit_content: bytes) -> str:
    """
    Parse a FIT file and convert it to GPX format.
    
    This is the main entry point for FIT file processing.
    
    Args:
        fit_content: Raw FIT file content as bytes
        
    Returns:
        GPX file content as string
    """
    fit_data = parse_fit_content(fit_content)
    return fit_to_gpx_format(fit_data)
