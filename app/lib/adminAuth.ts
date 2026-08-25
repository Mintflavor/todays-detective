// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import { API_BASE, errorMessage, readJson } from './http';

/**
 * 관리자 인증 토큰 관리.
 *
 * 이전에는 Next.js의 `/api/admin/verify`가 비밀번호만 확인하고 통과시켰고, 실제 삭제·원본
 * 조회는 브라우저가 API로 직접 호출했다 — 인증을 건너뛸 수 있었다.
 * 이제 API가 발급한 단기 토큰을 모든 관리자 요청에 실어 보낸다.
 *
 * sessionStorage에 두는 이유: 탭을 닫으면 사라진다. localStorage는 남는다.
 */
const STORAGE_KEY = 'td_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/** 관리자 요청에 붙일 헤더. 토큰이 없으면 빈 객체를 준다. */
export function adminHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { 'X-Admin-Token': token } : {};
}

export async function adminLogin(password: string): Promise<void> {
  const response = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(errorMessage(data, '인증에 실패했습니다.'));
  }

  const { token } = data as { token?: string };
  if (!token) {
    throw new Error('서버가 토큰을 반환하지 않았습니다.');
  }
  window.sessionStorage.setItem(STORAGE_KEY, token);
}

/** 저장된 토큰이 아직 유효한지 확인한다. 만료됐으면 지운다. */
export async function verifyAdminSession(): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const response = await fetch(`${API_BASE}/admin/session`, {
      headers: adminHeaders(),
    });
    if (response.ok) return true;
  } catch {
    return false;
  }
  clearAdminToken();
  return false;
}
