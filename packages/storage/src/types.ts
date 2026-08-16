export interface StoredObject {
  /** Storage key/path that can be used to retrieve the object later. */
  key: string;
  /** Public URL if the driver can produce one, otherwise null. */
  url: string | null;
  /** Size in bytes when known. */
  sizeBytes?: number;
  /** MIME type when known. */
  mimeType?: string;
}

export interface StorageProvider {
  readonly name: string;
  put(key: string, body: Buffer | Uint8Array, mimeType?: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Build a public URL for a key (may return null when the provider has none). */
  publicUrl(key: string): string | null;
}
