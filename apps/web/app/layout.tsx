import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Control Plane',
  description: 'Open-source control plane for AI agents. Self-hosted.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
