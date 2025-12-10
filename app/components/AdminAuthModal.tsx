import React, { useState, useEffect, useRef } from 'react';

interface AdminAuthModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdminAuthModal({ onSuccess, onCancel }: AdminAuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onSuccess();
      } else {
        setError(data.message || 'Access Denied.');
        setPassword('');
      }
    } catch (err) {
      setError('Connection failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 font-mono">
      <div className="bg-gray-900 border-2 border-red-900 p-8 max-w-md w-full shadow-[0_0_20px_rgba(153,27,27,0.5)]">
        <h2 className="text-2xl text-red-700 mb-6 font-bold tracking-widest text-center border-b border-red-900 pb-2 uppercase">
          Restricted Area
        </h2>
        
        <p className="text-red-500 mb-6 text-sm text-center">
          Security Clearance Level 5 Required.
          <br />
          Enter Access Code.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-black border border-red-800 text-red-500 p-3 text-center focus:outline-none focus:border-red-500 transition-colors placeholder-red-900"
            placeholder="ACCESS CODE"
            disabled={isLoading}
          />

          {error && (
            <div className="text-red-500 text-xs text-center animate-pulse">
              [ERROR: {error}]
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-red-900 text-red-900 hover:bg-red-900 hover:text-black py-2 transition-colors uppercase text-sm"
              disabled={isLoading}
            >
              Abort
            </button>
            <button
              type="submit"
              className="flex-1 bg-red-900 text-black border border-red-900 hover:bg-red-700 py-2 font-bold transition-colors uppercase text-sm"
              disabled={isLoading}
            >
              {isLoading ? 'Verifying...' : 'Authenticate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
