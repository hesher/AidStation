'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import styles from './page.module.css';
import { RaceCard } from '@/components/RaceCard';
import { AidStationTable } from '@/components/AidStationTable';
import { RaceBrowser } from '@/components/RaceBrowser';
import { RaceSettingsPanel } from '@/components/RaceSettingsPanel';
import { Skeleton, SkeletonMap } from '@/components/Skeleton';
import { searchRace, getCurrentRace, saveRace, updateRace, analyzeGpx } from '@/lib/api';
import { RaceData, AidStation } from '@/lib/types';

// Lazy load heavy map component to improve initial page load
const CourseMap = dynamic(
  () => import('@/components/CourseMap').then((mod) => mod.CourseMap),
  {
    loading: () => <SkeletonMap />,
    ssr: false,
  }
);

type AppState = 'initializing' | 'idle' | 'searching' | 'success' | 'error';

// Auto-save debounce delay in milliseconds
const AUTO_SAVE_DELAY = 2000;

export default function Home() {
  const [raceName, setRaceName] = useState('');
  const [appState, setAppState] = useState<AppState>('initializing');
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [isRaceBrowserOpen, setIsRaceBrowserOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);

  // Ref to track auto-save timer
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save effect: triggers save after debounce delay when changes are made
  useEffect(() => {
    // Only auto-save if:
    // 1. Auto-save is enabled
    // 2. There are unsaved changes
    // 3. The race has an ID (already saved once, so we can update it)
    if (!autoSaveEnabled || !hasUnsavedChanges || !raceData?.id) {
      return;
    }

    // Clear any existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set up new auto-save timer
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!raceData?.id) return;

      setIsSaving(true);
      try {
        const result = await updateRace(raceData.id, raceData);
        if (result.success && result.data) {
          setRaceData(result.data);
          setHasUnsavedChanges(false);
          setLastSaveTime(new Date());
        } else {
          console.warn('Auto-save failed:', result.error);
        }
      } catch (err) {
        console.warn('Auto-save error:', err);
      } finally {
        setIsSaving(false);
      }
    }, AUTO_SAVE_DELAY);

    // Cleanup timer on unmount or dependency change
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [autoSaveEnabled, hasUnsavedChanges, raceData]);

  // Initialize app - check for previous race on load
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const result = await getCurrentRace();

        if (result.success && result.data) {
          // Previous race found - load it
          setRaceData(result.data);
          setAppState('success');
        } else {
          // No previous race - show onboarding
          setAppState('idle');
        }
      } catch (err) {
        // Error loading previous race - show onboarding
        console.warn('Failed to load previous race:', err);
        setAppState('idle');
      }
    };

    initializeApp();
  }, []);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!raceName.trim()) return;

    setAppState('searching');
    setError(null);
    setRaceData(null);
    setSelectedStation(null);

    const result = await searchRace(raceName.trim());

    if (result.success && result.data) {
      setRaceData(result.data);
      setAppState('success');

      // Save the race to persist it for page refresh
      // This runs in the background, doesn't block UI
      try {
        const saveResult = await saveRace(result.data);
        if (saveResult.success && saveResult.data) {
          // Update race data with the saved version (includes ID)
          setRaceData(saveResult.data);
          setHasUnsavedChanges(false);
        } else {
          // Save failed - mark as having unsaved changes so user can retry
          console.warn('Failed to save race:', saveResult.error);
          setHasUnsavedChanges(true);
        }
      } catch (err) {
        // Save failed - mark as having unsaved changes so user can retry
        console.warn('Failed to save race:', err);
        setHasUnsavedChanges(true);
      }
    } else {
      setError(result.error || 'Failed to find race');
      setAppState('error');
    }
  }, [raceName]);

  const handleNewSearch = useCallback(() => {
    setAppState('idle');
    setRaceData(null);
    setError(null);
    setRaceName('');
    setSelectedStation(null);
  }, []);

  const handleAidStationClick = useCallback((station: AidStation, index: number) => {
    setSelectedStation(index);
  }, []);

  // Handle loading a race from the browser
  const handleLoadRace = useCallback((race: RaceData) => {
    setRaceData(race);
    setAppState('success');
    setHasUnsavedChanges(false);
  }, []);

  // Handle visibility change
  const handleVisibilityChange = useCallback((isPublic: boolean) => {
    if (raceData) {
      setRaceData({ ...raceData, isPublic });
      setHasUnsavedChanges(true);
    }
  }, [raceData]);

  // Store the GPX content for re-analysis when aid stations change
  const gpxContentRef = useRef<string | null>(null);

  // Helper function to analyze GPX and update race data with elevation metrics
  const analyzeAndUpdateElevation = useCallback(async (
    gpxContent: string,
    currentRaceData: RaceData,
    aidStations: AidStation[]
  ): Promise<RaceData> => {
    const analysisResult = await analyzeGpx(
      gpxContent,
      aidStations.map(s => ({
        name: s.name,
        distanceKm: s.distanceKm ?? undefined,
      }))
    );

    if (!analysisResult.success || !analysisResult.data) {
      if (analysisResult.error) {
        console.warn('GPX analysis warning:', analysisResult.error);
      }
      return currentRaceData;
    }

    const { courseStats, aidStations: analyzedAidStations, coordinates: processedCoords } = analysisResult.data;

    // Start with current race data
    const updatedRaceData = { ...currentRaceData };

    // Use processed coordinates if available
    if (processedCoords && processedCoords.length > 0) {
      updatedRaceData.courseCoordinates = processedCoords;
    }

    // Update race metrics from course stats
    if (courseStats) {
      updatedRaceData.distanceKm = courseStats.total_distance_km;
      updatedRaceData.elevationGainM = courseStats.total_elevation_gain_m;
      updatedRaceData.elevationLossM = courseStats.total_elevation_loss_m;
    }

    // Update aid station data with calculated elevation metrics
    if (analyzedAidStations && analyzedAidStations.length > 0 && updatedRaceData.aidStations) {
      const updatedAidStations = updatedRaceData.aidStations.map(station => {
        // Match by name OR by distance (for newly added stations)
        const analyzed = analyzedAidStations.find(
          a => a.name.toLowerCase() === station.name.toLowerCase() ||
            (station.distanceKm && Math.abs((a.distance_km || 0) - station.distanceKm) < 0.5)
        );

        if (analyzed) {
          return {
            ...station,
            distanceKm: analyzed.distance_km ?? station.distanceKm,
            elevationM: analyzed.elevation_m ?? station.elevationM,
            distanceFromPrevKm: analyzed.distance_from_prev_km ?? station.distanceFromPrevKm,
            elevationGainFromPrevM: analyzed.elevation_gain_from_prev_m ?? station.elevationGainFromPrevM,
            elevationLossFromPrevM: analyzed.elevation_loss_from_prev_m ?? station.elevationLossFromPrevM,
          };
        }
        return station;
      });
      updatedRaceData.aidStations = updatedAidStations;
    }

    return updatedRaceData;
  }, []);

  // Handle overall cutoff change from finish row
  const handleOverallCutoffChange = useCallback((hours: number | null) => {
    if (!raceData) return;
    setRaceData({ ...raceData, overallCutoffHours: hours ?? undefined });
    setHasUnsavedChanges(true);
  }, [raceData]);

  // Handle aid stations change (from editing) - re-analyze GPX if available
  const handleAidStationsChange = useCallback(async (aidStations: AidStation[]) => {
    if (!raceData) return;

    // Update aid stations immediately for responsive UI
    const updatedRaceData = { ...raceData, aidStations };
    setRaceData(updatedRaceData);
    setHasUnsavedChanges(true);

    // Re-analyze GPX to recalculate elevation data for updated aid stations
    if (gpxContentRef.current && raceData.courseCoordinates && raceData.courseCoordinates.length > 0) {
      try {
        const finalRaceData = await analyzeAndUpdateElevation(
          gpxContentRef.current,
          updatedRaceData,
          aidStations
        );
        setRaceData(finalRaceData);
      } catch (err) {
        console.warn('Failed to re-analyze GPX for aid station changes:', err);
      }
    }
  }, [raceData, analyzeAndUpdateElevation]);

  // Handle GPX file upload for race course
  const handleCourseGpxUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !raceData) return;

    try {
      const gpxContent = await file.text();

      // Store GPX content for future re-analysis
      gpxContentRef.current = gpxContent;

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(gpxContent, 'text/xml');

      // Check for parse errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        console.error('GPX parse error:', parseError.textContent);
        setError('Invalid GPX file format');
        return;
      }

      // Extract track points from GPX for immediate visualization
      const coordinates: Array<{ lat: number; lon: number; elevation?: number }> = [];

      // Try to get track points first (most common)
      const trkpts = xmlDoc.querySelectorAll('trkpt');
      if (trkpts.length > 0) {
        trkpts.forEach((pt) => {
          const lat = parseFloat(pt.getAttribute('lat') || '0');
          const lon = parseFloat(pt.getAttribute('lon') || '0');
          const eleEl = pt.querySelector('ele');
          const elevation = eleEl ? parseFloat(eleEl.textContent || '0') : undefined;

          if (lat && lon) {
            coordinates.push({ lat, lon, elevation });
          }
        });
      }

      // If no track points, try route points
      if (coordinates.length === 0) {
        const rtepts = xmlDoc.querySelectorAll('rtept');
        rtepts.forEach((pt) => {
          const lat = parseFloat(pt.getAttribute('lat') || '0');
          const lon = parseFloat(pt.getAttribute('lon') || '0');
          const eleEl = pt.querySelector('ele');
          const elevation = eleEl ? parseFloat(eleEl.textContent || '0') : undefined;

          if (lat && lon) {
            coordinates.push({ lat, lon, elevation });
          }
        });
      }

      // If no route points, try waypoints
      if (coordinates.length === 0) {
        const wpts = xmlDoc.querySelectorAll('wpt');
        wpts.forEach((pt) => {
          const lat = parseFloat(pt.getAttribute('lat') || '0');
          const lon = parseFloat(pt.getAttribute('lon') || '0');
          const eleEl = pt.querySelector('ele');
          const elevation = eleEl ? parseFloat(eleEl.textContent || '0') : undefined;

          if (lat && lon) {
            coordinates.push({ lat, lon, elevation });
          }
        });
      }

      if (coordinates.length === 0) {
        setError('No track points found in GPX file');
        return;
      }

      // Update race data with new course coordinates immediately for visualization
      const updatedRaceData = {
        ...raceData,
        courseCoordinates: coordinates,
      };
      setRaceData(updatedRaceData);
      setHasUnsavedChanges(true);

      // Analyze GPX and update elevation metrics
      const finalRaceData = await analyzeAndUpdateElevation(
        gpxContent,
        updatedRaceData,
        raceData.aidStations || []
      );

      setRaceData(finalRaceData);

      // Clear the input so the same file can be re-uploaded
      e.target.value = '';
    } catch (err) {
      console.error('Error parsing GPX file:', err);
      setError('Failed to parse GPX file');
    }
  }, [raceData, analyzeAndUpdateElevation]);

  // Handle save race
  const handleSaveRace = useCallback(async () => {
    if (!raceData) return;

    setIsSaving(true);

    try {
      let result;
      if (raceData.id) {
        // Update existing race
        result = await updateRace(raceData.id, raceData);
      } else {
        // Save new race
        result = await saveRace(raceData);
      }

      if (result.success && result.data) {
        setRaceData(result.data);
        setHasUnsavedChanges(false);
        setLastSaveTime(new Date());
      } else {
        console.error('Failed to save race:', result.error);
      }
    } catch (err) {
      console.error('Error saving race:', err);
    } finally {
      setIsSaving(false);
    }
  }, [raceData]);

  // Render the search/onboarding form
  const renderSearchForm = () => (
    <div className={styles.onboarding}>
      <h2 className={styles.onboardingTitle}>Find Your Race</h2>
      <p className={styles.onboardingDescription}>
        Enter the name of an ultra-marathon or endurance race, and we&apos;ll help you plan your strategy.
      </p>

      <form onSubmit={handleSearch} className={styles.searchForm} role="search">
        <label htmlFor="race-search" className="sr-only">
          Search for a race
        </label>
        <input
          id="race-search"
          type="text"
          value={raceName}
          onChange={(e) => setRaceName(e.target.value)}
          placeholder="e.g., Western States 100, UTMB, Leadville 100..."
          className={styles.searchInput}
          disabled={appState === 'searching'}
          data-testid="race-search-input"
          aria-describedby="race-search-hint"
        />
        <span id="race-search-hint" className="sr-only">
          Enter the name of an ultra-marathon or endurance race
        </span>
        <button
          type="submit"
          className={styles.searchButton}
          disabled={appState === 'searching' || !raceName.trim()}
          data-testid="race-search-button"
        >
          {appState === 'searching' ? 'Searching...' : 'Find Race'}
        </button>
      </form>

      <div className={styles.orDivider}>
        <span>or</span>
      </div>

      <button
        onClick={() => setIsRaceBrowserOpen(true)}
        className={styles.loadRaceButton}
        data-testid="load-race-button"
      >
        📁 Load Saved Race
      </button>
    </div>
  );

  // Render initialization loading state
  const renderInitializing = () => (
    <div className={styles.loading} data-testid="initializing-state">
      <div className={styles.loadingSpinner} />
      <p className={styles.loadingText}>Loading AidStation...</p>
      <p className={styles.loadingSubtext}>Checking for previous race data.</p>
    </div>
  );

  // Render the loading state
  const renderLoading = () => (
    <div className={styles.loading} data-testid="loading-state">
      <div className={styles.loadingSpinner} />
      <p className={styles.loadingText}>
        🔍 Searching for <strong>{raceName}</strong>...
      </p>
      <p className={styles.loadingSubtext}>
        Using AI to find race information, aid stations, and course details.
      </p>
    </div>
  );

  // Render error state
  const renderError = () => (
    <div className={styles.errorContainer} data-testid="error-state">
      <div className={styles.errorIcon}>⚠️</div>
      <h3 className={styles.errorTitle}>Unable to Find Race</h3>
      <p className={styles.errorMessage}>{error}</p>
      <button onClick={handleNewSearch} className={styles.retryButton}>
        Try Another Search
      </button>
    </div>
  );

  // Render success state with race data
  const renderRaceData = () => {
    if (!raceData) return null;

    return (
      <div className={styles.raceContent} data-testid="race-content">
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button onClick={handleNewSearch} className={styles.backButton}>
              ← Search New Race
            </button>
            <button
              onClick={() => setIsRaceBrowserOpen(true)}
              className={styles.loadButton}
            >
              📁 Load Race
            </button>
          </div>
          {/* Current Race Indicator */}
          <div className={styles.currentRaceIndicator} data-testid="current-race-indicator">
            <span className={styles.currentRaceLabel}>Current:</span>
            <span className={styles.currentRaceName}>{raceData.name}</span>
            {!raceData.id && (
              <span className={styles.notSavedDot} title="Race not saved">⚠️</span>
            )}
            {raceData.id && hasUnsavedChanges && (
              <span className={styles.unsavedDot} title="Unsaved changes">●</span>
            )}
          </div>
        </div>

        <div className={styles.raceLayout}>
          {/* Race Overview Card */}
          <section className={styles.section}>
            <RaceCard race={raceData} />
          </section>

          {/* Race Settings Panel */}
          <section className={styles.section}>
            <RaceSettingsPanel
              race={raceData}
              onVisibilityChange={handleVisibilityChange}
              onSave={handleSaveRace}
              isSaving={isSaving}
              hasUnsavedChanges={hasUnsavedChanges}
              autoSaveEnabled={autoSaveEnabled}
              onAutoSaveToggle={setAutoSaveEnabled}
              lastSaveTime={lastSaveTime}
            />
          </section>

          {/* Course Map with Replace Button (if coordinates exist) */}
          {raceData.courseCoordinates && raceData.courseCoordinates.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>Course Map</h3>
                <input
                  type="file"
                  accept=".gpx"
                  onChange={handleCourseGpxUpload}
                  className={styles.gpxUploadInput}
                  id="replace-gpx-upload"
                />
                <label htmlFor="replace-gpx-upload" className={styles.replaceGpxButton}>
                  🔄 Replace GPX
                </label>
              </div>
              <CourseMap
                coordinates={raceData.courseCoordinates}
                aidStations={raceData.aidStations}
                onAidStationClick={handleAidStationClick}
              />
            </section>
          )}

          {/* Aid Station Table */}
          {raceData.aidStations && raceData.aidStations.length > 0 && (
            <section className={styles.section}>
              <AidStationTable
                aidStations={raceData.aidStations}
                onStationClick={handleAidStationClick}
                onAidStationsChange={handleAidStationsChange}
                editable
                hasCourseData={!!(raceData.courseCoordinates && raceData.courseCoordinates.length > 0)}
                raceDistanceKm={raceData.distanceKm}
                startElevationM={raceData.courseCoordinates?.[0]?.elevation}
                finishElevationM={raceData.courseCoordinates?.[raceData.courseCoordinates.length - 1]?.elevation}
                totalElevationGainM={raceData.elevationGainM}
                totalElevationLossM={raceData.elevationLossM}
                overallCutoffHours={raceData.overallCutoffHours}
                onOverallCutoffChange={handleOverallCutoffChange}
              />
            </section>
          )}

          {/* No Aid Stations - Add Button */}
          {(!raceData.aidStations || raceData.aidStations.length === 0) && (
            <section className={styles.section}>
              <AidStationTable
                aidStations={[]}
                onAidStationsChange={handleAidStationsChange}
                editable
                hasCourseData={!!(raceData.courseCoordinates && raceData.courseCoordinates.length > 0)}
                raceDistanceKm={raceData.distanceKm}
                startElevationM={raceData.courseCoordinates?.[0]?.elevation}
                finishElevationM={raceData.courseCoordinates?.[raceData.courseCoordinates.length - 1]?.elevation}
                totalElevationGainM={raceData.elevationGainM}
                totalElevationLossM={raceData.elevationLossM}
                overallCutoffHours={raceData.overallCutoffHours}
                onOverallCutoffChange={handleOverallCutoffChange}
              />
            </section>
          )}

          {/* No Course Data Message with Upload Button */}
          {(!raceData.courseCoordinates || raceData.courseCoordinates.length === 0) && (
            <section className={styles.section}>
              <div className={styles.noCourseData}>
                <span className={styles.noCourseIcon}>🗺️</span>
                <p>Course coordinates not available for this race.</p>
                <p className={styles.noCourseSubtext}>
                  Upload a GPX file to visualize the course on the map.
                </p>
                <input
                  type="file"
                  accept=".gpx"
                  onChange={handleCourseGpxUpload}
                  className={styles.gpxUploadInput}
                  id="course-gpx-upload"
                />
                <label htmlFor="course-gpx-upload" className={styles.gpxUploadButton}>
                  📤 Upload GPX Course
                </label>
              </div>
            </section>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className={styles.main}>
      {appState === 'initializing' && renderInitializing()}
      {appState === 'idle' && renderSearchForm()}
      {appState === 'searching' && renderLoading()}
      {appState === 'error' && renderError()}
      {appState === 'success' && renderRaceData()}

      <footer className={styles.footer}>
        <p>AidStation v0.1.0 — Built for endurance athletes</p>
      </footer>

      {/* Race Browser Modal */}
      <RaceBrowser
        isOpen={isRaceBrowserOpen}
        onClose={() => setIsRaceBrowserOpen(false)}
        onSelectRace={handleLoadRace}
        hasUnsavedChanges={hasUnsavedChanges}
      />
    </main>
  );
}
