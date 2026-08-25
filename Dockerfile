# 작성자 : 박현일
# 이 코드의 소유권은 작성자에게 있으며 아래 코드의 일부 또는 전체는 AI(Claude, Gemini)를 활용하여 작성되었습니다.
#
# Author: Hyunil Park
# Ownership of this code belongs to the author, and some or all of the code below has been written using AI (Claude, Gemini).
#
# Next.js 프론트엔드. output:'standalone' 산출물만 담아 이미지를 작게 유지한다.
#
# 빌드 인자가 없다는 점이 중요하다 — 공개 도메인이 빌드에 박히지 않으므로
# 도메인을 바꿔도 재빌드가 필요 없다. (원격 초상화는 unoptimized로 서빙)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# root로 돌리지 않는다.
RUN addgroup -g 10002 nodejs && adduser -u 10002 -G nodejs -S nextjs

# standalone 산출물은 필요한 node_modules만 포함한다.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
