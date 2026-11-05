// Configuração padrão. No Docker este arquivo é gerado a partir das variáveis de ambiente.
window.STREAMBOX = {
  jellyfin: '/api',        // Jellyfin (via proxy do mesmo domínio)
  indexer: '/strm-api',    // ponte do STRM Indexer ('' desativa)
  seerr: '/seerr',         // Seerr/Jellyseerr ('' desativa)
  title: 'StreamBox',
  whatsapp: '5593991807963',         // contato do administrador (com DDI 55) — '' esconde
  whatsappLabel: '(93) 99180-7963',
  downloads: '/downloads/files/'     // pasta pública de arquivos ('' desativa)
};
