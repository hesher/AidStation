'use client';

import { useState, useCallback } from 'react';
import styles from './page.module.css';
import { RaceCard } from '@/components/RaceCard';
import { AidStationTable } from '@/components/AidStationTable';
import { CourseMap } from '@/components/CourseMap';
import { searchRace } from '@/lib/api';
import { RaceData, AidStation } from '@/lib/types';

type SearchState = 'idle' | 'searching' | 'success' | 'error';

export default function Home() {
  const [raceName, setRaceName] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!raceName.trim()) return;

    setSearchState('searching');
    setError(null);
    setRaceData(null);
    setSelectedStation(null);

    const result = await searchRace(raceName.trim());

    if (result.success && result.data) {
      setRaceData(result.data);
      setSearchState('success');
    } else {
      setError(result.error || 'Failed to find race');
      setSearchState('error');
    }
  }, [raceName]);

  const handleNewSearch = useCallback(() => {
    setSearchState('idle');
    setRaceData(null);
    setError(null);
    setRaceName('');
    setSelectedStation(null);
  }, []);

  const handleAidStationClick = useCallback((station: AidStation, index: number) => {
    setSelectedStation(index);
  }, []);

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
          disabled={searchState === 'searching'}
          data-testid="race-search-input"
        />
        <button
          type="submit"
          className={styles.searchButton}
          disabled={searchState === 'searching' || !raceName.trim()}
          data-testid="race-search-button"
        >
          {searchState === 'searching' ? 'Searching...' : 'Find Race'}
        </button>
      </form>
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
          <button onClick={handleNewSearch} className={styles.backButton}>
            ← Search New Race
          </button>
        </div>

        <div className={styles.raceLayout}>
          {/* Race Overview Card */}
          <section className={styles.section}>
            <RaceCard race={raceData} />
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

      {searchState === 'idle' && renderSearchForm()}
      {searchState === 'searching' && renderLoading()}
      {searchState === 'error' && renderError()}
      {searchState === 'success' && renderRaceData()}

      <footer className={styles.footer}>
        <p>AidStation v0.1.0 — Built for endurance athletes</p>
      </footer>
    </main>
  );
}
