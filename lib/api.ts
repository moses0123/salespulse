import { NextResponse } from "next/server";

/**
 * Photo attachments are stored inline as base64 data URLs directly on the
 * document (no object storage configured for this deployment). Cap them at
 * ~4MB of base64 text (~3MB of actual image) so a handful of attachments
 * can't blow past MongoDB's 16MB document size limit or bloat the DB.
 */
export const MAX_PHOTO_BASE64_LENGTH = 4 * 1024 * 1024;

export function isValidPhotoDataUrl(value: string): boolean {
  return value.startsWith("data:image/") && value.length <= MAX_PHOTO_BASE64_LENGTH;
}

/** Standard success envelope for API responses. */
export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

/** Standard error envelope for API responses. */
export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { success: false, error: message, details },
    { status }
  );
}

/** Wrap a route handler with a try/catch that formats thrown errors uniformly. */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err: any) {
      console.error("[api-error]", err);
      if (err?.name === "ValidationError") {
        return fail("Validation failed", 422, err.errors);
      }
      if (err?.code === 11000) {
        return fail("A record with this value already exists", 409, err.keyValue);
      }
      return fail(err?.message || "Internal server error", 500);
    }
  };
}
