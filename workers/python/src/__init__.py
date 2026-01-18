"""
AidStation Python Worker

This module provides Celery tasks for:
- GPX/FIT file parsing and analysis
- Grade Adjusted Pace (GAP) calculations
- Race time predictions
- Performance analysis
"""

# Delay Celery import to allow testing without celery installed
def get_celery_app():
    from .celery_app import app
    return app

# Only export get_celery_app function, not the app directly
__all__ = ['get_celery_app']
