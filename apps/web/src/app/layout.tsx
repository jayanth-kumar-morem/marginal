import type { Metadata } from 'next';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';

import { Providers } from '@/components/providers';
import { loadConfig } from '@/lib/config.server';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Marginal',
    template: '%s · Marginal',
  },
  description:
    'A confidential exchange that prices information goods by their measured marginal value, on NEAR.',
  applicationName: 'Marginal',
  icons: { icon: '/favicon.ico' },
};

// The configuration belongs to a deployment, not to a build, so nothing under this layout is
// prerendered: a static `/` or 404 would carry whatever accounts the build machine happened to
// have, and `next build` would refuse to run at all on a machine that has none.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once per request, on the server, from the deploy manifest (SDD §3.24).
  const config = loadConfig();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  );
}
