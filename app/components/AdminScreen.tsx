'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Trash2, XCircle } from 'lucide-react';
import { getScenarios, deleteScenario, ScenarioListItem } from '../lib/api';
import ErrorModal from './ErrorModal';

interface AdminScreenProps {
  onExit: () => void;
}

export default function AdminScreen({ onExit }: AdminScreenProps) {
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scenarioToDelete, setScenarioToDelete] = useState<{ id: string, title: string } | null>(null);

  const fetchScenarios = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const fetchedScenarios = await getScenarios(1, 50);
      setScenarios(fetchedScenarios);
    } catch (error) {
      setErrorMsg("사건 목록을 불러오는데 실패했습니다: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScenarios();
  }, []);

  const handleInitiateDelete = (id: string, title: string) => {
    setScenarioToDelete({ id, title });
  };

  const handleConfirmDelete = async () => {
    if (!scenarioToDelete) return;

    setErrorMsg(null);
    try {
      await deleteScenario(scenarioToDelete.id);
      // No alert needed, just refresh
      fetchScenarios();
    } catch (error) {
      setErrorMsg("사건 기록 말소 실패: " + (error as Error).message);
    } finally {
      setScenarioToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setScenarioToDelete(null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black/95 p-6 relative">
      <div className="w-full max-w-2xl bg-[#1a1a1a] text-gray-300 rounded-sm shadow-2xl overflow-hidden relative border border-gray-800 animate-fade-in">
        {/* Header: Top Secret Style */}
        <div className="bg-red-900/20 text-red-500 p-4 border-b border-red-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={20} />
            <h2 className="font-mono font-bold text-xl tracking-widest uppercase">CLASSIFIED: ARCHIVES</h2>
          </div>
          <span className="text-xs font-mono border border-red-900/50 px-2 py-1 rounded text-red-700 bg-red-950/30">TOP SECRET</span>
        </div>

        <div className="p-6 space-y-4 font-mono min-h-[400px] flex flex-col">
          {loading ? (
            <div className="flex-grow flex items-center justify-center">
              <p className="text-center text-lg text-gray-500 animate-pulse">ACCESSING SECURE DATABASE...</p>
            </div>
          ) : scenarios.length === 0 ? (
            <div className="flex-grow flex items-center justify-center">
              <p className="text-center text-lg text-gray-600">NO RECORDS FOUND.</p>
            </div>
          ) : (
            <ul className="space-y-2 flex-grow overflow-y-auto pr-2 custom-scrollbar">
              {scenarios.map((scenario) => (
                <li
                  key={scenario._id}
                  className="bg-[#252525] p-3 rounded-sm flex items-center justify-between border border-gray-800 hover:border-gray-600 transition-colors group"
                >
                  <div className="flex-grow">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded uppercase">{scenario.crime_type}</span>
                      <p className="text-base font-bold text-gray-200 group-hover:text-white transition-colors">{scenario.title}</p>
                    </div>
                    <p className="text-xs text-gray-500 truncate max-w-[400px]">{scenario.summary}</p>
                    <p className="text-[10px] text-gray-600 mt-1 uppercase tracking-wider">Created: {new Date(scenario.created_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => handleInitiateDelete(scenario._id, scenario.title)}
                    className="ml-4 bg-red-900/20 hover:bg-red-900/80 text-red-700 hover:text-red-100 border border-red-900/30 hover:border-red-500 font-bold py-2 px-3 rounded-sm flex items-center gap-2 transition-all text-xs uppercase tracking-wider"
                    title="Permanently Delete Record"
                  >
                    <Trash2 size={14} /> EXPUNGE
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 bg-[#151515] border-t border-gray-800 flex justify-end">
          <button
            onClick={onExit}
            className="w-full md:w-auto px-6 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold py-3 rounded-sm shadow-md flex items-center justify-center gap-2 transition-colors uppercase tracking-widest text-sm"
          >
            <XCircle size={16} /> Exit Secure Area
          </button>
        </div>
      </div>
      
      {/* Custom Delete Confirmation Modal */}
      {scenarioToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-[#1a1a1a] border-2 border-red-800 w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="bg-red-900/20 p-3 rounded-full">
                <Trash2 size={32} className="text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-red-500 font-mono tracking-wider uppercase">
                기록 말소 확인
              </h3>
              <p className="text-gray-400 text-sm font-mono leading-relaxed">
                정말로 다음 사건 기록을 영구적으로 말소하시겠습니까?
                <br />
                <span className="text-white font-bold block mt-2 text-lg">"{scenarioToDelete.title}"</span>
              </p>
              <p className="text-red-900/70 text-xs font-bold uppercase tracking-widest border border-red-900/30 px-2 py-1">
                이 작업은 되돌릴 수 없습니다
              </p>
              
              <div className="flex gap-4 w-full mt-4">
                <button
                  onClick={handleCancelDelete}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-900 hover:bg-red-800 text-white py-3 rounded-sm font-mono text-sm uppercase tracking-wider transition-colors shadow-lg shadow-red-900/20"
                >
                  기록 말소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ErrorModal
        errorMsg={errorMsg}
        setErrorMsg={setErrorMsg}
        onRetry={fetchScenarios}
      />

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </div>
  );
}
