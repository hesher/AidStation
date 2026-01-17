'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import styles from './performances.module.css';
import { Skeleton, SkeletonMap } from '@/components/Skeleton';
import { InfoIcon } from '@/components/Tooltip';
import { HelpCard, PERFORMANCES_HELP_TOPICS } from '@/components/HelpCard';
import {
  getActivities,
  uploadActivity,
  getPerformanceProfile,
  deleteActivity,
  syncActivities,
  getActivityCoordinates,
  ActivityCoordinates,
} from '../../lib/api';

// Lazy load heavy components to improve initial page load
const CourseMap = dynamic(
  () => import('@/components/CourseMap').then((mod) => mod.CourseMap),
  {
    loading: () => <SkeletonMap />,
    ssr: false,
  }
);

const ElevationProfile = dynamic(
  () => import('@/components/ElevationProfile').then((mod) => mod.ElevationProfile),
  {
    loading: () => <Skeleton width="100%" height={150} />,
    ssr: false,
  }
);

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

// Selected activity view including coordinates
interface SelectedActivityView {
  activity: Activity;
  coordinates: ActivityCoordinates[];
  isLoading: boolean;
}

// Compute elevation profile data from coordinates
function computeElevationProfile(coordinates: ActivityCoordinates[]): Array<{ distance: number; elevation: number }> {
  if (!coordinates || coordinates.length === 0) return [];

  // Calculate cumulative distance using Haversine formula
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const profile: Array<{ distance: number; elevation: number }> = [];
  let cumulativeDistance = 0;

  // Sample every Nth point for performance (max ~500 points for the chart)
  const step = Math.max(1, Math.floor(coordinates.length / 500));

  for (let i = 0; i < coordinates.length; i += step) {
    const coord = coordinates[i];

    if (i > 0) {
      const prevCoord = coordinates[i - step] || coordinates[i - 1];
      cumulativeDistance += haversineDistance(
        prevCoord.lat,
        prevCoord.lon,
        coord.lat,
        coord.lon
      );
    }

    profile.push({
      distance: cumulativeDistance,
      elevation: coord.elevation ?? 0,
    });
  }

  // Always include the last point
  const lastCoord = coordinates[coordinates.length - 1];
  const lastProfile = profile[profile.length - 1];
  if (lastProfile && lastCoord && coordinates.length > 1) {
    const prevCoord = coordinates[coordinates.length - 2];
    const finalDist =
      lastProfile.distance +
      haversineDistance(prevCoord.lat, prevCoord.lon, lastCoord.lat, lastCoord.lon);

    // Only add if not already the last point
    if (Math.abs(finalDist - lastProfile.distance) > 0.01) {
      profile.push({
        distance: finalDist,
        elevation: lastCoord.elevation ?? 0,
      });
    }
  }

  return profile;
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
  const [selectedActivityView, setSelectedActivityView] = useState<SelectedActivityView | null>(null);

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
        const fileName = file.name.toLowerCase();
        const isFitFile = fileName.endsWith('.fit');

        let fileContent: string;
        let fileType: 'gpx' | 'fit';

        if (isFitFile) {
          // FIT files are binary - read as ArrayBuffer and convert to base64
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          fileContent = btoa(binary);
          fileType = 'fit';
        } else {
          // GPX files are text
          fileContent = await file.text();
          fileType = 'gpx';
        }

        const result = await uploadActivity(fileContent, file.name, undefined, fileType);

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

  const handleViewMap = async (activity: Activity) => {
    setSelectedActivityView({
      activity,
      coordinates: [],
      isLoading: true,
    });

    try {
      const result = await getActivityCoordinates(activity.id);
      if (result.success && result.data) {
        setSelectedActivityView({
          activity,
          coordinates: result.data.coordinates,
          isLoading: false,
        });
      } else {
        setError('Failed to load activity map');
        setSelectedActivityView(null);
      }
    } catch (err) {
      console.error('Load map error:', err);
      setError('Failed to load activity map');
      setSelectedActivityView(null);
    }
  };

  const handleCloseMap = () => {
    setSelectedActivityView(null);
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
          <button onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}

      {/* Performance Summary Card */}
      <section className={styles.summarySection}>
        <h2>
          Performance Summary
          <InfoIcon
            tooltip="Your aggregated performance metrics calculated from all uploaded activities, with more recent activities weighted more heavily."
            position="right"
          />
        </h2>
        {performanceProfile && performanceProfile.activitiesCount > 0 ? (
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>
                Flat Pace
                <InfoIcon
                  tooltip="Average pace on flat terrain (0-3% grade). Used as baseline for predictions."
                  position="bottom"
                />
              </span>
              <span className={styles.cardValue}>
                {formatPace(performanceProfile.flatPaceMinKm)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>
                Climbing Pace
                <InfoIcon
                  tooltip="Average pace on uphill terrain (>3% grade). Slower due to additional effort required."
                  position="bottom"
                />
              </span>
              <span className={styles.cardValue}>
                {formatPace(performanceProfile.climbingPaceMinKm)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>
                Descending Pace
                <InfoIcon
                  tooltip="Average pace on downhill terrain (<-3% grade). Faster due to gravity assistance."
                  position="bottom"
                />
              </span>
              <span className={styles.cardValue}>
                {formatPace(performanceProfile.descendingPaceMinKm)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>
                Fatigue Factor
                <InfoIcon
                  tooltip="How much your pace slows over distance. Higher = more slowdown. Calculated from your activity data."
                  position="bottom"
                />
              </span>
              <span className={styles.cardValue}>
                {performanceProfile.fatigueFactor !== undefined
                  ? `${performanceProfile.fatigueFactor.toFixed(1)}%`
                  : '-'}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardLabel}>
                Activities Analyzed
                <InfoIcon
                  tooltip="Total number of activities used to calculate your performance profile."
                  position="bottom"
                />
              </span>
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
            accept=".gpx,.fit"
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
                <span>Click to upload GPX or FIT files</span>
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
              <span>
                Distance
                <InfoIcon
                  tooltip="Total distance of the activity calculated from GPS data."
                  position="bottom"
                />
              </span>
              <span>
                Elevation
                <InfoIcon
                  tooltip="Total elevation gain (climbing) during the activity."
                  position="bottom"
                />
              </span>
              <span>Duration</span>
              <span>
                Pace
                <InfoIcon
                  tooltip="Average pace (time per km). Does not include stopped time."
                  position="bottom"
                />
              </span>
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
                    onClick={() => handleViewMap(activity)}
                    className={styles.viewMapButton}
                    title="View on map"
                  >
                    🗺️
                  </button>
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

      {/* Activity Map Modal */}
      {selectedActivityView && (
        <div className={styles.mapModal} onClick={handleCloseMap}>
          <div className={styles.mapModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.mapModalHeader}>
              <h3>{selectedActivityView.activity.name || 'Activity'}</h3>
              <div className={styles.mapModalMeta}>
                {selectedActivityView.activity.distanceKm && (
                  <span>{selectedActivityView.activity.distanceKm.toFixed(1)} km</span>
                )}
                {selectedActivityView.activity.elevationGainM && (
                  <span>{Math.round(selectedActivityView.activity.elevationGainM)} m ↗</span>
                )}
                {selectedActivityView.activity.activityDate && (
                  <span>{formatDate(selectedActivityView.activity.activityDate)}</span>
                )}
              </div>
              <button onClick={handleCloseMap} className={styles.mapModalClose} aria-label="Close map">
                ×
              </button>
            </div>
            <div className={styles.mapModalBody}>
              {selectedActivityView.isLoading ? (
                <div className={styles.mapLoading}>
                  <div className={styles.spinner}></div>
                  <p>Loading activity track...</p>
                </div>
              ) : selectedActivityView.coordinates.length > 0 ? (
                <>
                  <CourseMap
                    coordinates={selectedActivityView.coordinates}
                    aidStations={[]}
                  />
                  {/* Elevation Profile with elevation data */}
                  {selectedActivityView.coordinates.some(c => c.elevation !== undefined) && (
                    <div className={styles.elevationProfileContainer}>
                      <ElevationProfile
                        data={computeElevationProfile(selectedActivityView.coordinates)}
                        height={150}
                        showPace={false}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.mapEmpty}>
                  <p>No GPS data available for this activity</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help section explaining key concepts */}
      <HelpCard topics={PERFORMANCES_HELP_TOPICS} title="Understanding Your Performance Data" />

    </main>
  );
}
