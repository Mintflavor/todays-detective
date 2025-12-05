import { useState, useEffect } from 'react';

interface UseGameTimerProps {
  initialSeconds: number;
  isActive: boolean;
  onTimeUp: () => void;
}

interface UseGameTimerReturn {
  timerSeconds: number;
  isOverTime: boolean;
  resetTimer: () => void;
}

export default function useGameTimer({ initialSeconds, isActive, onTimeUp }: UseGameTimerProps): UseGameTimerReturn {
  const [timerSeconds, setTimerSeconds] = useState<number>(initialSeconds);
  const [isOverTime, setIsOverTime] = useState<boolean>(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsOverTime(true);
            onTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, timerSeconds, onTimeUp]);

  const resetTimer = () => {
    setTimerSeconds(initialSeconds);
    setIsOverTime(false);
  };

  return { timerSeconds, isOverTime, resetTimer };
}
