FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace backend

COPY backend/src ./backend/src
RUN mkdir -p backend/uploads

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && npm start"]
