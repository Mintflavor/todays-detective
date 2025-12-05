import React, { ChangeEvent } from 'react';
import { AlertCircle, User, ChevronLeft } from 'lucide-react';
import { CaseData, DeductionInput } from '../types/game';

interface DeductionScreenProps {
  caseData: CaseData;
  deductionInput: DeductionInput;
  setDeductionInput: (input: DeductionInput | ((prev: DeductionInput) => DeductionInput)) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function DeductionScreen({ 
  caseData, 
  deductionInput, 
  setDeductionInput, 
  onSubmit, 
  onBack 
}: DeductionScreenProps) {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 flex items-center justify-center font-serif overflow-y-auto">
      <div className="w-full max-w-lg bg-gray-800 rounded-sm p-6 shadow-2xl border border-gray-700 relative my-auto">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-900 via-red-600 to-red-900"></div>
        
        <div className="text-center mb-6">
          <AlertCircle className="mx-auto text-red-500 mb-4" size={40} />
          <h2 className="text-2xl font-bold text-white tracking-widest uppercase">
            Final Deduction
          </h2>
          <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-wide">Select the culprit & Reveal the truth</p>
        </div>
        
        <div className="mb-6 space-y-4">
          <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">The Culprit</label>
          <div className="grid grid-cols-3 gap-2">
            {caseData.suspects.map(s => (
              <button
                key={s.id}
                onClick={() => setDeductionInput(prev => ({ ...prev, culpritId: s.id }))}
                className={`p-2 py-4 rounded-sm border-2 text-center transition-all group ${
                  deductionInput.culpritId === s.id
                    ? 'border-red-600 bg-red-900/20 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.3)]'
                    : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-500'
                }`}
              >
                <div className="w-full aspect-square bg-gray-800 mb-2 rounded-full overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
                  <User size={24} />
                </div>
                <div className="font-bold text-xs truncate">{s.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <label className="block text-gray-400 text-xs font-sans uppercase tracking-wider font-bold">Motive & Trick</label>
          <textarea
            value={deductionInput.reasoning}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDeductionInput(prev => ({ ...prev, reasoning: e.target.value }))}
            placeholder="범행 동기와 사용된 트릭을 상세히 서술하시오..."
            className="w-full h-32 bg-gray-900 border border-gray-700 rounded-sm p-3 text-white focus:border-red-600 focus:outline-none resize-none font-sans leading-relaxed text-xs placeholder-gray-600"
          />
        </div>

        <div className="flex gap-3">
          <button 
            onClick={onBack}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-4 rounded-sm transition-colors text-xs flex items-center justify-center gap-1"
          >
            <ChevronLeft size={14} /> 수사 계속하기
          </button>
          <button 
            onClick={onSubmit}
            disabled={!deductionInput.culpritId || !deductionInput.reasoning}
            className="flex-[2] bg-red-800 hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-4 rounded-sm shadow-xl text-sm tracking-widest transition-all"
          >
            제출 (SUBMIT)
          </button>
        </div>
      </div>
    </div>
  );
}
