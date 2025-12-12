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
