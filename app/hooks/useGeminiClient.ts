import { useState } from 'react';
import { callGemini } from '../lib/utils';
import { CaseData, Evaluation } from '../types/game';

interface UseGeminiClientReturn {
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
  retryAction: (() => void) | null;
  setRetryAction: (action: (() => void) | null) => void;
  generateCase: () => Promise<CaseData>;
  interrogateSuspect: (scenarioId: string, suspectId: number, history: string, userMsg: string) => Promise<string>;
  evaluateDeduction: (scenarioId: string, culpritName: string, reasoning: string, isOverTime: boolean) => Promise<Evaluation>;
}

export default function useGeminiClient(): UseGeminiClientReturn {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);

  const withErrorHandling = async <T>(action: () => Promise<T>, failMessage: string, retryCallback: () => void): Promise<T> => {
    try {
      setErrorMsg(null);
      setRetryAction(null);
      return await action();
    } catch (e) {
      console.error("Gemini Client Error:", e);
      if (e instanceof Error) {
         console.error("Error Message:", e.message);
         console.error("Stack Trace:", e.stack);
      }
      setErrorMsg(failMessage);
      setRetryAction(() => retryCallback);
      throw e; // Re-throw to propagate the error to the caller
    }
  };

  const generateCase = async (): Promise<CaseData> => {
    return withErrorHandling(async () => {
      const response = await fetch('/api/game/start', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate case");
      }

      if (data && data.caseData) {
        // Attach scenarioId to caseData
        return {
          ...data.caseData,
          scenarioId: data.scenarioId
        } as CaseData;
      } else {
        throw new Error("Invalid Case Data Structure");
      }
    }, "사건 파일을 불러오는데 실패했습니다.", generateCase);
  };

  const interrogateSuspect = async (
    scenarioId: string,
    suspectId: number,
    history: string,
    userMsg: string
  ): Promise<string> => {
    return withErrorHandling(async () => {
      const response = await fetch('/api/game/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId,
          suspectId,
          message: userMsg,
          history
        }),
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to interrogate suspect");
      }

      return data.reply;
    }, "용의자와의 통신이 불안정합니다. 다시 시도해주세요.", () => interrogateSuspect(scenarioId, suspectId, history, userMsg));
  };

  const evaluateDeduction = async (
    scenarioId: string,
    culpritName: string, // Player's choice
    reasoning: string,
    isOverTime: boolean
  ): Promise<Evaluation> => {
    return withErrorHandling(async () => {
      const response = await fetch('/api/game/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId,
          deductionData: {
            culpritName,
            reasoning,
            isOverTime
          }
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to evaluate deduction");
      }

      return {
        isCorrect: data.isCorrect,
        report: data.report,
        advice: data.advice,
        grade: data.grade,
        truth: data.truth,
        culpritName: data.culpritName,
        timeTaken: "" 
      };
    }, "추리 평가 중 오류가 발생했습니다.", () => evaluateDeduction(scenarioId, culpritName, reasoning, isOverTime));
  };

  return {
    errorMsg,
    setErrorMsg,
    retryAction,
    setRetryAction,
    generateCase,
    interrogateSuspect,
    evaluateDeduction
  };
}
