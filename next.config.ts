// 작성자 : 박현일
// 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
//
// Author: Hyunil Park
// Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).

import type { NextConfig } from 'next';

// 스택 내부 API 주소. 브라우저는 이 값을 보지 않는다 — same-origin /server/* 만 호출한다.
// rewrite 목적지는 빌드 시점에 routes-manifest에 구워지지만, 컨테이너명은 바뀌지 않으므로 무해하다.
// 공개 도메인처럼 자주 바뀌는 값은 빌드에 굽지 않는다.
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? 'http://todays-detective-api:8000';

const nextConfig: NextConfig = {
  // 컨테이너 배포용. .next/standalone 에 최소 런타임이 생성된다.
  output: 'standalone',

  // images.remotePatterns를 두지 않는다.
  //   초상화는 이미 512x512 JPEG q80(약 58KB)이고 Cache-Control immutable로 서빙된다.
  //   Next 이미지 최적화기를 거치면 홈서버 CPU만 쓰고 얻는 게 없다.
  //   그래서 원격 초상화 <Image>에는 unoptimized를 지정했고, 덕분에 공개 도메인을
  //   빌드 타임에 박아넣을 필요도 없어졌다 (도메인이 바뀌어도 재빌드가 필요 없다).

  async rewrites() {
    return [
      {
        // 브라우저 → /server/api/game/start → api 컨테이너 /api/game/start
        // same-origin이므로 CORS가 발생하지 않는다.
        //
        // ⚠️ 같은 경로에 Route Handler가 있으면 Next는 rewrite를 무시한다.
        //    app/api/game/ 을 삭제한 뒤에야 이 프록시가 동작한다 (커밋 0af9b78 참고).
        source: '/server/:path*',
        destination: `${API_INTERNAL_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
