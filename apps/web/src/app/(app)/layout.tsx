import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/app-sidebar';
import { ProfileBanner } from '@/components/profile-banner';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { loadConfig } from '@/lib/config.server';

export default function AppLayout({ children }: { children: ReactNode }) {
  const config = loadConfig();
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 68)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader config={config} />
        <div className="flex flex-1 flex-col">
          <ProfileBanner config={config} />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
