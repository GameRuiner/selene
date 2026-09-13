import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Moonwalk — Solar System Explorer',
  description: 'Explore the Sun, eight planets, and Earth’s Moon in an interactive WebGL solar system.',
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
