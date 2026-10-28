import { useWindowDimensions } from 'react-native';

/**
 * Responsive breakpoints. Phones and tablets keep the mobile layout; only a
 * wide window (a laptop or desktop browser) gets the sidebar dashboard layout.
 */
export const breakpoints = { tablet: 768, desktop: 1024, wide: 1440 } as const;

/** Max width of page content on desktop (wide screens center it). */
export const DESKTOP_MAX_WIDTH = 1200;
/** Max width of dialogs (forms, pickers) on desktop. */
export const DIALOG_MAX_WIDTH = 640;
/** Width of the desktop sidebar. */
export const SIDEBAR_WIDTH = 248;

export type LayoutSize = 'phone' | 'tablet' | 'desktop';

export function layoutSize(width: number): LayoutSize {
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'phone';
}

export function useLayoutSize(): LayoutSize {
  const { width } = useWindowDimensions();
  return layoutSize(width);
}

/** True when the window is wide enough for the desktop dashboard layout. */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= breakpoints.desktop;
}

/**
 * Number of card columns for a grid: 1 on phones and tablets, up to `max` on desktop.
 * Pass `minWidth` to keep columns from getting too narrow.
 */
export function useColumns(max = 3, minWidth = 300): number {
  const { width } = useWindowDimensions();
  if (width < breakpoints.desktop) return 1;
  // Content area = window minus sidebar and page padding, capped at the max width.
  const content = Math.min(width - SIDEBAR_WIDTH - 64, DESKTOP_MAX_WIDTH);
  return Math.max(1, Math.min(max, Math.floor(content / minWidth)));
}
