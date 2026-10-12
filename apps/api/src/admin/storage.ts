import { randomBytes } from "node:crypto";
import { HttpError } from "../errors";

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageStorage = {
  /** Stores the image and returns its public URL. */
  upload(folder: string, data: Buffer, contentType: string): Promise<string>;
  /** Best-effort removal of a URL previously returned by upload. */
  remove(publicUrl: string): Promise<void>;
};

const BUCKET = "media";

/** Supabase Storage via REST with the server-only secret key. */
export function createSupabaseStorage(supabaseUrl: string, secretKey: string): ImageStorage {
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1`;
  const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  const publicPrefix = `${base}/object/public/${BUCKET}/`;
  let bucketReady: Promise<void> | undefined;

  async function ensureBucket() {
    const response = await fetch(`${base}/bucket`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: BUCKET,
        name: BUCKET,
        public: true,
        file_size_limit: MAX_IMAGE_BYTES,
        allowed_mime_types: Object.keys(IMAGE_TYPES),
      }),
    });
    // 409/400 "already exists" is fine.
    if (!response.ok && response.status !== 409 && response.status !== 400) {
      throw new Error(`Storage bucket setup failed: ${response.status} ${await response.text()}`);
    }
  }

  return {
    async upload(folder, data, contentType) {
      bucketReady ??= ensureBucket().catch((error: unknown) => {
        bucketReady = undefined;
        throw error;
      });
      await bucketReady;
      const path = `${folder}/${Date.now()}-${randomBytes(6).toString("hex")}.${IMAGE_TYPES[contentType]}`;
      const response = await fetch(`${base}/object/${BUCKET}/${path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": contentType, "Cache-Control": "max-age=31536000" },
        body: new Uint8Array(data),
      });
      if (!response.ok) throw new HttpError(502, "STORAGE_ERROR", `Upload failed: ${response.status}`);
      return publicPrefix + path;
    },
    async remove(publicUrl) {
      if (!publicUrl.startsWith(publicPrefix)) return;
      await fetch(`${base}/object/${BUCKET}`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [publicUrl.slice(publicPrefix.length)] }),
      }).catch(() => undefined);
    },
  };
}

export const disabledStorage: ImageStorage = {
  upload: () => Promise.reject(new HttpError(503, "STORAGE_NOT_CONFIGURED", "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set")),
  remove: () => Promise.resolve(),
};
