import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react';
import { getScenarios, ScenarioListItem, getScenarioDetail } from '../lib/api';
import { CaseData } from '../types/game';

interface LoadScenarioScreenProps {
  onLoad: (data: CaseData) => void;
  onBack: () => void;
}

export default function LoadScenarioScreen({ onLoad, onBack }: LoadScenarioScreenProps) {
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios();
  }, [page]);

  const fetchScenarios = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getScenarios(page);
      setScenarios(data);
    } catch (err) {
      setError("사건 기록을 불러올 수 없습니다. 서버 상태를 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleScenarioClick = async (id: string) => {
    setLoading(true);
    try {
      const caseData = await getScenarioDetail(id);
      onLoad(caseData);
    } catch (err) {
      setError("사건 파일을 여는 데 실패했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 flex flex-col items-center font-serif relative">
       {/* Background (Same as Intro) */}
       <div className="absolute inset-0 z-0 opacity-50" style={{backgroundImage: 'radial-gradient(#222 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>

      <header className="w-full max-w-4xl flex items-center justify-between mb-8 z-10 border-b border-gray-700 pb-4">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-amber-500 transition-colors">
          <ArrowLeft size={20} /> 뒤로가기
        </button>
        <h1 className="text-2xl font-bold text-amber-600 tracking-widest uppercase">수사 자료실</h1>
        <div className="w-20"></div> {/* Spacer */}
      </header>

      <div className="w-full max-w-4xl flex-1 z-10">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-sm mb-4 text-center">
            {error}
          </div>
        )}

        {loading && scenarios.length === 0 ? (
          <div className="text-center text-gray-500 py-20">문서고를 뒤지는 중...</div>
        ) : (
          <div className="grid gap-4">
            {scenarios.length === 0 && !loading ? (
              <div className="text-center text-gray-500 py-20">저장된 사건 기록이 없습니다.</div>
            ) : (
              scenarios.map((scenario) => (
                <button
                  key={scenario._id}
                  onClick={() => handleScenarioClick(scenario._id)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 p-6 text-left rounded-sm shadow-lg transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-800 group-hover:bg-amber-600 transition-colors"></div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-200 group-hover:text-amber-400 transition-colors flex items-center gap-2">
                      <FolderOpen size={18} /> {scenario.title}
                    </h3>
                    <span className="text-xs text-gray-500 font-mono">{new Date(scenario.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-2 pl-6">{scenario.summary}</p>
                  <div className="mt-3 pl-6">
                    <span className="text-[10px] bg-gray-900 text-gray-500 px-2 py-1 rounded border border-gray-700 uppercase tracking-wider">
                      {scenario.crime_type}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-8 flex gap-4 z-10">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-600 rounded-sm flex items-center gap-2"
        >
          <ChevronLeft size={16} /> 이전 페이지
        </button>
        <span className="flex items-center px-4 font-mono text-gray-500">Page {page}</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={scenarios.length < 10 || loading}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-600 rounded-sm flex items-center gap-2"
        >
          다음 페이지 <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
