// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

/**
 * 프론트엔드 테스트 설정.
 *
 * 의존성(vitest·jsdom·testing-library)은 이미 설치돼 있었는데 설정 파일과 테스트가
 * 없어서 `npx vitest run`이 "No test files found"로 끝났다.
 *
 * 테스트를 `app/` 밖에 두는 이유: `app/`은 App Router의 라우팅 디렉터리다.
 * 테스트 파일을 그 안에 두면 라우팅 규칙과 섞여 판단할 거리가 늘어난다.
 * 서버 쪽 `server/tests/`와 대칭을 맞춘다.
 */

import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig의 `@/*` -> 레포 루트와 같게 맞춘다.
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    // 훅과 컴포넌트가 document·window.history를 쓴다.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    restoreMocks: true,   // 스파이가 테스트 사이에 새지 않게
  },
});
