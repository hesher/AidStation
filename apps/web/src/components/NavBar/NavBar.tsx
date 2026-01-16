'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './NavBar.module.css';

interface NavBarProps {
  currentRaceName?: string;
  hasUnsavedChanges?: boolean;
}

export function NavBar({ currentRaceName, hasUnsavedChanges }: NavBarProps) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(path);
  };

  return (
    <nav className={styles.navbar} data-testid="navbar">
      {/* Logo / Brand */}
      <Link href="/" className={styles.logo}>
        <span className={styles.logoIcon}>⛰️</span>
        <span className={styles.logoText}>AidStation</span>
      </Link>

      {/* Current Race Indicator (if available) */}
      {currentRaceName && (
        <div className={styles.currentRace} data-testid="navbar-current-race">
          <span className={styles.currentRaceLabel}>Current:</span>
          <span className={styles.currentRaceName}>{currentRaceName}</span>
          {hasUnsavedChanges && (
            <span
              className={styles.unsavedIndicator}
              title="Unsaved changes"
            >
              ●
            </span>
          )}
        </div>
      )}

      {/* Navigation Links */}
      <div className={styles.nav}>
        <Link
          href="/"
          className={`${styles.navLink} ${isActive('/') && pathname === '/' ? styles.navLinkActive : ''}`}
          data-testid="nav-home"
        >
          <span className={styles.navIcon}>🏠</span>
          <span>Race Search</span>
        </Link>

        <Link
          href="/planning"
          className={`${styles.navLink} ${isActive('/planning') ? styles.navLinkActive : ''}`}
          data-testid="nav-planning"
        >
          <span className={styles.navIcon}>📋</span>
          <span>Planning</span>
        </Link>

        <Link
          href="/performances"
          className={`${styles.navLink} ${isActive('/performances') ? styles.navLinkActive : ''}`}
          data-testid="nav-performances"
        >
          <span className={styles.navIcon}>📊</span>
          <span>Performances</span>
        </Link>
      </div>
    </nav>
  );
}
