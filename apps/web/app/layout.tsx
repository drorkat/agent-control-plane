import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/context';
import { LanguageProvider } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'Agent Control Plane',
    template: '%s · Agent Control Plane',
  },
  description: 'Open-source control plane for AI agents. Self-hosted.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfcfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e14' },
  ],
};

/*
 * Runs before first paint to set the theme class, so there is no flash of the
 * wrong theme on load. Respects a saved preference, then the OS setting.
 */
const themeScript = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;d?c.add('dark'):c.remove('dark');}catch(e){}})();`;

/*
 * Runs before first paint to set the document language and direction from a
 * saved preference, so RTL (Hebrew) lays out correctly with no flash of the
 * wrong direction on load. Defaults to English / LTR. Mirrors the theme script.
 */
const langScript = `(function(){try{var l=localStorage.getItem('lang');if(l!=='he'&&l!=='en')l='en';var e=document.documentElement;e.lang=l;e.dir=l==='he'?'rtl':'ltr';}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: langScript }} />
      </head>
      <body className={cn('min-h-screen bg-background font-sans text-foreground antialiased')}>
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
