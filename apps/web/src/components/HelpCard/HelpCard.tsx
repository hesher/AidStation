'use client';

import { useState } from 'react';
import styles from './HelpCard.module.css';

interface HelpTopic {
  title: string;
  content: string;
}

interface HelpCardProps {
  topics: HelpTopic[];
  title?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function HelpCard({
  topics,
  title = 'Key Concepts',
  collapsible = true,
  defaultExpanded = false,
}: HelpCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!topics || topics.length === 0) return null;

  return (
    <div className={styles.helpCard}>
      <button
        className={styles.header}
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        disabled={!collapsible}
      >
        <span className={styles.title}>
          <span className={styles.icon}>💡</span>
          {title}
        </span>
        {collapsible && (
          <span className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}>
            ▼
          </span>
        )}
      </button>

      {(isExpanded || !collapsible) && (
        <div className={styles.content}>
          {topics.map((topic, index) => (
            <div key={index} className={styles.topic}>
              <h4 className={styles.topicTitle}>{topic.title}</h4>
              <p className={styles.topicContent}>{topic.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const PLANNING_HELP_TOPICS: HelpTopic[] = [
  {
    title: 'Grade Adjusted Pace (GAP)',
    content:
      'GAP normalizes your running pace to account for terrain. On hills, your effort may be higher even if your pace is slower. GAP converts uphill and downhill running to equivalent flat terrain pace, giving a more accurate picture of your fitness.',
  },
  {
    title: 'Cutoff Buffers',
    content:
      'The buffer time is how much margin you have between your predicted arrival and the aid station cutoff. More buffer means you can handle unexpected slowdowns. Green (>30min) is comfortable, yellow (15-30min) needs attention, red (<15min) is risky.',
  },
  {
    title: 'Fatigue Modeling',
    content:
      "As you run longer, you naturally slow down due to muscle fatigue and energy depletion. Our predictions account for this using your historical data to model how much you typically slow over distance. This is especially important for ultra races.",
  },
  {
    title: 'Nighttime Slowdown',
    content:
      'Most runners slow 10-20% after dark due to reduced visibility, temperature changes, and cumulative fatigue. The nighttime slowdown setting adjusts predictions for sections of your race that occur after sunset.',
  },
];

export const PERFORMANCES_HELP_TOPICS: HelpTopic[] = [
  {
    title: 'Recency Weighting',
    content:
      'Your recent activities are weighted more heavily when calculating your performance profile. This accounts for changes in your fitness over time. Activities from 90+ days ago contribute less than recent ones.',
  },
  {
    title: 'Flat vs Climbing Pace',
    content:
      'Your flat pace is measured on terrain with less than 3% grade. Climbing pace is your speed on uphills (>3% grade). Descending pace is for downhills (<-3%). These help predict how you\'ll perform on varied terrain.',
  },
  {
    title: 'Fatigue Factor',
    content:
      'This percentage shows how much your pace typically degrades over the course of a long run. A higher fatigue factor means you slow down more as distance increases. This is calculated from your activity data.',
  },
];
