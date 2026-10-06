FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && chown -R pwuser:pwuser /app
COPY --chown=pwuser:pwuser server.mjs policy.mjs egress.mjs ./
USER pwuser
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server.mjs"]
