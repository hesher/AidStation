/**
 * ErrorBoundary Component
 *
 * React Error Boundary for catching and displaying errors gracefully.
 */

'use client';

import { Component, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={styles.container}>
          <div className={styles.icon}>⚠️</div>
          <h2 className={styles.title}>Something went wrong</h2>
          <p className={styles.message}>
            We encountered an unexpected error. Please try again.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className={styles.details}>
              <summary>Error Details</summary>
              <pre className={styles.errorText}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button onClick={this.handleRetry} className={styles.retryButton}>
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
