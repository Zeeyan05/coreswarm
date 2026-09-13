import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://coreswarm.vercel.app'),
  title: 'CoreSwarm — Autonomous Verifiable Multi-Agent Coordination',
  description: 'Agents coordinate. Evidence accumulates. Claims are verified. Disagreements are resolved. Every decision is traceable.',
  icons: {
    icon: '/logo.svg',
  },
  openGraph: {
    title: 'CoreSwarm — Autonomous Coordination Network',
    description: 'Agents coordinate. Evidence accumulates. Claims are verified. Disagreements are resolved. Every decision is traceable.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'CoreSwarm — Autonomous Coordination Network' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CoreSwarm — Autonomous Coordination Network',
    description: 'Agents coordinate. Evidence accumulates. Claims are verified. Disagreements are resolved. Every decision is traceable.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#060709] text-[#e8eaf0] antialiased selection:bg-[#7dd3fc]/20 selection:text-[#7dd3fc]">
        {children}
      </body>
    </html>
  );
}
