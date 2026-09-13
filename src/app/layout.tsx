import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CoreSwarm — Autonomous Verifiable Multi-Agent Coordination',
  description: 'Production reference implementation for autonomous, verifiable multi-agent coordination over Technocore.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#08090c] text-[#e8eaf0] antialiased selection:bg-[#38bdf8]/20 selection:text-[#38bdf8]">
        {children}
      </body>
    </html>
  );
}
