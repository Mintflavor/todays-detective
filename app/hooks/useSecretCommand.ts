'use client';

import { useEffect, useRef } from 'react';

// Define the secret command sequence: Left Arrow, Right Arrow, repeated 5 times
const SECRET_COMMAND_SEQUENCE = [
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
];

interface UseSecretCommandOptions {
  onTrigger: () => void;
  enabled?: boolean; // Only listen for command when enabled
}

export function useSecretCommand({ onTrigger, enabled = true }: UseSecretCommandOptions) {
  const sequenceBuffer = useRef<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      sequenceBuffer.current = []; // Reset buffer if disabled
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const { key } = event;

      // Add key to buffer
      sequenceBuffer.current.push(key);

      // Keep buffer length to a maximum of the sequence length
      if (sequenceBuffer.current.length > SECRET_COMMAND_SEQUENCE.length) {
        sequenceBuffer.current.shift(); // Remove oldest key
      }

      // Check if the current buffer matches the secret command sequence
      if (
        sequenceBuffer.current.length === SECRET_COMMAND_SEQUENCE.length &&
        sequenceBuffer.current.every((val, index) => val === SECRET_COMMAND_SEQUENCE[index])
      ) {
        onTrigger();
        sequenceBuffer.current = []; // Reset buffer after successful trigger
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        // Reset buffer if no input for a certain period (e.g., 2 seconds)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          sequenceBuffer.current = [];
          timeoutRef.current = null;
        }, 2000); // 2 seconds timeout to reset the sequence
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onTrigger, enabled]);
}
