export const getRandomPlaceholder = (): string => {
  const prompts = [
    "알리바이를 물어보세요...",
    "피해자와의 관계는 어땠나요?",
    "8시 정전 때 무엇을 하고 있었나요?",
    "현장에 있던 깨진 물건에 대해 아나요?",
    "왜 거짓말을 하는지 추궁해보세요...",
    "마지막으로 피해자를 본 게 언제인가요?"
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
};

export const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Fisher-Yates 셔플. 원본을 건드리지 않는다.
 *
 * `sort(() => Math.random() - 0.5)`는 비교 함수가 일관되지 않아 분포가 치우친다.
 * 용의자 순서는 범인의 위치를 가리는 유일한 장치이므로 균등해야 한다 —
 * 생성 프롬프트의 스키마 예시가 `id: 2`에 `isCulprit: true`를 박아둔 탓에
 * 실제 데이터의 범인이 전부 id 2였다 (§14).
 */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
