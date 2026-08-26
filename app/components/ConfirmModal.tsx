// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 되돌릴 수 없는 행동을 확인받는다.
 *
 * 뒤로가기 키 한 번으로 진행 중인 수사(20분·용의자별 20회)를 날리지 않기 위해 쓴다.
 * **취소가 기본이다** — 취소 버튼을 먼저 두고 강조한다.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 animate-fade-in">
      <div className="w-full max-w-sm bg-[#f0e6d2] text-gray-900 rounded-sm shadow-2xl overflow-hidden">
        <div className="bg-red-900 text-red-100 p-4 border-b-4 border-red-800 flex items-center gap-2">
          <AlertTriangle size={20} />
          <h2 className="font-serif font-bold text-lg tracking-wider">{title}</h2>
        </div>

        <p className="p-6 font-serif text-sm leading-relaxed word-keep-all text-gray-800">
          {message}
        </p>

        <div className="p-4 bg-[#e6dbc5] border-t border-[#d6cbb5] flex gap-2">
          <button
            onClick={onCancel}
            className="flex-[2] min-h-[48px] bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-sm shadow-md transition-colors flex items-center justify-center gap-2"
          >
            <X size={16} /> 계속하기
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 min-h-[48px] bg-transparent hover:bg-black/5 text-red-800 font-bold rounded-sm border border-red-800/40 transition-colors text-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
