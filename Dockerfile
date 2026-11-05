# --- build da página ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- servidor leve (nginx) ---
FROM nginx:1.27-alpine
ENV LISTEN_PORT=8095 \
    JELLYFIN_URL=http://127.0.0.1:8096 \
    INDEXER_URL=http://127.0.0.1:8794 \
    SEERR_URL=http://127.0.0.1:5055 \
    STREAMBOX_TITLE=StreamBox \
    ADMIN_WHATSAPP= \
    ADMIN_WHATSAPP_LABEL= \
    DOWNLOADS_ENABLED=
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/15-streambox-defaults.envsh /docker-entrypoint.d/15-streambox-defaults.envsh
COPY docker/40-streambox-config.sh /docker-entrypoint.d/40-streambox-config.sh
RUN chmod +x /docker-entrypoint.d/*.sh /docker-entrypoint.d/*.envsh
COPY --from=build /app/dist /usr/share/nginx/html
