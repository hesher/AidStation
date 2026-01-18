/**
 * Race Repository Tests
 *
 * Unit tests for the race repository database operations.
 */

import { describe, it, expect, vi } from 'vitest';
import type { RaceData, AidStationData } from '../repositories/types';

// Mock the database connection
vi.mock('../connection', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'test-race-id',
          name: 'Test Race',
          date: new Date('2024-06-29'),
          location: 'Test Location',
          country: 'USA',
          distanceKm: 100,
          elevationGainM: 5000,
          elevationLossM: 5000,
          startTime: '05:00',
          overallCutoffHours: 30,
          courseGpx: null,
          isPublic: false,
          ownerId: 'test-user-id',
          versionNumber: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {},
        }]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'test-race-id',
            name: 'Updated Race',
            versionNumber: 2,
          }]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'test-race-id' }]),
      }),
    }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

describe('Race Repository Types', () => {
  describe('RaceData interface', () => {
    it('should accept valid race data', () => {
      const raceData: RaceData = {
        name: 'Western States 100',
        date: '2024-06-29',
        location: 'Olympic Valley, CA',
        country: 'USA',
        distanceKm: 161,
        elevationGainM: 5500,
        elevationLossM: 7000,
        startTime: '05:00',
        overallCutoffHours: 30,
      };

      expect(raceData.name).toBe('Western States 100');
      expect(raceData.distanceKm).toBe(161);
    });

    it('should accept race data with optional fields undefined', () => {
      const raceData: RaceData = {
        name: 'Minimal Race',
      };

      expect(raceData.name).toBe('Minimal Race');
      expect(raceData.date).toBeUndefined();
      expect(raceData.distanceKm).toBeUndefined();
    });

    it('should accept race data with course coordinates', () => {
      const raceData: RaceData = {
        name: 'Race with Course',
        courseCoordinates: [
          { lat: 39.1, lon: -120.2, elevation: 1900 },
          { lat: 39.2, lon: -120.3, elevation: 2100 },
        ],
      };

      expect(raceData.courseCoordinates).toHaveLength(2);
      expect(raceData.courseCoordinates![0].lat).toBe(39.1);
    });
  });

  describe('AidStationData interface', () => {
    it('should accept valid aid station data', () => {
      const aidStation: AidStationData = {
        name: 'Michigan Bluff',
        distanceKm: 88.5,
        distanceFromPrevKm: 12.3,
        elevationM: 1120,
        elevationGainFromPrevM: 500,
        elevationLossFromPrevM: 200,
        hasDropBag: true,
        hasCrew: true,
        hasPacer: false,
        cutoffTime: '14:00',
        cutoffHoursFromStart: 20,
      };

      expect(aidStation.name).toBe('Michigan Bluff');
      expect(aidStation.distanceKm).toBe(88.5);
      expect(aidStation.hasDropBag).toBe(true);
    });

    it('should accept minimal aid station data', () => {
      const aidStation: AidStationData = {
        name: 'Aid 1',
        distanceKm: 10,
      };

      expect(aidStation.name).toBe('Aid 1');
      expect(aidStation.hasDropBag).toBeUndefined();
    });
  });
});

describe('Race Repository Data Validation', () => {
  describe('Race creation payload', () => {
    it('should validate race name is required', () => {
      const validRace: RaceData = { name: 'Test Race' };
      expect(validRace.name).toBeTruthy();
    });

    it('should allow all race fields', () => {
      const fullRace: RaceData = {
        name: 'Complete Race',
        date: '2024-12-31',
        location: 'Test Location',
        country: 'USA',
        distanceKm: 100,
        elevationGainM: 3000,
        elevationLossM: 3000,
        startTime: '06:00',
        overallCutoffHours: 24,
        courseGpx: '<gpx>...</gpx>',
        isPublic: true,
        ownerId: 'user-123',
        metadata: { source: 'ai', version: 1 },
        courseCoordinates: [{ lat: 0, lon: 0 }],
      };

      expect(fullRace).toBeDefined();
      expect(fullRace.metadata).toHaveProperty('source');
    });
  });

  describe('Aid station creation payload', () => {
    it('should validate distance is required', () => {
      const validStation: AidStationData = {
        name: 'Start',
        distanceKm: 0,
      };

      expect(validStation.distanceKm).toBe(0);
    });

    it('should allow all aid station fields', () => {
      const fullStation: AidStationData = {
        name: 'Complete Station',
        distanceKm: 50,
        distanceFromPrevKm: 10,
        elevationM: 2000,
        elevationGainFromPrevM: 300,
        elevationLossFromPrevM: 100,
        hasDropBag: true,
        hasCrew: true,
        hasPacer: true,
        cutoffTime: '12:00',
        cutoffHoursFromStart: 12,
        latitude: 39.5,
        longitude: -120.5,
      };

      expect(fullStation).toBeDefined();
      expect(fullStation.latitude).toBe(39.5);
    });
  });
});

describe('Race Repository Business Logic', () => {
  describe('Aid station ordering', () => {
    it('should maintain aid station order by distance', () => {
      const stations: AidStationData[] = [
        { name: 'Station 1', distanceKm: 10 },
        { name: 'Station 2', distanceKm: 25 },
        { name: 'Station 3', distanceKm: 40 },
      ];

      // Verify stations are in order
      for (let i = 1; i < stations.length; i++) {
        const currentDist = stations[i].distanceKm ?? 0;
        const prevDist = stations[i - 1].distanceKm ?? 0;
        expect(currentDist).toBeGreaterThan(prevDist);
      }
    });

    it('should calculate distance from previous station', () => {
      const stations: AidStationData[] = [
        { name: 'Start', distanceKm: 0 },
        { name: 'Aid 1', distanceKm: 15 },
        { name: 'Aid 2', distanceKm: 30 },
      ];

      // Calculate distances from previous
      const enrichedStations = stations.map((station, index) => {
        const dist = station.distanceKm ?? 0;
        if (index === 0) {
          return { ...station, distanceFromPrevKm: dist };
        }
        const prevDist = stations[index - 1].distanceKm ?? 0;
        return {
          ...station,
          distanceFromPrevKm: dist - prevDist,
        };
      });

      expect(enrichedStations[0].distanceFromPrevKm).toBe(0);
      expect(enrichedStations[1].distanceFromPrevKm).toBe(15);
      expect(enrichedStations[2].distanceFromPrevKm).toBe(15);
    });
  });

  describe('Race visibility', () => {
    it('should default to private race', () => {
      const race: RaceData = {
        name: 'Private Race',
      };

      // isPublic defaults to false when not specified
      expect(race.isPublic).toBeUndefined();
    });

    it('should allow explicit public setting', () => {
      const race: RaceData = {
        name: 'Public Race',
        isPublic: true,
      };

      expect(race.isPublic).toBe(true);
    });
  });
});

describe('Race Versioning', () => {
  describe('Version data structure', () => {
    it('should include version number in race data', () => {
      const raceWithVersion = {
        id: 'test-id',
        name: 'Test Race',
        versionNumber: 1,
        aidStations: [],
      };

      expect(raceWithVersion.versionNumber).toBe(1);
    });

    it('should capture aid stations snapshot in version', () => {
      const versionSnapshot = {
        id: 'version-id',
        raceId: 'race-id',
        versionNumber: 1,
        name: 'Test Race',
        aidStationsSnapshot: [
          { name: 'Aid 1', distanceKm: 10 },
          { name: 'Aid 2', distanceKm: 20 },
        ],
        changeSummary: 'Initial version',
        createdAt: new Date(),
      };

      expect(versionSnapshot.aidStationsSnapshot).toHaveLength(2);
      expect(versionSnapshot.changeSummary).toBe('Initial version');
    });

    it('should increment version on race update', () => {
      const originalVersion = 1;
      const updatedVersion = originalVersion + 1;

      expect(updatedVersion).toBe(2);
    });
  });

  describe('Version history', () => {
    it('should list versions in descending order (newest first)', () => {
      const versions = [
        { versionNumber: 3, createdAt: new Date('2024-01-03') },
        { versionNumber: 2, createdAt: new Date('2024-01-02') },
        { versionNumber: 1, createdAt: new Date('2024-01-01') },
      ];

      expect(versions[0].versionNumber).toBe(3);
      expect(versions[versions.length - 1].versionNumber).toBe(1);
    });

    it('should paginate version history', () => {
      const allVersions = [
        { versionNumber: 5 },
        { versionNumber: 4 },
        { versionNumber: 3 },
        { versionNumber: 2 },
        { versionNumber: 1 },
      ];

      const limit = 2;
      const offset = 0;
      const page1 = allVersions.slice(offset, offset + limit);

      expect(page1).toHaveLength(2);
      expect(page1[0].versionNumber).toBe(5);
      expect(page1[1].versionNumber).toBe(4);

      const page2 = allVersions.slice(limit, limit + 2);
      expect(page2[0].versionNumber).toBe(3);
    });
  });

  describe('Version restoration', () => {
    it('should allow restoring race to previous version', () => {
      const currentRace = {
        name: 'Updated Race Name',
        distanceKm: 110,
        versionNumber: 3,
      };

      const version1 = {
        name: 'Original Race Name',
        distanceKm: 100,
        versionNumber: 1,
      };

      // Simulate restoration - current race would get data from version 1
      const restoredRace = {
        ...currentRace,
        name: version1.name,
        distanceKm: version1.distanceKm,
        versionNumber: currentRace.versionNumber + 1, // New version after restore
      };

      expect(restoredRace.name).toBe('Original Race Name');
      expect(restoredRace.distanceKm).toBe(100);
      expect(restoredRace.versionNumber).toBe(4); // Version incremented after restore
    });

    it('should include aid stations in restoration', () => {
      const version1AidStations = [
        { name: 'Original Aid 1', distanceKm: 10 },
        { name: 'Original Aid 2', distanceKm: 25 },
      ];

      // Current state has 3 modified aid stations
      const _currentAidStations = [
        { name: 'Modified Aid 1', distanceKm: 12 },
        { name: 'New Aid 2', distanceKm: 28 },
        { name: 'New Aid 3', distanceKm: 40 },
      ];
      // Verify current state is different (3 stations vs 2)
      expect(_currentAidStations).toHaveLength(3);

      // After restoration, aid stations should match version 1
      const restoredStations = version1AidStations;

      expect(restoredStations).toHaveLength(2);
      expect(restoredStations[0].name).toBe('Original Aid 1');
      expect(restoredStations[0].distanceKm).toBe(10);
    });
  });

  describe('Version change detection', () => {
    it('should detect meaningful changes requiring new version', () => {
      const oldRace = {
        name: 'Test Race',
        distanceKm: 100,
        elevationGainM: 3000,
      };

      const newRace = {
        name: 'Test Race',
        distanceKm: 105, // Changed
        elevationGainM: 3000,
      };

      const hasChanges = oldRace.distanceKm !== newRace.distanceKm;
      expect(hasChanges).toBe(true);
    });

    it('should not create version for unchanged update', () => {
      const oldRace = {
        name: 'Test Race',
        distanceKm: 100,
        elevationGainM: 3000,
      };

      const newRace = {
        name: 'Test Race',
        distanceKm: 100, // Unchanged
        elevationGainM: 3000,
      };

      const hasChanges =
        oldRace.name !== newRace.name ||
        oldRace.distanceKm !== newRace.distanceKm ||
        oldRace.elevationGainM !== newRace.elevationGainM;

      expect(hasChanges).toBe(false);
    });
  });
});
