// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import React, { useState, useEffect, useRef } from 'react';
import { adminLogin } from '../lib/adminAuth';

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
      // API가 단기 토큰을 발급한다. 이후 관리자 요청은 이 토큰을 실어 보낸다.
      // (이전 방식은 비밀번호 확인만 하고 실제 호출은 무인증으로 나갔다)
      await adminLogin(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 font-mono">
      <div className="bg-gray-900 border-2 border-red-900 p-8 max-w-md w-full shadow-[0_0_20px_rgba(153,27,27,0.5)]">
                  <h2 className="text-2xl text-red-700 mb-6 font-bold tracking-widest text-center border-b border-red-900 pb-2 uppercase">
                    제한 구역
                  </h2>
                  
                  <p className="text-red-500 mb-6 text-sm text-center">
                    보안 등급 5 필요.
                    <br />
                    접근 코드를 입력하세요.
                  </p>
          
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input
                      ref={inputRef}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-black border border-red-800 text-red-500 p-3 text-center focus:outline-none focus:border-red-500 transition-colors placeholder-red-900"
                      placeholder="접근 코드"
                      disabled={isLoading}
                    />
          
                    {error && (
                      <div className="text-red-500 text-xs text-center animate-pulse">
                        [오류: {error}]
                      </div>
                    )}
          
                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 border border-red-900 text-red-900 hover:bg-red-900 hover:text-black py-2 transition-colors uppercase text-sm"
                        disabled={isLoading}
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-red-900 text-black border border-red-900 hover:bg-red-700 py-2 font-bold transition-colors uppercase text-sm"
                        disabled={isLoading}
                      >
                        {isLoading ? '인증 중...' : '인증'}
                      </button>
                    </div>        </form>
      </div>
    </div>
  );
}
