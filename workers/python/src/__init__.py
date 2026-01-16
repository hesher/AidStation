"""
AidStation Python Worker

This module provides Celery tasks for:
- GPX/FIT file parsing and analysis
- Grade Adjusted Pace (GAP) calculations
- Race time predictions
- Performance analysis
"""

from .celery_app import app

__all__ = ['app']
