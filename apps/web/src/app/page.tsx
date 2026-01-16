'use client';

import { useState, useCallback, useEffect } from 'react';
import styles from './page.module.css';
import { RaceCard } from '@/components/RaceCard';
import { AidStationTable } from '@/components/AidStationTable';
import { CourseMap } from '@/components/CourseMap';
import { RaceBrowser } from '@/components/RaceBrowser';
import { RaceSettingsPanel } from '@/components/RaceSettingsPanel';
import { searchRace, getCurrentRace, saveRace, updateRace } from '@/lib/api';
import { RaceData, AidStation } from '@/lib/types';

type AppState = 'initializing' | 'idle' | 'searching' | 'success' | 'error';

export default function Home() {
  const [raceName, setRaceName] = useState('');
  const [appState, setAppState] = useState<AppState>('initializing');
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [isRaceBrowserOpen, setIsRaceBrowserOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      saveRace(result.data).catch((err) => {
        console.warn('Failed to save race:', err);
      });
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

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          value={raceName}
          onChange={(e) => setRaceName(e.target.value)}
          placeholder="e.g., Western States 100, UTMB, Leadville 100..."
          className={styles.searchInput}
          disabled={appState === 'searching'}
          data-testid="race-search-input"
        />
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
            {hasUnsavedChanges && (
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
            />
          </section>

          {/* Course Map */}
          {raceData.courseCoordinates && raceData.courseCoordinates.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Course Map</h3>
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
              />
            </section>
          )}

          {/* No Course Data Message */}
          {(!raceData.courseCoordinates || raceData.courseCoordinates.length === 0) && (
            <section className={styles.section}>
              <div className={styles.noCourseData}>
                <span className={styles.noCourseIcon}>🗺️</span>
                <p>Course coordinates not available for this race.</p>
                <p className={styles.noCourseSubtext}>
                  You can upload a GPX file to visualize the course.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <h1 className={styles.title}>
          <span className={styles.titleIcon}>⛰️</span> AidStation
        </h1>
        <p className={styles.subtitle}>
          AI-powered race planning for endurance athletes
        </p>
      </div>

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
