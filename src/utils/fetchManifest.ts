const UNPKG_BASE = "https://unpkg.com";

/**
 * Abort a manifest request that stalls. Without this a single connection that
 * is accepted but never answered would hang the CLI indefinitely — `auro cem`
 * fetches every component concurrently via `Promise.all`, so one stalled
 * request would leave the whole command spinning forever.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/** Outcome of fetching a package's Custom Elements Manifest from unpkg. */
export interface ManifestFetchResult {
  /** The npm package (or `package@tag`) that was requested. */
  target: string;
  /** Parsed custom-elements.json, or null when it could not be fetched. */
  manifest: unknown;
  /** Human-readable reason the manifest was unavailable. */
  reason?: string;
  /** True when the failure was transient (network/5xx/parse), not a genuine 404. */
  transient?: boolean;
}

/**
 * Fetch a package's Custom Elements Manifest (`custom-elements.json`) from
 * unpkg. Never throws — failures are returned as a result so callers can
 * distinguish a genuine absence (404) from a transient error. `target` may be a
 * bare package name (`@aurodesignsystem/auro-button`) or include a dist-tag or
 * version (`@aurodesignsystem/auro-button@latest`).
 */
export async function fetchManifest(
  target: string,
): Promise<ManifestFetchResult> {
  const url = `${UNPKG_BASE}/${target}/custom-elements.json`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    const message = timedOut
      ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : error instanceof Error
        ? error.message
        : String(error);
    return {
      target,
      manifest: null,
      reason: `request failed (${message})`,
      transient: true,
    };
  }

  if (response.status === 404) {
    return {
      target,
      manifest: null,
      reason: "no custom-elements.json published",
    };
  }

  if (!response.ok) {
    return {
      target,
      manifest: null,
      reason: `HTTP ${response.status}`,
      transient: true,
    };
  }

  try {
    return { target, manifest: await response.json() };
  } catch {
    return {
      target,
      manifest: null,
      reason: "custom-elements.json is not valid JSON",
      transient: true,
    };
  }
}
