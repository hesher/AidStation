/**
 * Storage Service Tests
 *
 * Unit tests for the storage service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  LocalStorageProvider,
  S3StorageProvider,
  getStorageProvider,
  setStorageProvider,
  generateGpxStorageKey,
  generateCourseGpxStorageKey,
  storage,
  type StorageProvider,
} from '../index';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('<gpx>test content</gpx>'),
  unlink: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LocalStorageProvider('/test/storage/path');
  });

  describe('isConfigured', () => {
    it('should always return true', () => {
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('store', () => {
    it('should create directory and write file', async () => {
      const key = 'gpx/user123/activity456/file.gpx';
      const content = '<gpx>test content</gpx>';

      const result = await provider.store(key, content);

      expect(result).toBe(key);
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('gpx/user123/activity456'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(key),
        content,
        'utf-8'
      );
    });

    it('should handle buffer content', async () => {
      const key = 'gpx/test.gpx';
      const content = Buffer.from('<gpx>test</gpx>');

      const result = await provider.store(key, content);

      expect(result).toBe(key);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('retrieve', () => {
    it('should read file content', async () => {
      const key = 'gpx/test.gpx';

      const result = await provider.retrieve(key);

      expect(result).toBe('<gpx>test content</gpx>');
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining(key),
        'utf-8'
      );
    });

    it('should return null for non-existent file', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      const result = await provider.retrieve('nonexistent.gpx');

      expect(result).toBeNull();
    });

    it('should throw for other errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValueOnce(error);

      await expect(provider.retrieve('test.gpx')).rejects.toThrow('Permission denied');
    });
  });

  describe('delete', () => {
    it('should delete file and return true', async () => {
      const result = await provider.delete('gpx/test.gpx');

      expect(result).toBe(true);
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should return false for non-existent file', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.unlink).mockRejectedValueOnce(error);

      const result = await provider.delete('nonexistent.gpx');

      expect(result).toBe(false);
    });

    it('should throw for other errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.unlink).mockRejectedValueOnce(error);

      await expect(provider.delete('test.gpx')).rejects.toThrow('Permission denied');
    });
  });

  describe('exists', () => {
    it('should return true if file exists', async () => {
      const result = await provider.exists('gpx/test.gpx');

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalled();
    });

    it('should return false if file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error('Not found'));

      const result = await provider.exists('nonexistent.gpx');

      expect(result).toBe(false);
    });
  });
});

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment for each test
    process.env = { ...originalEnv };
    delete process.env.S3_BUCKET;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_PROFILE;
    provider = new S3StorageProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isConfigured', () => {
    it('should return false when not configured', () => {
      expect(provider.isConfigured()).toBe(false);
    });

    it('should return true when bucket and access key are set', () => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      provider = new S3StorageProvider();

      expect(provider.isConfigured()).toBe(true);
    });

    it('should return true when bucket and profile are set', () => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_PROFILE = 'test-profile';
      provider = new S3StorageProvider();

      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('store', () => {
    it('should throw when not configured', async () => {
      await expect(provider.store('test.gpx', 'content')).rejects.toThrow(
        'S3 storage not configured'
      );
    });
  });

  describe('retrieve', () => {
    it('should throw when not configured', async () => {
      await expect(provider.retrieve('test.gpx')).rejects.toThrow(
        'S3 storage not configured'
      );
    });
  });

  describe('delete', () => {
    it('should throw when not configured', async () => {
      await expect(provider.delete('test.gpx')).rejects.toThrow(
        'S3 storage not configured'
      );
    });
  });

  describe('exists', () => {
    it('should throw when not configured', async () => {
      await expect(provider.exists('test.gpx')).rejects.toThrow(
        'S3 storage not configured'
      );
    });
  });
});

describe('Storage Helper Functions', () => {
  describe('generateGpxStorageKey', () => {
    it('should generate correct key with filename', () => {
      const key = generateGpxStorageKey('user123', 'activity456', 'my-run.gpx');

      expect(key).toBe('gpx/user123/activity456/my-run.gpx.gpx');
    });

    it('should generate correct key without filename', () => {
      const key = generateGpxStorageKey('user123', 'activity456');

      expect(key).toBe('gpx/user123/activity456/activity.gpx');
    });

    it('should sanitize unsafe characters in filename', () => {
      const key = generateGpxStorageKey('user123', 'activity456', 'my run with spaces!@#.gpx');

      expect(key).not.toContain(' ');
      expect(key).not.toContain('!');
      expect(key).not.toContain('@');
      expect(key).not.toContain('#');
    });
  });

  describe('generateCourseGpxStorageKey', () => {
    it('should generate correct key with filename', () => {
      const key = generateCourseGpxStorageKey('race123', 'western-states.gpx');

      expect(key).toBe('courses/race123/western-states.gpx.gpx');
    });

    it('should generate correct key without filename', () => {
      const key = generateCourseGpxStorageKey('race123');

      expect(key).toBe('courses/race123/course.gpx');
    });
  });
});

describe('Storage Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the provider
    setStorageProvider(new LocalStorageProvider('/test/path'));
  });

  describe('getStorageProvider', () => {
    it('should return a storage provider', () => {
      const provider = getStorageProvider();

      expect(provider).toBeDefined();
      expect(provider.name).toBe('local');
    });
  });

  describe('setStorageProvider', () => {
    it('should set custom provider', () => {
      const mockProvider: StorageProvider = {
        name: 'mock',
        isConfigured: () => true,
        store: vi.fn().mockResolvedValue('key'),
        retrieve: vi.fn().mockResolvedValue('content'),
        delete: vi.fn().mockResolvedValue(true),
        exists: vi.fn().mockResolvedValue(true),
      };

      setStorageProvider(mockProvider);
      const provider = getStorageProvider();

      expect(provider.name).toBe('mock');
    });
  });

  describe('storage convenience methods', () => {
    it('should delegate store to provider', async () => {
      const result = await storage.store('test.gpx', 'content');

      expect(result).toBe('test.gpx');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should delegate retrieve to provider', async () => {
      const result = await storage.retrieve('test.gpx');

      expect(result).toBe('<gpx>test content</gpx>');
    });

    it('should delegate delete to provider', async () => {
      const result = await storage.delete('test.gpx');

      expect(result).toBe(true);
    });

    it('should delegate exists to provider', async () => {
      const result = await storage.exists('test.gpx');

      expect(result).toBe(true);
    });
  });
});
