'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBuildingStore,
  IconCertificate,
  IconCpu,
  IconFileUpload,
  IconListDetails,
  IconShieldCheck,
} from '@tabler/icons-react';

import { BrandLogo } from '@/components/brand-logo';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = { label: string; items: NavItem[] };

/**
 * Six destinations, which are the demo surfaces (SDD §1.6, §3.23). `/agents` is deliberately absent:
 * M1 cut it, and D5's one action — approving a parked job — is a button on `/jobs/[id]`.
 */
const NAV: NavSection[] = [
  {
    label: 'Market',
    items: [
      { title: 'Listings', href: '/listings', icon: IconBuildingStore },
      { title: 'Sell', href: '/sell', icon: IconFileUpload },
      { title: 'Jobs', href: '/jobs', icon: IconListDetails },
    ],
  },
  {
    label: 'Proof',
    items: [
      { title: 'Verify', href: '/verify', icon: IconCertificate },
      { title: 'Rooms', href: '/rooms', icon: IconCpu },
    ],
  },
  {
    label: 'Oversight',
    items: [{ title: 'Compliance', href: '/compliance', icon: IconShieldCheck }],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A label for the current path, so the header needs no title prop. The singular routes are listed
 * here too: `/listing/3` belongs to Listings, and `/appraise/3` is its own step.
 */
export function pageTitleForPath(pathname: string): { title: string; section?: string } {
  for (const group of NAV) {
    for (const item of group.items) {
      if (isActive(pathname, item.href)) return { title: item.title, section: group.label };
    }
  }
  if (pathname.startsWith('/listing/')) return { title: 'Listing', section: 'Market' };
  if (pathname.startsWith('/appraise/')) return { title: 'Appraise', section: 'Market' };
  return { title: 'Marginal' };
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname() ?? '';
  return (
    <Sidebar collapsible="offcanvas" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-12 data-[slot=sidebar-menu-button]:p-1.5! hover:bg-transparent active:bg-transparent"
            >
              <Link href="/listings" aria-label="Marginal">
                <BrandLogo />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link href={item.href}>
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
