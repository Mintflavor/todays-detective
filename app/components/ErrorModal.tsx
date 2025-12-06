import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface ErrorModalProps {
  errorMsg: string | null;
  onRetry: (() => void) | null;
  setErrorMsg: (msg: string | null) => void;
}

export default function ErrorModal({ errorMsg, onRetry, setErrorMsg }: ErrorModalProps) {
  if (!errorMsg) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 animate-fade-in">
      <div className="w-full max-w-sm bg-gray-800 border-2 border-red-600 rounded-sm p-6 text-center shadow-[0_0_20px_rgba(220,38,38,0.5)]">
        <WifiOff className="mx-auto text-red-500 mb-4 animate-pulse" size={48} />
        <h2 className="text-xl font-bold text-red-500 mb-2 uppercase tracking-widest">Signal Lost</h2>
        <p className="text-gray-300 mb-6 font-mono text-sm">{errorMsg}</p>
        <button 
          onClick={() => {
            setErrorMsg(null);
            if (onRetry) onRetry();
          }}
          className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 rounded-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2"
        >
                      <RefreshCw size={18} /> 재접속 시도        </button>
      </div>
    </div>
  );
}
