import React from 'react';
import { BookOpen, ShieldAlert, Clock, X, CheckCircle } from 'lucide-react';

interface TutorialModalProps {
  onComplete: () => void;
}

export default function TutorialModal({ onComplete }: TutorialModalProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-6">
      <div className="w-full max-w-md bg-[#f0e6d2] text-gray-900 rounded-sm shadow-2xl overflow-hidden relative md:rotate-1 animate-fade-in">
        <div className="bg-amber-900 text-amber-100 p-4 border-b-4 border-amber-800 flex items-center gap-2">
          <BookOpen size={20} />
          <h2 className="font-serif font-bold text-xl tracking-wider">수사 수칙</h2>
        </div>

        <div className="p-6 space-y-6 font-serif">
          <div>
            <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
              <ShieldAlert size={18} /> 목표
            </h3>
            <p className="text-sm leading-relaxed text-gray-800">
              단순히 범인을 찍는 것이 아닙니다. <br/>
              <span className="font-bold border-b border-black">누가, 왜, 어떻게</span> <br/>
              세 가지를 모두 밝혀내야 최고의 등급을 받습니다.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
              <Clock size={18} /> 자원 및 시간
            </h3>
            <p className="text-sm leading-relaxed text-gray-800">
              당신에게는 <span className="font-bold text-red-700">20번의 행동력(AP)</span>만 주어집니다.<br/>
              또한 <span className="font-bold text-red-700">10분 내</span>에 해결하지 못하면, <br/>
              아무리 완벽한 추리라도 <span className="underline">최대 B등급</span>만 받게 됩니다.
            </p>
          </div>

          <div className="bg-black/5 p-4 rounded border border-black/10">
            <h3 className="font-bold text-gray-700 text-xs uppercase tracking-widest mb-2">Interrogation Tip</h3>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2 text-red-700/70">
                <X size={16} /> "너 범인이야?" (단순 부정만)
              </div>
              <div className="flex gap-2 text-green-800">
                <CheckCircle size={16} /> "8시 정전 때 어디에 있었나?"
              </div>
            </div>
          </div>

          <div className="bg-black/5 p-4 rounded border border-black/10">
            <h3 className="font-bold text-gray-700 text-xs uppercase tracking-widest mb-2">중요 안내</h3>
            <p className="text-sm leading-relaxed text-gray-800">
              이 게임의 이미지, 시나리오, 등장인물들은 모두 AI로 생성된 허구이며 현실 세계와 무관합니다.
            </p>
          </div>
        </div>

        <div className="p-4 bg-[#e6dbc5] border-t border-[#d6cbb5]">
          <button 
            onClick={onComplete}
            className="w-full bg-red-800 hover:bg-red-700 text-white font-bold py-3 rounded-sm shadow-md flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle size={18} /> 수칙 확인 완료
          </button>
        </div>
      </div>
    </div>
  );
}
