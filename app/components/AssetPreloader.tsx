import React from 'react';
import Image from 'next/image';

const ASSETS = [
  '/images/main_lobby_background.webp',
  '/images/confidential_background.webp',
  '/images/suspect_background.webp',
  '/images/papers_background.webp',
];

export default function AssetPreloader() {
  return (
    <div className="fixed inset-0 pointer-events-none opacity-0 z-[-1]" aria-hidden="true">
      {ASSETS.map((src) => (
        <Image
          key={src}
          src={src}
          alt="preload"
          fill // Use fill to match the usage in screens roughly
          sizes="100vw" // Match the likely sizes prop used or implied in full-screen backgrounds
          priority={true}
        />
      ))}
    </div>
  );
}
