import { z } from "zod";
import type { FastifyRequest } from "fastify";
import { HttpError } from "../../errors";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "../../admin/storage";

export const Clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM")
  .transform((value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)));

export const clockText = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Postgres TIME(0) column value for minutes since midnight. */
export const timeColumn = (minutes: number) => new Date(Date.UTC(1970, 0, 1, 0, minutes));

export const Uuid = z.uuid();

const SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
};

/** Single image from multipart/form-data, checked by declared type and magic bytes. */
export async function readImage(request: FastifyRequest): Promise<{ data: Buffer; contentType: string }> {
  if (!request.isMultipart()) throw new HttpError(400, "VALIDATION_ERROR", "Expected multipart/form-data");
  const file = await request.file();
  if (!file) throw new HttpError(400, "VALIDATION_ERROR", "File is required");
  if (!IMAGE_TYPES[file.mimetype]) {
    throw new HttpError(415, "UNSUPPORTED_IMAGE", "Upload a JPEG, PNG or WebP image");
  }
  let data: Buffer;
  try {
    data = await file.toBuffer();
  } catch {
    throw new HttpError(413, "IMAGE_TOO_LARGE", `Image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
  }
  if (!SIGNATURES[file.mimetype](data)) {
    throw new HttpError(415, "UNSUPPORTED_IMAGE", "File content does not match its image type");
  }
  return { data, contentType: file.mimetype };
}
