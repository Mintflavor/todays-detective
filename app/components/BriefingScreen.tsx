import React from 'react';
import Image from 'next/image';
import { ShieldAlert, FileText, Skull, Microscope, User, Send } from 'lucide-react';
import { CaseData } from '../types/game';

interface BriefingScreenProps {
  caseData: CaseData;
  onStartInvestigation: () => void;
}

export default function BriefingScreen({ caseData, onStartInvestigation }: BriefingScreenProps) {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-900 p-4 font-serif overflow-y-auto relative">
      {/* Main Background */}
      <div className="fixed inset-0 z-0">
        <Image
          src="/images/confidential_background.webp"
          alt="Confidential Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gray-900/60" />
      </div>

      <div className="max-w-2xl mx-auto bg-[#eaddcf] rounded-sm shadow-2xl min-h-[90%] relative transform md:rotate-1 mt-4 mb-8 z-10">
        <div className="p-8 relative z-10">
          <div className="flex justify-between items-start mb-8 border-b-2 border-gray-800 pb-4">
            <div>
              <span className="bg-red-800 text-white text-[10px] px-2 py-1 font-bold tracking-widest uppercase">Top Secret</span>
              <h2 className="text-2xl font-bold mt-2 text-gray-900 leading-tight">{caseData.title}</h2>
            </div>
            <div className="w-12 h-12 border-2 border-dashed border-gray-400 flex items-center justify-center opacity-40 rotate-12">
              <ShieldAlert size={24} />
            </div>
          </div>

          <div className="space-y-8">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                <FileText size={14} /> Case Summary
              </h3>
              <p className="text-base leading-relaxed font-medium text-gray-800 border-l-4 border-amber-800/30 pl-4">
                {caseData.summary}
              </p>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                <Skull size={14} /> {caseData.crime_type === '살인' ? 'Autopsy Report' : 'Incident Report'}
              </h3>
              <div className="bg-black/5 p-4 rounded-sm border border-black/10 text-sm space-y-2">
                <div className="flex justify-between border-b border-black/10 pb-1">
                  <span className="font-bold text-gray-700">Name:</span>
                  <span>{caseData.victim_info.name}</span>
                </div>
                <div className="flex justify-between border-b border-black/10 pb-1">
                  <span className="font-bold text-gray-700">Time of Incident:</span>
                  <span>{caseData.victim_info.incident_time}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block mb-1">Details:</span>
                  <span className="block pl-2 text-gray-800">{caseData.victim_info.damage_details}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-700 block mb-1">Scene Condition:</span>
                  <span className="block pl-2 text-gray-800">{caseData.victim_info.body_condition}</span>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 mb-3 flex items-center gap-2">
                <Microscope size={14} /> Initial Evidence
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
                <User size={14} /> Suspect List
              </h3>
              <div className="grid gap-3">
                {caseData.suspects.map(s => (
                  <div key={s.id} className="flex items-center gap-4 bg-black/5 p-4 rounded-sm border border-black/10 hover:bg-black/10 transition-colors">
                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center shrink-0 border border-gray-400">
                      <User className="text-gray-600" size={20} />
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

          <div className="mt-12 sticky bottom-4">
              <button 
              onClick={onStartInvestigation}
              className="w-full bg-gray-900 hover:bg-black text-[#eaddcf] font-bold py-4 px-6 rounded-sm shadow-xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 border border-gray-700"
            >
              수사 시작 <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
