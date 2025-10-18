/**
 * Storage abstraction layer
 *
 * Provides a provider-agnostic interface for object storage operations.
 * Currently implements GCS, but can be extended to support S3, Azure Blob, etc.
 */

import { Storage } from '@google-cloud/storage'

export interface StorageObject {
  bucket: string
  path: string
  contentType?: string
  size?: number
}

export interface SignedUrlOptions {
  expiresInMs?: number
}

export interface ObjectInfo {
  exists: boolean
  contentType?: string
  size?: number
  signedUrl?: string
}

/**
 * Storage provider interface
 */
export interface IStorageProvider {
  /**
   * Check if an object exists and get its metadata
   */
  getObjectInfo(bucket: string, path: string): Promise<ObjectInfo>

  /**
   * Generate a signed URL for reading an object
   */
  getSignedReadUrl(bucket: string, path: string, options?: SignedUrlOptions): Promise<string>

  /**
   * Generate a signed URL for writing/uploading an object
   */
  getSignedWriteUrl(
    bucket: string,
    path: string,
    contentType: string,
    options?: SignedUrlOptions
  ): Promise<string>

  /**
   * Upload a buffer directly to storage (server-side only)
   */
  uploadBuffer(
    bucket: string,
    path: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void>

  /**
   * Check if an object exists
   */
  exists(bucket: string, path: string): Promise<boolean>

  /**
   * Download a buffer (server-side)
   */
  downloadBuffer(bucket: string, path: string): Promise<{ buffer: Buffer; contentType?: string }>
}

/**
 * GCS implementation of storage provider
 */
class GCSStorageProvider implements IStorageProvider {
  private storage: Storage

  constructor() {
    this.storage = this.createClient()
  }

  private createClient(): Storage {
    const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY

    try {
      // Method 1: Full JSON service account key
      if (keyJson) {
        const sa = JSON.parse(keyJson)
        return new Storage({
          projectId: sa.project_id,
          credentials: {
            client_email: sa.client_email,
            private_key: String(sa.private_key || '').replace(/\\n/g, '\n'),
          },
        })
      }

      // Method 2: Split credentials (better for Vercel environment variables)
      if (
        process.env.GCP_PROJECT_ID &&
        process.env.GCP_CLIENT_EMAIL &&
        process.env.GCP_PRIVATE_KEY
      ) {
        return new Storage({
          projectId: process.env.GCP_PROJECT_ID,
          credentials: {
            client_email: process.env.GCP_CLIENT_EMAIL,
            private_key: String(process.env.GCP_PRIVATE_KEY).replace(/\\n/g, '\n'),
          },
        })
      }
    } catch (err) {
      console.error(
        '[storage:gcs] Failed to parse credentials:',
        err instanceof Error ? err.message : String(err)
      )
    }

    // Fallback to default credentials (works in GCP environments)
    return new Storage()
  }

  async getObjectInfo(bucket: string, path: string): Promise<ObjectInfo> {
    try {
      const file = this.storage.bucket(bucket).file(path)
      const [exists] = await file.exists()

      if (!exists) {
        return { exists: false }
      }

      const [metadata] = await file.getMetadata().catch(() => [{} as any])
      const signedUrl = await this.getSignedReadUrl(bucket, path)

      return {
        exists: true,
        contentType: metadata?.contentType,
        size: metadata?.size ? Number(metadata.size) : undefined,
        signedUrl,
      }
    } catch (err) {
      console.error(
        '[storage:gcs] Error getting object info:',
        err instanceof Error ? err.message : String(err)
      )
      return { exists: false }
    }
  }

  async getSignedReadUrl(
    bucket: string,
    path: string,
    options?: SignedUrlOptions
  ): Promise<string> {
    const expiresInMs = options?.expiresInMs ?? 2 * 60 * 60 * 1000 // 2 hours default
    const file = this.storage.bucket(bucket).file(path)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMs,
    })
    return signedUrl
  }

  async getSignedWriteUrl(
    bucket: string,
    path: string,
    contentType: string,
    options?: SignedUrlOptions
  ): Promise<string> {
    const expiresInMs = options?.expiresInMs ?? 30 * 60 * 1000 // 30 minutes default
    const file = this.storage.bucket(bucket).file(path)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresInMs,
      contentType,
    })
    return signedUrl
  }

  async uploadBuffer(
    bucket: string,
    path: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void> {
    const file = this.storage.bucket(bucket).file(path)
    await file.save(buffer, {
      contentType,
      metadata: { contentType },
      resumable: false,
      validation: false,
    })
  }

  async exists(bucket: string, path: string): Promise<boolean> {
    try {
      const file = this.storage.bucket(bucket).file(path)
      const [exists] = await file.exists()
      return exists
    } catch {
      return false
    }
  }

  async downloadBuffer(bucket: string, path: string): Promise<{ buffer: Buffer; contentType?: string }> {
    const file = this.storage.bucket(bucket).file(path)
    const [metadata] = await file.getMetadata().catch(() => [{} as any])
    const [buffer] = await file.download()
    return { buffer, contentType: metadata?.contentType }
  }
}

// Singleton instance
let storageProvider: IStorageProvider | null = null

/**
 * Get the storage provider instance (singleton)
 *
 * Currently returns GCS provider, but can be configured to return
 * different providers based on environment variables.
 */
export function getStorageProvider(): IStorageProvider {
  if (!storageProvider) {
    // Could add logic here to select provider based on env vars
    // e.g., if (process.env.STORAGE_PROVIDER === 's3') return new S3Provider()
    storageProvider = new GCSStorageProvider()
  }
  return storageProvider
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetStorageProvider(): void {
  storageProvider = null
}
