/**
 * Race Browser Component
 *
 * Modal for browsing, searching, and loading saved races.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './RaceBrowser.module.css';
import { RaceData } from '@/lib/types';

interface RaceBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRace: (race: RaceData) => void;
  hasUnsavedChanges?: boolean;
}

interface RaceListItem {
  id: string;
  name: string;
  date?: string;
  location?: string;
  country?: string;
  distanceKm?: number;
  isPublic: boolean;
}

interface RaceListResponse {
  success: boolean;
  data?: {
    races: RaceListItem[];
    total: number;
  };
  error?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export function RaceBrowser({
  isOpen,
  onClose,
  onSelectRace,
  hasUnsavedChanges = false,
}: RaceBrowserProps) {
  const [races, setRaces] = useState<RaceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);

  // Fetch races
  const fetchRaces = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (countryFilter) params.set('country', countryFilter);

      const response = await fetch(`${API_BASE_URL}/races?${params.toString()}`, {
        credentials: 'include',
      });

      const data: RaceListResponse = await response.json();

      if (data.success && data.data) {
        setRaces(data.data.races);
      } else {
        setError(data.error || 'Failed to load races');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, countryFilter]);

  // Fetch countries for filter
  const fetchCountries = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/races/countries`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success && data.data) {
        setCountries(data.data);
      }
    } catch {
      // Silently fail - countries are optional
    }
  }, []);

  // Load races when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRaces();
      fetchCountries();
    }
  }, [isOpen, fetchRaces, fetchCountries]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      fetchRaces();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, countryFilter, isOpen, fetchRaces]);

  // Handle race selection
  const handleSelectRace = (raceId: string) => {
    if (hasUnsavedChanges) {
      setSelectedRaceId(raceId);
      setShowConfirmDialog(true);
    } else {
      loadRace(raceId);
    }
  };

  // Load race from API
  const loadRace = async (raceId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/races/${raceId}`, {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success && data.data) {
        onSelectRace(data.data);
        onClose();
      } else {
        setError(data.error || 'Failed to load race');
      }
    } catch {
      setError('Failed to connect to server');
    }
  };

  // Confirm discard changes
  const handleConfirmDiscard = () => {
    if (selectedRaceId) {
      loadRace(selectedRaceId);
    }
    setShowConfirmDialog(false);
    setSelectedRaceId(null);
  };

  // Cancel discard
  const handleCancelDiscard = () => {
    setShowConfirmDialog(false);
    setSelectedRaceId(null);
  };

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Load Race</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.filters}>
          <input
            type="text"
            placeholder="Search by race name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            data-testid="race-browser-search"
          />

          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className={styles.countrySelect}
            data-testid="race-browser-country"
          >
            <option value="">All Countries</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.content}>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p>Loading races...</p>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <p>⚠️ {error}</p>
              <button onClick={fetchRaces} className={styles.retryButton}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && races.length === 0 && (
            <div className={styles.empty}>
              <p>🏃 No races found</p>
              <p className={styles.emptySubtext}>
                {searchQuery || countryFilter
                  ? 'Try adjusting your search filters'
                  : 'Search for a race to get started'}
              </p>
            </div>
          )}

          {!loading && !error && races.length > 0 && (
            <ul className={styles.raceList} data-testid="race-browser-list">
              {races.map((race) => (
                <li key={race.id} className={styles.raceItem}>
                  <button
                    className={styles.raceButton}
                    onClick={() => handleSelectRace(race.id)}
                  >
                    <div className={styles.raceInfo}>
                      <span className={styles.raceName}>{race.name}</span>
                      <span className={styles.raceDetails}>
                        {race.location && <span>{race.location}</span>}
                        {race.country && <span>{race.country}</span>}
                        {race.distanceKm && <span>{race.distanceKm} km</span>}
                        {race.date && <span>{formatDate(race.date)}</span>}
                      </span>
                    </div>
                    <div className={styles.raceVisibility}>
                      {race.isPublic ? (
                        <span className={styles.publicBadge}>🌍 Public</span>
                      ) : (
                        <span className={styles.privateBadge}>🔒 Private</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Confirm Discard Dialog */}
        {showConfirmDialog && (
          <div className={styles.confirmOverlay}>
            <div className={styles.confirmDialog}>
              <h3>Discard Changes?</h3>
              <p>
                You have unsaved changes to the current race. Loading a new race
                will discard these changes.
              </p>
              <div className={styles.confirmButtons}>
                <button
                  onClick={handleCancelDiscard}
                  className={styles.cancelButton}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDiscard}
                  className={styles.discardButton}
                >
                  Discard & Load
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
