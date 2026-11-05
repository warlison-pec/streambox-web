#!/bin/sh
# Gera /config.js a partir das variáveis de ambiente (sem recompilar a página).
cat > /usr/share/nginx/html/config.js <<JS
window.STREAMBOX = {
  jellyfin: '/api',
  indexer: '${INDEXER_URL:+/strm-api}',
  seerr: '${SEERR_URL:+/seerr}',
  title: '${STREAMBOX_TITLE:-StreamBox}',
  whatsapp: '${ADMIN_WHATSAPP}',
  whatsappLabel: '${ADMIN_WHATSAPP_LABEL}',
  downloads: '${DOWNLOADS_ENABLED:+/downloads/files/}'
};
JS
