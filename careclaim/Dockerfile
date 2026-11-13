FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/package.json
RUN npm ci
COPY client ./client
COPY shared ./shared
COPY vite.config.js ./
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY server/package.json ./server/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./server/src
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
