# StreamBox Web

Player web do StreamBox (mesmo visual preto e laranja do app), feito em **Svelte 5 + TypeScript**.
Os usuários entram com a conta do **Jellyfin** e o Jellyfin fica escondido atrás do domínio.

## O que tem

- Login com usuário e senha ou **Conexão rápida** (Quick Connect)
- Início com destaque em carrossel, Continuar assistindo, Próximos episódios e "Adicionados" por biblioteca
- Todas as bibliotecas, coleções, detalhes de filmes e séries com temporadas
- Player com:
  - legendas (inclusive busca e download online) e personalização de tamanho, cor e fundo
  - troca de áudio e de qualidade (HLS)
  - atalhos de teclado e progresso salvo no Jellyfin
- **TV ao vivo**:
  - canais do Jellyfin
  - uma **lista M3U/EPG própria**, repassada pelo STRM Indexer (sem CORS e sem conteúdo misto)
- Busca em três partes:
  - na biblioteca
  - **listas STRM** para solicitar (aprovação automática quando a fonte responde)
  - **Seerr** (opcional)
- Protetor de tela com pôsteres do catálogo quando nada está tocando
- Funciona no computador, no celular e no tablet; dá para instalar como app (PWA)

## Como funciona

```
navegador ─▶ midia.pecbox.com.br (cloudflared) ─▶ streambox-web :8095 (nginx)
                                                     ├─ /           página
                                                     ├─ /api/       → Jellyfin  127.0.0.1:8096
                                                     ├─ /strm-api/  → Indexador 127.0.0.1:8794
                                                     └─ /seerr/     → Seerr     127.0.0.1:5055
```

Tudo passa pelo mesmo endereço, então o navegador não vê o IP nem a porta do Jellyfin.
A interface web original do Jellyfin (`/api/web`) fica bloqueada neste domínio.

## Instalação no boxserver

### 1. Atualize o STRM Indexer (TV ao vivo M3U)

Copie os dois arquivos de `strm-indexer-patch/` para a pasta do indexador (faça um backup antes) e reinicie:

```bash
cd /mnt/sdb1/strm-indexer
mkdir -p backup-$(date +%F) && cp jellyfin_bridge.py backup-$(date +%F)/
cp /caminho/do/zip/strm-indexer-patch/live_relay.py /caminho/do/zip/strm-indexer-patch/jellyfin_bridge.py .
docker compose restart
curl -s http://127.0.0.1:8794/strm-api/health     # {"ok": true, "jellyfin": true}
```

### 2. Suba o StreamBox Web

```bash
cd /mnt/sdb1/streambox-web
nano docker-compose.yml     # confira as portas do Jellyfin, indexador e Seerr
docker compose up -d --build
curl -s http://127.0.0.1:8095/api/System/Info/Public   # deve responder o JSON do Jellyfin
```

No `docker-compose.yml`, deixe `INDEXER_URL` ou `SEERR_URL` vazio para desligar essa parte.

### 3. Aponte midia.pecbox.com.br para o boxserver

1. No painel da Cloudflare (DNS), **apague** o registro atual de `midia` (o que aponta para o IP da VPS).
2. No boxserver, crie a rota do túnel:
   ```bash
   cloudflared tunnel route dns 5bd31b57-c356-4648-bd29-1778a7fa2e1f midia.pecbox.com.br
   ```
3. No `config.yml` do cloudflared, adicione esta regra **antes** da regra final `http_status:404`:
   ```yaml
     - hostname: midia.pecbox.com.br
       service: http://localhost:8095
   ```
4. Reinicie o túnel: `sudo systemctl restart cloudflared`
5. Abra **https://midia.pecbox.com.br**.

### 4. Ajustes recomendados no Jellyfin

- Em **Painel → Rede → Proxies conhecidos**, adicione `127.0.0.1`. Assim o Jellyfin registra o IP real de quem assiste.
- Em **Painel → Geral**, ative **Permitir conexão rápida** para usar o login por código.

## Outros apps

- **App StreamBox (Android)** a partir da versão 0.5.1: use `https://midia.pecbox.com.br`. O app descobre o `/api` sozinho.
- **Wholphin, Jellyfin oficial e outros clientes**: continuem usando `https://jellyfin.pecbox.com.br`.

## Desenvolvimento

```bash
npm install
JELLYFIN_URL=http://192.168.1.16:8096 INDEXER_URL=http://127.0.0.1:8794 SEERR_URL=http://127.0.0.1:5055 npm run dev
npm run check   # verificação de tipos
npm run build   # gera dist/
```

A configuração de produção fica em `/config.js`, gerado na hora em que o contêiner sobe. Não é preciso recompilar para trocar endereços.
