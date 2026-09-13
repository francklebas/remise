export interface RichLinkAttributes {
  url: string;
  domain: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

export function isWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function fallbackRichLinkMetadata(url: string): RichLinkAttributes {
  const parsed = new URL(url);
  const domain = parsed.hostname;
  return { url, domain, title: "", description: "", image: "", siteName: domain };
}

/**
 * Resolution seam for a future trusted service. Generic browser fetching is
 * intentionally avoided: CORS is unreliable and this app has no safe proxy.
 */
export async function resolveLinkMetadata(url: string): Promise<RichLinkAttributes> {
  return fallbackRichLinkMetadata(url);
}
