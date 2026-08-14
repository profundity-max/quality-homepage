FROM node:24-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS operator
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./tsconfig.json
RUN addgroup --system --gid 1001 qnexus \
  && adduser --system --uid 1001 --ingroup qnexus qnexus
USER qnexus
ENTRYPOINT ["npm", "run", "identity:bootstrap", "--"]

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 qnexus \
  && adduser --system --uid 1001 --ingroup qnexus qnexus
COPY --from=builder --chown=qnexus:qnexus /app/.next/standalone ./
COPY --from=builder --chown=qnexus:qnexus /app/.next/static ./.next/static
COPY --from=builder --chown=qnexus:qnexus /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder --chown=qnexus:qnexus /app/drizzle ./drizzle
COPY --from=builder --chown=qnexus:qnexus /app/scripts/start-production.mjs ./scripts/start-production.mjs
COPY --from=builder --chown=qnexus:qnexus /app/scripts/seed-production-e2e.mjs ./scripts/seed-production-e2e.mjs
COPY --from=builder --chown=qnexus:qnexus /app/scripts/postgres-migrations.mjs ./scripts/postgres-migrations.mjs
USER qnexus
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
