import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Halo Spiro Ribbons Studio',
  description: 'A builder-facing studio for spiro ribbon artwork, image processing, and animation experiments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
