import React, { useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { Volume2, VolumeX, Timer, Clock, AlertTriangle, Notebook, User, Send } from 'lucide-react';
import { CaseData, ChatLogs } from '../types/game';
import { formatTime } from '../lib/utils';

interface InvestigationScreenProps {
  caseData: CaseData;
  currentSuspectId: number;
  setCurrentSuspectId: (id: number) => void;
  chatLogs: ChatLogs;
  actionPoints: number;
  timerSeconds: number;
  isOverTime: boolean;
  showTimeOverModal: boolean;
  closeTimeOverModal: () => void;
  userInput: string;
  handleInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleSendMessage: () => void;
  inputPlaceholder: string;
  isTyping: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  onGoToBriefing: () => void;
  onGoToDeduction: () => void;
}

export default function InvestigationScreen({
  caseData,
  currentSuspectId,
  setCurrentSuspectId,
  chatLogs,
  actionPoints,
  timerSeconds,
  isOverTime,
  showTimeOverModal,
  closeTimeOverModal,
  userInput,
  handleInputChange,
  handleKeyDown,
  handleSendMessage,
  inputPlaceholder,
  isTyping,
  isMuted,
  toggleMute,
  onGoToBriefing,
  onGoToDeduction
}: InvestigationScreenProps) {
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const currentSuspect = caseData.suspects.find(s => s.id === currentSuspectId);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLogs, currentSuspectId, isTyping]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
      {/* Time Over Modal Overlay */}
      {showTimeOverModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fade-in">
            <div className="w-full max-w-md bg-[#dfd3c3] text-gray-900 rounded-sm shadow-2xl overflow-hidden border-4 border-double border-red-900">
              <div className="bg-red-900 text-red-100 p-3 flex items-center gap-2">
                <AlertTriangle size={20} />
                <h2 className="font-serif font-bold text-lg tracking-wider uppercase">URGENT TELEGRAM</h2>
              </div>
              <div className="p-6 font-mono text-sm leading-relaxed text-gray-800 space-y-4">
                <p>
                  <span className="font-bold">TO:</span> DETECTIVE<br/>
                  <span className="font-bold">FROM:</span> HEADQUARTERS
                </p>
                <div className="border-t border-b border-gray-400 py-4 my-2 uppercase font-bold text-center tracking-widest text-red-800">
                  -- STOP -- <br/>
                  GOLDEN TIME EXPIRED. <br/>
                  -- STOP --
                </div>
                <p>
                  POLICE FORCE ARRIVED. INVESTIGATION CONTINUES BUT MAX GRADE CAPPED AT 'B'.
                </p>
              </div>
              <div className="p-4 bg-[#cfc3b3]">
                <button 
                  onClick={closeTimeOverModal}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-sm uppercase tracking-wider"
                >
                  Acknowledge
                </button>
              </div>
            </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="bg-gray-900 p-3 border-b border-gray-800 shadow-md flex justify-between items-center z-20 shrink-0">
        <div className="flex flex-col">
          <h2 className="font-serif font-bold text-amber-600 text-base truncate max-w-[150px]">{caseData.title}</h2>
          <button onClick={onGoToBriefing} className="text-[10px] text-gray-500 hover:text-gray-300 underline text-left">서류 다시보기</button>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Volume Control */}
          <button onClick={toggleMute} className="p-1.5 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors">
            {isMuted ? <VolumeX size={14} className="text-gray-400" /> : <Volume2 size={14} className="text-amber-500" />}
          </button>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono border ${isOverTime ? 'bg-red-900 text-red-200 border-red-700 animate-pulse' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
            <Timer size={12} />
            <span>{formatTime(timerSeconds)}</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold font-mono transition-colors ${actionPoints <= 5 ? 'bg-red-900/50 text-red-400 border border-red-800 animate-pulse' : 'bg-gray-800 text-amber-500 border border-amber-900'}`}>
            <Clock size={12} /> 
            <span>{actionPoints}</span>
          </div>
          <button 
            onClick={onGoToDeduction}
            className="bg-red-800 hover:bg-red-700 text-white text-[10px] px-3 py-2 rounded-sm font-bold tracking-wider transition-colors shadow-sm"
          >
            범인 지목
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#111827] flex flex-col items-center">
        <div className="w-full max-w-2xl flex flex-col space-y-4">
          {chatLogs[currentSuspectId].map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' || msg.role === 'note' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'} animate-fade-in`}>
              {msg.role === 'system' ? (
                <div className="bg-gray-800/50 text-gray-400 text-xs px-4 py-1.5 rounded-full border border-gray-700/50 my-2 text-center max-w-[90%] whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>
              ) : (
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg relative ${
                  msg.role === 'user' 
                    ? 'bg-amber-800 text-white rounded-tr-sm' 
                    : msg.role === 'note'
                      ? 'bg-gray-700 text-gray-300 rounded-tr-sm border border-gray-600 italic'
                      : 'bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700'
                }`}>
                  {msg.role !== 'user' && msg.role !== 'note' && currentSuspect && <div className="text-[10px] text-gray-500 mb-1 font-bold opacity-75">{currentSuspect.name}</div>}
                  {msg.role === 'note' && <div className="text-[10px] text-gray-400 mb-1 font-bold opacity-75 flex items-center gap-1"><Notebook size={10} /> 수사 메모</div>}
                  {msg.text}
                </div>
              )}
            </div>
          ))}
          {isTyping && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-gray-800 text-gray-500 rounded-2xl rounded-tl-sm px-4 py-3 text-xs border border-gray-700">
                ...
                </div>
              </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Bottom Area */}
      <div className="bg-gray-900 border-t border-gray-800 z-20 shrink-0 pb-safe">
        <div className="w-full max-w-2xl mx-auto">
          {/* Tabs */}
          <div className="flex divide-x divide-gray-800 border-b border-gray-800 overflow-x-auto">
            {/* Note Tab (ID 0) */}
            <button
              onClick={() => setCurrentSuspectId(0)}
              className={`flex-1 py-3 px-2 text-sm font-medium transition-all relative min-w-[60px] ${
                currentSuspectId === 0 
                  ? 'bg-gray-800 text-gray-300' 
                  : 'bg-gray-900 text-gray-600 hover:bg-gray-800'
              }`}
            >
              <div className="flex flex-col items-center gap-1.5">
                <Notebook size={20} className={currentSuspectId === 0 ? "text-gray-300" : ""} />
                <span className="text-xs truncate max-w-full">나(Memo)</span>
              </div>
              {currentSuspectId === 0 && <div className="absolute top-0 left-0 w-full h-0.5 bg-gray-500"></div>}
            </button>

            {/* Suspect Tabs */}
            {caseData.suspects.map(s => (
              <button
                key={s.id}
                onClick={() => setCurrentSuspectId(s.id)}
                className={`flex-1 py-3 px-2 text-sm font-medium transition-all relative min-w-[80px] ${
                  currentSuspectId === s.id 
                    ? 'bg-gray-800 text-amber-500' 
                    : 'bg-gray-900 text-gray-500 hover:bg-gray-800'
                }`}
              >
                <div className="flex flex-col items-center gap-1.5">
                  <User size={20} className={currentSuspectId === s.id ? "fill-amber-500/20" : ""} />
                  <span className="text-xs truncate max-w-full">{s.name}</span>
                </div>
                {currentSuspectId === s.id && <div className="absolute top-0 left-0 w-full h-0.5 bg-amber-600"></div>}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-3 pb-6 flex gap-2 bg-gray-900">
            <input
              type="text"
              value={userInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={inputPlaceholder}
              disabled={currentSuspectId !== 0 && (actionPoints <= 0 || isTyping)}
              className="flex-1 bg-gray-950 border border-gray-700 rounded-md px-4 py-3 text-white focus:outline-none focus:border-amber-700 placeholder-gray-600 font-sans text-sm transition-all"
            />
            <button 
              onClick={handleSendMessage}
              disabled={currentSuspectId !== 0 && (actionPoints <= 0 || isTyping || !userInput.trim())}
              className={`p-3 rounded-md transition-colors shadow-lg ${
                currentSuspectId === 0 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                  : 'bg-amber-800 hover:bg-amber-700 disabled:bg-gray-800 disabled:text-gray-600 text-amber-100'
              }`}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
