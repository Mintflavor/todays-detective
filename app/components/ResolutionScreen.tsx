import React from 'react';
import { FileText, User, ShieldAlert, RefreshCw } from 'lucide-react';
import { Evaluation } from '../types/game';

interface ResolutionScreenProps {
  evaluation: Evaluation;
  onReset: () => void;
}

export default function ResolutionScreen({ evaluation, onReset }: ResolutionScreenProps) {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-serif overflow-y-auto relative">
      {/* Background Texture (Dark Desk) */}
      <div className="absolute inset-0 opacity-40 pointer-events-none" 
            style={{backgroundImage: 'radial-gradient(#222 1px, transparent 1px)', backgroundSize: '30px 30px'}}></div>

      <div className="w-full max-w-4xl mx-auto space-y-8 animate-fade-in-up pb-10 mt-6 relative z-10">
        
        {/* Header */}
        <div className="text-center border-b border-gray-700 pb-6">
          <h2 className="text-2xl text-gray-200 font-bold tracking-widest uppercase">Investigation Report</h2>
          <p className="text-gray-500 text-[10px] mt-2 font-mono">CASE ID: {new Date().getTime().toString().slice(-6)}</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-start">
          
          {/* Left: Polaroid Result */}
          <div className="w-full md:w-1/3 bg-white p-3 shadow-2xl transform -rotate-2 relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-12 border-4 border-gray-400 rounded-t-full border-b-0 z-20"></div>
            
            {/* Image Area */}
            <div className="bg-gray-200 aspect-square mb-4 flex items-center justify-center relative overflow-hidden">
              <User size={80} className="text-gray-400" />
              
              {/* Stamp Overlay */}
              <div className={`absolute inset-0 flex items-center justify-center border-4 border-double m-2 opacity-80 mix-blend-multiply animate-stamp transform rotate-12
                ${evaluation.isCorrect ? 'border-red-600 text-red-600' : 'border-gray-500 text-gray-500'}`}>
                <span className="text-3xl font-black uppercase tracking-widest">
                  {evaluation.isCorrect ? 'ARRESTED' : 'ESCAPED'}
                </span>
              </div>
            </div>
            
            {/* Caption */}
            <div className="text-center font-handwriting text-gray-800 text-xl font-bold pb-2 border-b border-gray-100">
              Suspect: {evaluation.culpritName}
            </div>
            <div className="flex justify-between px-2 pt-2 font-mono text-xs text-gray-500">
              <span>{new Date().toLocaleDateString()}</span>
              {/* Time Taken Display */}
              <span className="font-bold text-gray-700">Time: {evaluation.timeTaken}</span>
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
                Detective Performance Eval.
              </h3>
              
              <div className="space-y-6 text-sm leading-relaxed">
                <div>
                  <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-gray-400 pl-2">SUMMARY</h4>
                  <p>{evaluation.report}</p>
                </div>
                
                {/* Missed Clues / Hints Section */}
                <div>
                  <h4 className="font-bold text-gray-700 mb-1 border-l-4 border-red-400 pl-2">MISSED CLUES & ADVICE</h4>
                  <p className="text-gray-700 italic bg-black/5 p-2 rounded">{evaluation.advice}</p>
                </div>
              </div>
            </div>

            {/* Truth Reveal */}
            <div className="bg-black/40 border border-gray-700 p-6 rounded-sm backdrop-blur-sm">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <ShieldAlert size={14} /> The Whole Truth
              </h3>
              <p className="text-gray-300 leading-relaxed font-serif text-lg">
                {evaluation.truth}
              </p>
            </div>

          </div>
        </div>

        <div className="flex justify-center pt-8 border-t border-gray-700">
            <button 
            onClick={onReset}
            className="w-full md:w-auto bg-amber-800 hover:bg-amber-700 text-amber-100 py-4 px-12 rounded-sm font-bold shadow-lg border border-amber-600 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
          >
            <RefreshCw size={20} /> Close Case & Start New
          </button>
        </div>

      </div>
    </div>
  );
}
