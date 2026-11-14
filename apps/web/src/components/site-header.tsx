'use client';

import { usePathname } from 'next/navigation';

import { pageTitleForPath } from '@/components/app-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { WebConfig } from '@/lib/config';

/** The top bar: where you are, which deployment this is, and the theme. */
export function SiteHeader({ config }: { config: WebConfig }) {
  const pathname = usePathname() ?? '/';
  const { title, section } = pageTitleForPath(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        {section ? (
          <span className="hidden text-xs uppercase tracking-wide text-muted-foreground sm:inline">
            {section} ·
          </span>
        ) : null}
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">
            {config.network} · policy v{config.policyVersion}
          </Badge>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
