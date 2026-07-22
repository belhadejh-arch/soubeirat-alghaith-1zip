import colors from '@/constants/colors';
import { useTheme } from '@/context/ThemeContext';

/**
 * Returns the design tokens for the current color scheme.
 * Respects the in-app theme override (light / dark / system) set via
 * ThemeContext, falling back to the system scheme when mode is 'system'.
 */
export function useColors() {
  const { isDark } = useTheme();
  const palette = isDark
    ? (colors as Record<string, typeof colors.light>).dark
    : colors.light;
  return { ...palette, radius: colors.radius };
}
