'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './performances.module.css';
import { ElevationProfile } from '../../components/ElevationProfile';
import {
  getActivities,
  uploadActivity,
  getPerformanceProfile,
  deleteActivity,
  syncActivities,
} from '../../lib/api';

interface Activity {
  id: string;
  name?: string;
  activityDate?: string;
  distanceKm?: number;
  elevationGainM?: number;
  movingTimeSeconds?: number;
  averagePaceMinKm?: number;
  gradeAdjustedPaceMinKm?: number;
  status: string;
  createdAt: string;
  analysisResults?: {
    segments?: Array<{
      startKm: number;
      endKm: number;
      elevationGain: number;
      paceMinKm: number;
    }>;
    elevationProfile?: Array<{
      distance: number;
      elevation: number;
      pace?: number;
    }>;
  };
}

interface PerformanceProfile {
  flatPaceMinKm?: number;
  climbingPaceMinKm?: number;
  descendingPaceMinKm?: number;
  fatigueFactor?: number;
  activitiesCount: number;
  lastUpdated?: string;
}

function formatPace(paceMinKm: number | undefined): string {
  if (!paceMinKm) return '-';
  const minutes = Math.floor(paceMinKm);
  const seconds = Math.round((paceMinKm - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '-';
  }
}

export default function PerformancesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [performanceProfile, setPerformanceProfile] = useState<PerformanceProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [activitiesRes, profileRes] = await Promise.all([
        getActivities(),
        getPerformanceProfile(),
      ]);

      if (activitiesRes.success && activitiesRes.data) {
        setActivities(activitiesRes.data.activities);
      }

      if (profileRes.success && profileRes.data) {
        setPerformanceProfile(profileRes.data);
      }
    } catch (err) {
      setError('Failed to load performance data');
      console.error('Load data error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(`Uploading ${files.length} file(s)...`);
    setError(null);

    let uploaded = 0;
    let failed = 0;

    for (const file of Array.from(files)) {
      try {
        const gpxContent = await file.text();
        const result = await uploadActivity(gpxContent, file.name);

        if (result.success) {
          uploaded++;
        } else {
          failed++;
        }

        setUploadProgress(`Uploaded ${uploaded} of ${files.length} files...`);
      } catch (err) {
        failed++;
        console.error('Upload error:', err);
      }
    }

    // Wait a bit for the worker to process, then sync results
    setUploadProgress('Analyzing activities...');
    
    // Poll for results - try a few times with delays
    let attempts = 0;
    const maxAttempts = 10;
    const delayMs = 2000; // 2 seconds between attempts
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      attempts++;
      
      try {
        const syncResult = await syncActivities();
        if (syncResult.success && syncResult.data) {
          if (syncResult.data.updated > 0) {
            setUploadProgress(`Analyzed ${syncResult.data.updated} activities`);
            break;
          }
        }
      } catch (err) {
        console.error('Sync error:', err);
      }
      
      setUploadProgress(`Analyzing activities... (${attempts}/${maxAttempts})`);
    }

    setUploadProgress('');
    setIsUploading(false);

    if (failed > 0) {
      setError(`${failed} file(s) failed to upload`);
    }

    // Reload data after upload
    loadData();

    // Clear file input
    event.target.value = '';
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    try {
      const result = await deleteActivity(activityId);
      if (result.success) {
        loadData();
      } else {
        setError('Failed to delete activity');
      }
    } catch (err) {
      setError('Failed to delete activity');
      console.error('Delete error:', err);
    }
  };

  if (isLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading performance data...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Past Performances</h1>
        <p className={styles.subtitle}>
          Upload your GPX files to analyze your running performance
        </p>
      </header>

      {error && (
        <div className={styles.errorBanner}>
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Performance Summary Card */}
      <section className={styles.summarySection}>
        <h2>Performance Summary</h2>
        {performanceProfile && performanceProfile.activitiesCount > 0 ? (
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>Flat Pace</span>
              <span className={styles.cardValue}>
                {formatPace(performanceProfile.flatPaceMinKm)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>Climbing Pace</span>
              <span className={styles.cardValue}>
                {formatPace(performanceProfile.climbingPaceMinKm)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>Descending Pace</span>
              <span className={styles.cardValue}>
                {formatPace(performanceProfile.descendingPaceMinKm)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>Fatigue Factor</span>
              <span className={styles.cardValue}>
                {performanceProfile.fatigueFactor !== undefined
                  ? `${performanceProfile.fatigueFactor.toFixed(1)}%`
                  : '-'}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>Activities Analyzed</span>
              <span className={styles.cardValue}>
                {performanceProfile.activitiesCount}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>Last Updated</span>
              <span className={styles.cardValue}>
                {formatDate(performanceProfile.lastUpdated)}
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>No performance data yet. Upload some GPX files to get started!</p>
          </div>
        )}
      </section>

      {/* Upload Section */}
      <section className={styles.uploadSection}>
        <h2>Upload Activities</h2>
        <div className={styles.uploadArea}>
          <input
            type="file"
            id="gpx-upload"
            accept=".gpx"
            multiple
            onChange={handleFileUpload}
            disabled={isUploading}
            className={styles.fileInput}
          />
          <label htmlFor="gpx-upload" className={styles.uploadLabel}>
            {isUploading ? (
              <>
                <div className={styles.smallSpinner}></div>
                <span>{uploadProgress}</span>
              </>
            ) : (
              <>
                <span className={styles.uploadIcon}>📁</span>
                <span>Click to upload GPX files</span>
                <span className={styles.uploadHint}>or drag and drop</span>
              </>
            )}
          </label>
        </div>
      </section>

      {/* Activities List */}
      <section className={styles.activitiesSection}>
        <h2>Uploaded Activities ({activities.length})</h2>
        {activities.length > 0 ? (
          <div className={styles.activitiesTable}>
            <div className={styles.tableHeader}>
              <span>Name</span>
              <span>Date</span>
              <span>Distance</span>
              <span>Elevation</span>
              <span>Duration</span>
              <span>Pace</span>
              <span>Actions</span>
            </div>
            {activities.map((activity) => (
              <div key={activity.id} className={styles.tableRow}>
                <span className={styles.activityName}>
                  {activity.name || 'Untitled Activity'}
                </span>
                <span>{formatDate(activity.activityDate)}</span>
                <span>
                  {activity.distanceKm
                    ? `${activity.distanceKm.toFixed(1)} km`
                    : '-'}
                </span>
                <span>
                  {activity.elevationGainM
                    ? `${Math.round(activity.elevationGainM)} m`
                    : '-'}
                </span>
                <span>{formatDuration(activity.movingTimeSeconds)}</span>
                <span>{formatPace(activity.averagePaceMinKm)}</span>
                <span className={styles.actions}>
                  <button
                    onClick={() => handleDeleteActivity(activity.id)}
                    className={styles.deleteButton}
                    title="Delete activity"
                  >
                    🗑️
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>No activities uploaded yet</p>
          </div>
        )}
      </section>

      {/* Navigation Links */}
      <nav className={styles.navLinks}>
        <a href="/" className={styles.backLink}>
          ← Back to Home
        </a>
        <a href="/planning" className={styles.backLink}>
          📋 Race Planning
        </a>
      </nav>
    </main>
  );
}
