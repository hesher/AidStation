/**
 * Storage Service
 *
 * Abstraction layer for file storage supporting both local filesystem
 * and S3-compatible cloud storage.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface StorageProvider {
  name: string;
  isConfigured(): boolean;
  store(key: string, content: string | Buffer): Promise<string>;
  retrieve(key: string): Promise<string | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

/**
 * Local filesystem storage provider
 * Stores files in a configurable directory
 */
export class LocalStorageProvider implements StorageProvider {
  name = 'local';
  private basePath: string;

  constructor(basePath?: string) {
    // Use configured path or default to ./data/storage
    this.basePath = basePath || process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), 'data', 'storage');
  }

  isConfigured(): boolean {
    return true; // Local storage is always available
  }

  /**
   * Ensure the directory exists for the given key
   */
  private async ensureDirectory(key: string): Promise<string> {
    const fullPath = path.join(this.basePath, key);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    return fullPath;
  }

  /**
   * Store content to a file
   * @param key - The storage key (can include subdirectories like 'gpx/user123/file.gpx')
   * @param content - The content to store
   * @returns The storage key
   */
  async store(key: string, content: string | Buffer): Promise<string> {
    const fullPath = await this.ensureDirectory(key);
    await fs.writeFile(fullPath, content, 'utf-8');
    return key;
  }

  /**
   * Retrieve content from a file
   * @param key - The storage key
   * @returns The file content or null if not found
   */
  async retrieve(key: string): Promise<string | null> {
    const fullPath = path.join(this.basePath, key);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a file
   * @param key - The storage key
   * @returns True if deleted, false if not found
   */
  async delete(key: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, key);
    try {
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a file exists
   * @param key - The storage key
   * @returns True if exists
   */
  async exists(key: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * S3-compatible storage provider
 * Can be used with AWS S3, MinIO, or other S3-compatible services
 */
export class S3StorageProvider implements StorageProvider {
  name = 's3';
  private bucket: string;
  private prefix: string;
  private region: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any; // Would be S3Client from @aws-sdk/client-s3

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    this.prefix = process.env.S3_PREFIX || 'aidstation';
    this.region = process.env.AWS_REGION || 'us-east-1';
  }

  isConfigured(): boolean {
    // Check if S3 credentials and bucket are configured
    return !!(
      this.bucket &&
      (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE)
    );
  }

  /**
   * Get the full S3 key with prefix
   */
  private getS3Key(key: string): string {
    return `${this.prefix}/${key}`;
  }

  /**
   * Initialize the S3 client lazily
   */
  private async getClient(): Promise<unknown> {
    if (!this.client) {
      // Dynamic import to avoid requiring aws-sdk when not using S3
      try {
        const { S3Client } = await import('@aws-sdk/client-s3');
        this.client = new S3Client({ region: this.region });
      } catch (error) {
        throw new Error('S3 storage requires @aws-sdk/client-s3 package');
      }
    }
    return this.client;
  }

  async store(key: string, content: string | Buffer): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('S3 storage not configured');
    }

    const client = await this.getClient();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.getS3Key(key),
      Body: typeof content === 'string' ? Buffer.from(content) : content,
      ContentType: key.endsWith('.gpx') ? 'application/gpx+xml' : 'application/octet-stream',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).send(command);
    return key;
  }

  async retrieve(key: string): Promise<string | null> {
    if (!this.isConfigured()) {
      throw new Error('S3 storage not configured');
    }

    const client = await this.getClient();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(key),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client as any).send(command);
      const stream = response.Body;
      
      // Convert stream to string
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf-8');
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('S3 storage not configured');
    }

    const client = await this.getClient();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(key),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).send(command);
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error('S3 storage not configured');
    }

    const client = await this.getClient();
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(key),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).send(command);
      return true;
    } catch {
      return false;
    }
  }
}

// Storage service singleton
let defaultProvider: StorageProvider | null = null;

/**
 * Get the configured storage provider
 * Prefers S3 if configured, otherwise uses local storage
 */
export function getStorageProvider(): StorageProvider {
  if (!defaultProvider) {
    const s3Provider = new S3StorageProvider();
    if (s3Provider.isConfigured()) {
      defaultProvider = s3Provider;
    } else {
      defaultProvider = new LocalStorageProvider();
    }
  }
  return defaultProvider;
}

/**
 * Set a custom storage provider (useful for testing)
 */
export function setStorageProvider(provider: StorageProvider): void {
  defaultProvider = provider;
}

/**
 * Generate a storage key for GPX files
 * @param userId - The user ID
 * @param activityId - The activity ID
 * @param filename - Optional original filename
 */
export function generateGpxStorageKey(
  userId: string,
  activityId: string,
  filename?: string
): string {
  const safeName = filename?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'activity';
  return `gpx/${userId}/${activityId}/${safeName}.gpx`;
}

/**
 * Generate a storage key for course GPX files
 * @param raceId - The race ID
 * @param filename - Optional original filename
 */
export function generateCourseGpxStorageKey(
  raceId: string,
  filename?: string
): string {
  const safeName = filename?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'course';
  return `courses/${raceId}/${safeName}.gpx`;
}

// Export storage functions for convenience
export const storage = {
  store: async (key: string, content: string | Buffer): Promise<string> => {
    return getStorageProvider().store(key, content);
  },
  retrieve: async (key: string): Promise<string | null> => {
    return getStorageProvider().retrieve(key);
  },
  delete: async (key: string): Promise<boolean> => {
    return getStorageProvider().delete(key);
  },
  exists: async (key: string): Promise<boolean> => {
    return getStorageProvider().exists(key);
  },
};
