'use client';

import { useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [raceName, setRaceName] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!raceName.trim()) return;

    setIsSearching(true);
    // TODO: Implement AI race search
    console.log('Searching for race:', raceName);
    setIsSearching(false);
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
            disabled={isSearching}
            data-testid="race-search-input"
          />
          <button
            type="submit"
            className={styles.searchButton}
            disabled={isSearching || !raceName.trim()}
            data-testid="race-search-button"
          >
            {isSearching ? 'Searching...' : 'Find Race'}
          </button>
        </form>
      </div>

      <footer className={styles.footer}>
        <p>AidStation v0.1.0 — Built for endurance athletes</p>
      </footer>
    </main>
  );
}
