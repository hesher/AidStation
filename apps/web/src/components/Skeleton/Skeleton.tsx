/**
 * Skeleton Component
 *
 * Loading placeholder with shimmer animation.
 */

import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'rectangular' | 'circular';
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  variant = 'rectangular',
  className = '',
}: SkeletonProps) {
  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`${styles.skeleton} ${styles[variant]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

// Pre-composed skeleton patterns for common use cases
export function SkeletonCard() {
  return (
    <div className={styles.card}>
      <Skeleton height={24} width="60%" variant="text" />
      <Skeleton height={16} width="40%" variant="text" />
      <Skeleton height={80} className={styles.spacer} />
      <div className={styles.row}>
        <Skeleton height={16} width="30%" variant="text" />
        <Skeleton height={16} width="30%" variant="text" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.table}>
      <div className={styles.tableHeader}>
        <Skeleton height={16} width="100%" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.tableRow}>
          <Skeleton height={16} width="25%" variant="text" />
          <Skeleton height={16} width="15%" variant="text" />
          <Skeleton height={16} width="20%" variant="text" />
          <Skeleton height={16} width="15%" variant="text" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonMap() {
  return (
    <div className={styles.map}>
      <Skeleton height="100%" width="100%" />
      <div className={styles.mapOverlay}>
        <Skeleton width={40} height={40} variant="circular" />
        <Skeleton width={100} height={16} variant="text" className={styles.spacerSm} />
      </div>
    </div>
  );
}
