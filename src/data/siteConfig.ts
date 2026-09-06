/**
 * Site configuration system.
 * Each portal has its own branding, watermark, and content tree.
 */

export interface SiteConfig {
  id: string;
  /** URL prefix (empty string for root portal) */
  basePath: string;
  /** Brand name displayed in header */
  brandName: string;
  /** Colored part of brand name */
  brandAccent: string;
  /** Subtitle under brand (empty string to hide) */
  brandSubtitle: string;
  /** Watermark text on canvas */
  watermark: string;
  /** YouTube channel/playlist URL */
  youtubeUrl: string;
}

/**
 * Which portal to show.
 * - Production: set via VITE_PORTAL env variable ('devStack' or 'chapterBreakdown')
 * - Localhost: not set — both portals available via /devStack and /chapterBreakdown paths
 */
const PORTAL_ENV = import.meta.env.VITE_PORTAL as string | undefined;
const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const sites: Record<string, SiteConfig> = {
  'tech-notes': {
    id: 'tech-notes',
    // On production with VITE_PORTAL=devStack, basePath is '' (root)
    // On localhost, basePath is '/devStack' (so both portals can coexist)
    basePath: (PORTAL_ENV === 'devStack' || (!isLocalhost && PORTAL_ENV !== 'chapterBreakdown')) ? '' : '/devStack',
    brandName: 'dev',
    brandAccent: 'Stack',
    brandSubtitle: 'by Sagar Kumar',
    watermark: 'DevStack by Sagar Kumar',
    youtubeUrl: 'https://youtube.com',
  },
  'flowchart-notes': {
    id: 'flowchart-notes',
    basePath: PORTAL_ENV === 'chapterBreakdown' ? '' : '/chapterBreakdown',
    brandName: 'Chapter',
    brandAccent: 'Breakdown',
    brandSubtitle: 'by Priyanka & Sagar',
    watermark: 'Chapter Breakdown by Priyanka & Sagar',
    youtubeUrl: 'https://youtube.com',
  },
};

/**
 * Get site config based on current URL path and VITE_PORTAL env.
 * - Production: always returns the configured portal (VITE_PORTAL)
 * - Localhost: returns based on path prefix, null for root
 */
export function getSiteFromPath(pathname: string): SiteConfig | null {
  // Production: single portal mode
  if (PORTAL_ENV === 'devStack') return sites['tech-notes'];
  if (PORTAL_ENV === 'chapterBreakdown') return sites['flowchart-notes'];

  // Localhost: path-based portal selection
  if (pathname.startsWith('/chapterBreakdown')) return sites['flowchart-notes'];
  if (pathname.startsWith('/devStack')) return sites['tech-notes'];
  return null;
}

/**
 * Strip the portal base path from a URL to get the content path.
 * e.g. "/chapterBreakdown/social-science/history" → "/social-science/history"
 */
export function getContentPath(pathname: string, site: SiteConfig): string {
  if (site.basePath && pathname.startsWith(site.basePath)) {
    const rest = pathname.slice(site.basePath.length);
    return rest || '/';
  }
  return pathname;
}
