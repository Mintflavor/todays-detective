// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

// toBeInTheDocument 등 DOM 단정을 expect에 붙인다.
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 테스트마다 마운트한 것을 내린다.
//
// 이게 없으면 앞선 테스트의 컴포넌트·훅이 계속 살아 있고, window에 붙인
// popstate 리스너가 전부 응답한다. 실제로 이 파일을 빼고 돌렸을 때
// pushState 호출이 1회가 아니라 5회로 집계됐다.
afterEach(() => {
  cleanup();
});
