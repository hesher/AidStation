"""
Celery Application Configuration
"""

from celery import Celery
import os

# Initialize Celery
redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
app = Celery('aidstation', broker=redis_url, backend=redis_url)

# Configure Celery
app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max per task
)

# Auto-discover tasks
app.autodiscover_tasks(['src.tasks'])

__all__ = ['app']
