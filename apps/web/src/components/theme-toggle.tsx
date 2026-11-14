'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { IconMoon, IconSun, IconDeviceLaptop } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { nextTheme, themeLabel } from '@/lib/theme';

/**
 * One button that cycles light → dark → system.
 *
 * Rendering only: the cycle and the label are `@/lib/theme`, which is covered. The vendored
 * `ui/theme-toggle` is an inline radio group with preview cards, built for a settings page; in the
 * header it rendered above the viewport and was clipped, and vendored UI is not ours to patch.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The server does not know the theme, so render the same thing both sides until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? theme : undefined;
  const Icon = current === 'dark' ? IconMoon : current === 'system' ? IconDeviceLaptop : IconSun;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={themeLabel(current)}
      title={themeLabel(current)}
      onClick={() => setTheme(nextTheme(current))}
    >
      <Icon className="size-4" />
    </Button>
  );
}
