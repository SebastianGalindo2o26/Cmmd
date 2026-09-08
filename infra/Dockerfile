FROM node:22-alpine AS frontend-build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY tablet-app/package.json ./tablet-app/package.json
COPY kds-display/package.json ./kds-display/package.json
RUN npm ci

COPY tablet-app ./tablet-app
COPY kds-display ./kds-display
RUN npm run build:frontends

FROM nginx:1.29-alpine

COPY infra/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build /app/tablet-app/dist /usr/share/nginx/tablet
COPY --from=frontend-build /app/kds-display/dist /usr/share/nginx/kds

EXPOSE 80
