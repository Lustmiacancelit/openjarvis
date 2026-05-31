/**
 * deep-link.ts â€” Handler for Jarvis:// deep links in the Tauri desktop app.
 *
 * The Tauri deep-link plugin routes custom-scheme URLs to the frontend.
 * This module parses those URLs and extracts structured navigation targets
 * so the UI can respond (e.g. open a research session, navigate to a connector).
 *
 * Supported URL formats:
 *   Jarvis://research/{session_id}   â†’ open a research session
 *   Jarvis://connector/{connector_id} â†’ open a connector settings panel
 */

export interface DeepLinkTarget {
  /** The resource type extracted from the URL path (e.g. "research", "connector"). */
  type: string;
  /** The resource identifier (e.g. a session ID or connector name). */
  id: string;
}

/**
 * Parse an `Jarvis://` deep link URL into a structured target.
 *
 * @param url - The raw deep link URL string (e.g. `Jarvis://research/abc123`).
 * @returns A {@link DeepLinkTarget} if the URL is valid, or `null` if it
 *   cannot be parsed or does not use the `Jarvis:` scheme.
 *
 * @example
 * parseDeepLink("Jarvis://research/abc123");
 * // â†’ { type: "research", id: "abc123" }
 *
 * parseDeepLink("Jarvis://connector/gmail");
 * // â†’ { type: "connector", id: "gmail" }
 *
 * parseDeepLink("https://example.com");
 * // â†’ null
 */
export function parseDeepLink(url: string): DeepLinkTarget | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "Jarvis:") return null;

    // The URL constructor treats "Jarvis://research/abc123" such that
    // parsed.hostname === "research" and parsed.pathname === "/abc123".
    // We also handle the double-slash form where both end up in pathname.
    const parts = parsed.pathname.replace(/^\/\//, "").split("/").filter(Boolean);

    // If the path part is empty but hostname is set, use hostname as type
    // and the first path segment as id.
    if (parsed.hostname && parts.length >= 1) {
      return { type: parsed.hostname, id: parts[0] };
    }

    if (parts.length >= 2) {
      return { type: parts[0], id: parts[1] };
    }

    return null;
  } catch {
    return null;
  }
}
