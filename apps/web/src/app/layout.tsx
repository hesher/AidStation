import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AidStation - Race Planning for Endurance Athletes',
  description: 'AI-powered race planning and strategy for ultra-marathons and endurance events',
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
