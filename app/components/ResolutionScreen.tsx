import React, { useState } from 'react';
import Image from 'next/image';
import { FileText, User, ShieldAlert, RefreshCw, Eye, EyeOff, X, Skull, Microscope } from 'lucide-react';
import { Evaluation, CaseData } from '../types/game';

interface ResolutionScreenProps {
  evaluation: Evaluation;
  caseData: CaseData;
  onReset: () => void;
}

export default function ResolutionScreen({ evaluation, caseData, onReset }: ResolutionScreenProps) {
  const [showTruth, setShowTruth] = useState(evaluation.isCorrect);
  const [showBriefing, setShowBriefing] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-serif overflow-y-auto relative">
      {/* Background Texture */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/papers_background.webp"
          alt="Resolution Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gray-900/60" />
      </div>

      <div className="w-full max-w-4xl mx-auto space-y-8 animate-fade-in-up pb-10 mt-6 relative z-10">
        
        {/* Header */}
        <div className="text-center border-b border-gray-700/50 pb-6">
          <h2 className="text-2xl text-gray-200 font-bold tracking-widest uppercase shadow-black drop-shadow-md">수사 결과 보고서</h2>
          <p className="text-gray-400 text-[10px] mt-2 font-mono">CASE ID: {evaluation.caseNumber || new Date().getTime().toString().slice(-6)}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          
          {/* Left: Polaroid Result */}
          <div className="w-full md:w-1/3 bg-white p-3 shadow-2xl transform -rotate-2 relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-12 border-4 border-gray-400 rounded-t-full border-b-0 z-20"></div>
            
            {/* Image Area */}
            <div className="bg-gray-200 aspect-square mb-4 flex items-center justify-center relative overflow-hidden">
              {(showTruth || evaluation.isCorrect) && evaluation.culpritImage ? (
                <Image 
                  src={`data:image/jpeg;base64,${evaluation.culpritImage}`} 
                  alt="Culprit"
                  fill
                  className="object-cover grayscale contrast-125" // Noir style effect
                />
              ) : (
                <User size={80} className="text-gray-400" />
              )}
              
              {/* Stamp Overlay */}
              <div className={`absolute inset-0 flex items-center justify-center border-4 border-double m-2 opacity-80 mix-blend-multiply animate-stamp transform rotate-12 rounded-full
                ${evaluation.isCorrect ? 'border-red-600 text-red-600' : 'border-gray-500 text-gray-500'}`}>
                <span className="text-3xl font-black uppercase tracking-widest">
                  {evaluation.isCorrect ? '검거 성공' : '검거 실패'}
                </span>
              </div>
            </div>
            
            {/* Caption */}
            <div className="text-center font-handwriting text-gray-800 text-xl font-bold pb-2 border-b border-gray-100 min-h-[40px]">
              진범: {showTruth ? evaluation.culpritName : '???'}
            </div>
            <div className="flex justify-between px-2 pt-2 font-mono text-xs text-gray-500">
              <span>{new Date().toLocaleDateString()}</span>
              {/* Time Taken Display */}
              <span className="font-bold text-gray-700">소요 시간: {evaluation.timeTaken}</span>
            </div>
          </div>

          {/* Right: Typewriter Report (Standardized UI) */}
          <div className="w-full md:w-2/3 space-y-6">
            
            {/* AI Feedback */}
            <div className="bg-[#f0e6d2] text-gray-900 p-6 shadow-xl rounded-sm relative" style={{ fontFamily: '"Courier New", Courier, monospace' }}>
              <div className="absolute top-0 right-0 p-2 opacity-20">
                <FileText size={48} />
              </div>
              
              {/* Grade Badge */}
              <div className="absolute top-4 right-4 w-16 h-16 border-4 border-red-800 rounded-full flex items-center justify-center transform rotate-12 opacity-80">
                <span className="text-3xl font-black text-red-800">{evaluation.grade}</span>
              </div>

              <h3 className="text-sm font-bold uppercase tracking-widest text-amber-900 mb-4 border-b border-amber-900/20 pb-2">
                탐정 수사 능력 평가
              </h3>
              
              <div className="space-y-6 text-sm leading-relaxed">
                <div>
                  <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-gray-400 pl-2">종합 평가</h4>
                  <p>{evaluation.report}</p>
                </div>
                
                {/* Missed Clues / Hints Section */}
                <div>
                  <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-red-400 pl-2">조언 및 놓친 단서</h4>
                  <p className="text-gray-700 italic bg-black/5 p-2 rounded">{evaluation.advice}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {/* Briefing Button */}
              <button 
                onClick={() => setShowBriefing(true)}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-amber-500 rounded-sm flex items-center justify-center gap-2 transition-all text-sm font-bold"
              >
                <FileText size={16} /> 사건 브리핑 문서 확인
              </button>

              {/* Truth Reveal Control */}
              {!evaluation.isCorrect && (
                <button 
                  onClick={() => setShowTruth(!showTruth)}
                  className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-sm flex items-center justify-center gap-2 transition-all text-sm font-bold"
                >
                  {showTruth ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showTruth ? "사건의 전말 숨기기" : "진범 및 사건의 전말 확인하기"}
                </button>
              )}
            </div>

            {/* Truth Reveal Content */}
            {showTruth && (
              <div className="bg-black/40 border border-gray-700 p-6 rounded-sm backdrop-blur-sm animate-fade-in">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <ShieldAlert size={14} /> 사건의 전말
                </h3>
                <p className="text-gray-300 leading-relaxed font-serif text-lg">
                  {evaluation.truth}
                </p>
              </div>
            )}

          </div>
        </div>

        <div className="flex justify-center pt-8 border-t border-gray-700">
            <button 
            onClick={onReset}
            className="w-full md:w-auto bg-amber-800 hover:bg-amber-700 text-amber-100 py-4 px-12 rounded-sm font-bold shadow-lg border border-amber-600 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
          >
            <RefreshCw size={20} /> 새로운 사건 맡기
          </button>
        </div>

      </div>

      {/* Briefing Modal */}
      {showBriefing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-2xl bg-[#eaddcf] text-gray-900 rounded-sm shadow-2xl overflow-hidden relative max-h-[90vh] flex flex-col border border-gray-600">
            <div className="bg-gray-800 text-gray-200 p-4 flex justify-between items-center shrink-0 border-b border-amber-900/30">
              <h3 className="font-bold text-lg flex items-center gap-2 font-serif text-amber-500">
                <FileText size={20} /> 사건 브리핑 문서
              </h3>
              <button onClick={() => setShowBriefing(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto font-serif space-y-8 bg-[#eaddcf]">
              
              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <FileText size={14} /> 사건 개요
                </h3>
                <p className="text-sm leading-relaxed font-medium text-gray-800 border-l-4 border-amber-800/30 pl-4">
                  {caseData.summary}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <Skull size={14} /> 피해자 정보
                </h3>
                <div className="bg-black/5 p-4 rounded-sm border border-black/10 text-sm space-y-2">
                  <div className="flex justify-between border-b border-black/10 pb-1">
                    <span className="font-bold text-gray-700">이름:</span>
                    <span>{caseData.victim_info.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-black/10 pb-1">
                    <span className="font-bold text-gray-700">발생 시각:</span>
                    <span>{caseData.victim_info.incident_time}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block mb-1">피해 내용:</span>
                    <span className="block pl-2 text-gray-800">{caseData.victim_info.damage_details}</span>
                  </div>
                  <div>
                    <span className="font-bold text-gray-700 block mb-1">현장 상태:</span>
                    <span className="block pl-2 text-gray-800">{caseData.victim_info.body_condition}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <Microscope size={14} /> 초동 증거물
                </h3>
                <div className="space-y-2">
                  {caseData.evidence_list.map((item, idx) => (
                    <div key={idx} className="bg-white/50 p-3 rounded-sm border border-black/5 flex gap-3 items-start">
                      <div className="w-1 h-full bg-amber-800 rounded-full shrink-0"></div>
                      <div>
                        <div className="font-bold text-sm text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-600">{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                  <User size={14} /> 용의자 목록
                </h3>
                <div className="grid gap-3">
                  {caseData.suspects.map(s => (
                    <div key={s.id} className="flex items-center gap-4 bg-black/5 p-4 rounded-sm border border-black/10">
                      <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center shrink-0 border border-gray-400 overflow-hidden relative">
                        {s.portraitImage ? (
                          <Image 
                            src={`data:image/jpeg;base64,${s.portraitImage}`} 
                            alt={s.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <User className="text-gray-600" size={24} />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-base text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-600 italic">{s.role} | {s.personality}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
            
            <div className="p-4 bg-gray-200 border-t border-gray-300 text-center shrink-0">
              <button 
                onClick={() => setShowBriefing(false)}
                className="px-8 py-3 bg-gray-800 text-white rounded-sm font-bold text-sm hover:bg-gray-700 transition-colors uppercase tracking-widest"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
