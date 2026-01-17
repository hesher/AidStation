import type { Metadata } from 'next';
import Script from 'next/script';
import { NavBar } from '@/components/NavBar';
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
      <head>
        {/* Unregister any stale service workers from previous app configurations */}
        <Script id="sw-cleanup" strategy="beforeInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for (let registration of registrations) {
                  registration.unregister();
                  console.log('Unregistered stale service worker:', registration.scope);
                }
              });
            }
          `}
        </Script>
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <NavBar />
        <div id="main-content">
          {children}
        </div>
      </body>
    </html>
  );
}
