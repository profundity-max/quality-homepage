FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8082
ENV SHARE_DATA_DIR=/app/data/wuzhi-trace
RUN addgroup --system --gid 1001 qnexus \
  && adduser --system --uid 1001 --ingroup qnexus qnexus
COPY --chown=qnexus:qnexus package.json config.json server.js ./
COPY --chown=qnexus:qnexus src ./src
COPY --chown=qnexus:qnexus public ./public
USER qnexus
EXPOSE 8082
HEALTHCHECK --interval=10s --timeout=3s --retries=12 CMD wget -qO- http://127.0.0.1:8082/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
