import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Selene\'s Space  — Solar System Explorer',
  description: 'Explore the Sun, eight planets, and Earth’s Moon in an interactive WebGL solar system.',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
