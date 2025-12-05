import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadingScreenProps {
  loadingText: string;
}

export default function LoadingScreen({ loadingText }: LoadingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-gray-100 font-serif">
      <RefreshCw className="animate-spin text-amber-700 mb-6" size={48} />
      <p className="text-xl text-amber-500 animate-pulse tracking-widest">{loadingText}</p>
      <div className="mt-8 w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-amber-800 animate-loading-bar w-full origin-left"></div>
      </div>
    </div>
  );
}
