import { useState } from 'react';
import { callGemini } from '../lib/utils';
import { CaseData, Evaluation } from '../types/game';
import { generateEvaluationPrompt, generateSuspectPrompt, CASE_GENERATION_PROMPT } from '../lib/prompts';

interface UseGeminiClientReturn {
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
  retryAction: (() => void) | null;
  setRetryAction: (action: (() => void) | null) => void;
  generateCase: () => Promise<CaseData>;
  interrogateSuspect: (suspectId: number, currentSuspectName: string, suspectRole: string, currentSuspectPersonality: string, currentSuspectSecret: string, currentSuspectRealAction: string, currentSuspectAlibiClaim: string, caseWorldSettingLocation: string, caseWorldSettingWeather: string, caseTimelineTruth: string[], history: string, userMsg: string) => Promise<string>;
  evaluateDeduction: (truth: string, culpritName: string, chosenSuspectName: string, reasoning: string, isOverTime: boolean) => Promise<Evaluation>;
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
      const resultText = await callGemini(CASE_GENERATION_PROMPT);
      const data = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
      if (data && data.suspects) {
        return data as CaseData;
      } else {
        throw new Error("Invalid Case Data Structure");
      }
    }, "사건 파일을 불러오는데 실패했습니다.", generateCase);
  };

  const interrogateSuspect = async (
    suspectId: number,
    currentSuspectName: string,
    suspectRole: string,
    currentSuspectPersonality: string,
    currentSuspectSecret: string,
    currentSuspectRealAction: string,
    currentSuspectAlibiClaim: string,
    caseWorldSettingLocation: string,
    caseWorldSettingWeather: string,
    caseTimelineTruth: string[],
    history: string,
    userMsg: string
  ): Promise<string> => {
    return withErrorHandling(async () => {
      const suspectData = {
        id: suspectId,
        name: currentSuspectName,
        role: suspectRole,
        personality: currentSuspectPersonality,
        secret: currentSuspectSecret,
        isCulprit: false, // This is temporary, the prompt itself handles if they are culprit or not.
        real_action: currentSuspectRealAction,
        alibi_claim: currentSuspectAlibiClaim,
      };
      const worldSetting = {
        location: caseWorldSettingLocation,
        weather: caseWorldSettingWeather,
      };
      const systemPrompt = generateSuspectPrompt(suspectData, worldSetting, caseTimelineTruth);
      const fullPrompt = `${systemPrompt}\n\n[이전 대화]\n${history}\n\n탐정: ${userMsg}\n용의자:`
      return await callGemini(fullPrompt);
    }, "용의자와의 통신이 불안정합니다. 다시 시도해주세요.", () => interrogateSuspect(suspectId, currentSuspectName, suspectRole, currentSuspectPersonality, currentSuspectSecret, currentSuspectRealAction, currentSuspectAlibiClaim, caseWorldSettingLocation, caseWorldSettingWeather, caseTimelineTruth, history, userMsg));
  };

  const evaluateDeduction = async (
    truth: string,
    culpritName: string,
    chosenSuspectName: string,
    reasoning: string,
    isOverTime: boolean
  ): Promise<Evaluation> => {
    return withErrorHandling(async () => {
      const evalPrompt = generateEvaluationPrompt(truth, culpritName, chosenSuspectName, reasoning, isOverTime);
      const evalResult = await callGemini(evalPrompt);
      
      const grade = evalResult.match(/[\[]GRADE[^\]]*[\]]\s*(.*)/)?.[1] || "F";
      const report = evalResult.match(/[\[]REPORT[^\]]*[\]]\s*([\s\S]*?)(?=[\[]ADVICE[^\]]*[\]]|$)?/)?.[1]?.trim() || "보고서 생성 실패";
      const advice = evalResult.match(/[\[]ADVICE[^\]]*[\]]\s*([\s\S]*)/)?.[1]?.trim() || "조언을 불러올 수 없습니다.";

      return {
        isCorrect: (culpritName === chosenSuspectName),
        report,
        advice,
        grade,
        truth: truth, // This will be filled later, currently passing true as a placeholder.
        culpritName: chosenSuspectName, // This will be filled later.
        timeTaken: "" // This will be filled later.
      };
    }, "추리 평가 중 오류가 발생했습니다.", () => evaluateDeduction(truth, culpritName, chosenSuspectName, reasoning, isOverTime));
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
