# down.blue — Video Downloader for Bluesky

Página única estática que baixa (e converte) vídeos publicados no Bluesky direto no navegador, sem backend. Acesse em <https://downloader.notx.blue> ou <https://down.blue>.

Autor: [@joseli.to](https://bsky.app/profile/joseli.to) · Repositório público: <https://github.com/breakzplatform/downloader.notx.blue>

## Como funciona

1. O usuário cola a URL de um post do Bluesky (`https://bsky.app/profile/<handle>/post/<rkey>`).
2. `extractProfileAndPost()` extrai `profile` e `post` via regex.
3. Faz `fetch` em `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=at://<profile>/app.bsky.feed.post/<post>&depth=10` (API pública AT Protocol, sem autenticação).
4. `extractVideoUrl()` percorre o `embed` do post (`app.bsky.embed.video`, `record`, `record#view`, `external#view`) para achar a playlist HLS ou GIF/URL externa.
5. Para vídeos: baixa o `master.m3u8`, escolhe a variante de maior qualidade, baixa o `.m3u8` da variante, baixa todos os segmentos `.ts` e concatena.
6. Converte TS → MP4 com [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (tenta `-c copy` e cai para `libx264 + aac` se falhar).
7. Para GIFs externos: faz `fetch` direto e expõe o blob.
8. Mantém histórico em `localStorage` (`urlHistory`) e aceita `?url=...` para processar automaticamente.

A conversão usa o `@ffmpeg/core` **single-thread**, que **não exige** `SharedArrayBuffer` nem os headers COOP/COEP. Os headers continuam no `_headers`/`<meta>` (inofensivos) caso um dia se troque por core multi-thread.

## Estrutura

```
.
├── index.html                          # SPA inteira: HTML + Vue 3 + lógica
├── _headers                            # COOP/COEP para Netlify / Cloudflare Pages
├── share.png                           # OG image
├── lib/                                # libs vendorizadas (3rd-party), versão no nome
│   ├── vue-3.5.34.min.js               # Vue 3
│   ├── mux-7.0.3.min.js                # mux.js (remux TS→MP4 sem WASM)
│   ├── ffmpeg-0.12.7.min.js            # @ffmpeg/ffmpeg 0.12.7
│   ├── 814.ffmpeg.js                   # class-worker (nome fixo exigido pelo webpack)
│   ├── ffmpeg-core-st-0.12.6.js        # ffmpeg-core single-thread
│   └── ffmpeg-core-st-0.12.6.wasm      # binário WebAssembly do ffmpeg
├── assets/
│   ├── tailwind-4.3.3.css              # CSS compilado (artefato gerado, não vendorizado)
│                                       # (fontes vêm de static.joseli.to, não versionadas)
├── LICENSE                             # MIT
├── scripts/                            # nada aqui vai ao ar (podado no deploy)
│   ├── package.json                    # pina só o Tailwind CLI (o site não usa npm)
│   ├── pnpm-lock.yaml                  # 66 pacotes travados por integridade (pnpm)
│   ├── build-css.sh                    # regera assets/tailwind-*.css via Tailwind CLI
│   ├── tailwind-input.css              # entrada do build: importa o Tailwind e o tema
│   ├── tailwind-theme.css              # ponte Tailwind v4 (só @theme, sem valores)
│   └── ds/                             # cópia literal do design system joseli.to
```

## Rodando localmente

Como o core é single-thread, qualquer servidor estático serve — não precisa de COOP/COEP:

```sh
npx http-server -p 8080
```

Ou faça deploy no Netlify / Cloudflare Pages, que já leem o `_headers`.

## Deploy

- **Netlify** (produção atual) **/ Cloudflare Pages**: o arquivo `_headers` cuida dos cabeçalhos COOP/COEP.
- `netlify.toml` faz um *prune* no deploy: `scripts/`, o próprio `netlify.toml` e o `.gitignore` **não vão ao ar**. Para excluir mais arquivos, acrescente ao `rm -rf` do `command`.
- **Todo o metadado npm mora em `scripts/`** de propósito: o Netlify decide se roda instalação de dependências procurando um `package.json` na raiz do site. Mantendo fora da raiz, o deploy não instala nada.
- Sem bundler. O único passo de build é o `./scripts/build-css.sh` (rodado localmente, manual); o `netlify.toml` não compila nada, só remove arquivos.

## Falhas atuais e dívida técnica

- **Sem CI nem testes.** Nada valida uma mudança antes do deploy.
- **Sem build/bundler.** `index.html` carrega Vue e ffmpeg via `<script>` síncrono — sem minificação do código da app, sem code-splitting, sem tree-shaking. (Tailwind já é CSS compilado estático — `assets/tailwind-4.3.3.css`; regerar com `./scripts/build-css.sh` sempre que mudar classes no `index.html` ou o design system em `scripts/ds/` for substituído.)
- **Tudo num arquivo só.** Marcação, estilo, dados, métodos e parsers HLS misturados. Difícil revisar e impossível testar unitariamente sem extrair.
- **A página inteira é Computer Modern, inclusive o corpo** — cinco faces, ~856 KB, servidas de `static.joseli.to` com `font-display: swap`, então não bloqueiam a primeira pintura. Um subset dos glifos realmente usados cortaria a maior parte disso, mas a otimização é do host de assets, não deste repo.
- **Headers em dois lugares.** `<meta http-equiv>` (suporte parcial em browsers) e `_headers` (fonte de verdade, lido pelo Netlify). O `<meta>` é só fallback; o `_headers` é o que garante COOP/COEP em produção.
- **Sem SRI** nos scripts vendorizados, e sem identificação de versão dentro deles — auditoria de supply-chain fica complicada.
- **Validação de input frágil.** `postUrl.includes('bsky.app')` aceita qualquer URL com essa substring. Trocar por validação via `URL` + checagem de host exato.
- **Cálculo de progresso suspeito**: `parseInt((ratio * 100).toFixed(2) / 2) + 50` mistura string e número e não cobre os 0–50% do download (só o lado do ffmpeg).
- **Tratamento de erro genérico.** Mensagens "Please try again" sem distinguir CORS, 404, post privado, vídeo apagado, rate limit, etc.
- **`localStorage` sem limite.** `urlHistory` cresce indefinidamente; sem cap nem rotação.
- **Acessibilidade não revisada.** Faltam `alt` em ícones, `aria-live` no status de progresso, foco visível em botões custom.
- **Sem `robots.txt`/`sitemap.xml`/canonical.**
- **`og:image` aponta para domínio fixo** (`downloader.notx.blue/share.png`) — quebra previews em forks/ambientes de staging.
- **WebCodecs detectado mas pouco aproveitado.** Há `isWebCodecsSupported()` mas o caminho rápido nativo aparenta não ser implementado completo — ou cai em ffmpeg de qualquer jeito.
- **Download de segmentos HLS** (precisa confirmar) parece sequencial; paralelizar com `Promise.all` + concorrência limitada acelera bastante.
- **Sem PWA.** Dado que tudo roda offline depois de carregado (ffmpeg.wasm + Vue), um Service Worker daria offline-first quase de graça.
- **Sem rastreamento de versões nem changelog.**

## Melhorias e atualizações sugeridas

Em ordem aproximada de retorno-sobre-esforço:

1. **SRI ou lockfile para `lib/`.** As libs vendorizadas continuam pinadas só pelo nome do arquivo, sem registro de integridade — diferente do Tailwind, que já tem lockfile.
2. **Migrar para Vite** + extrair `index.html` em módulos: `app.js`, `bsky.js` (API), `hls.js` (parser de playlist), `ffmpeg.js`, `history.js`. Fica testável e reduz o HTML servido. Também habilitaria o `@ffmpeg/core` **multi-thread** de forma confiável (ESM + bundler), recuperando a velocidade de conversão para vídeos longos.

> Já feitos: migração do ffmpeg.wasm para 0.12.7 (API de classe `FFmpeg`, core single-thread — sem dependência de SharedArrayBuffer/COOP-COEP); Vue 3.5.34; Tailwind agora é CSS compilado estático (sem Play CDN, sem warning, ~390KB a menos de JS bloqueante); `@ffmpeg/util` substituído por `fetchFile` inline; remoção do `indexo.php` (produção é Netlify); versão no nome dos arquivos vendorizados (exceto `814.ffmpeg.js`); redesign na identidade [joseli.to](https://joseli.to) sobre Tailwind 4 (tokens do design system expostos como utilitários via `@theme`, tinta própria `#018281`, logotipo em texto, modo escuro âmbar opt-in, contraste auditado em AA nos dois temas).
6. **Testes unitários** para `extractProfileAndPost`, `extractVideoUrl`, `parseHighestQualityVideoUrl`, `parseSegmentUrls`, `extractSubtitleLang`. São funções puras e cobrem o coração do parser.
7. **Validação robusta de URL** com `new URL(postUrl)` + checagem `host === 'bsky.app'`.
8. **Concorrência no download de segmentos** (ex.: pool de 6 fetches simultâneos).
9. **Mensagens de erro específicas** por código HTTP / tipo de embed / vídeo indisponível.
10. **i18n** (mínimo PT-BR + EN) com seleção via `navigator.language`.
11. **Service Worker / PWA**, com cache do ffmpeg-core.wasm (~25MB) — economia gigante em recargas.
12. **Limite e rotação no `urlHistory`** (ex.: máximo 50 entradas).
13. **Acessibilidade**: `aria-live="polite"` no `status`, `aria-valuenow` na barra de progresso, foco em modais.
14. **SRI** + versionamento explícito em todos os scripts vendorizados.
15. **CI** (GitHub Actions) rodando lint + testes em cada PR; deploy via Cloudflare Pages preview.
16. **Suporte a vídeos com múltiplas variantes de áudio** e legendas (já há detecção parcial de `EXT-X-MEDIA TYPE=SUBTITLES`).
17. **Telemetria opcional e privada** (Plausible/Umami self-hosted) — hoje a página afirma "no analytics collected", o que é um diferencial; mantenha opt-in se for adicionar.

## Apoie

- Pix · [APOIA.se/joselito](https://apoia.se/joselito) · [Buy Me a Coffee](https://buymeacoffee.com/joselito)

## Aviso

Respeite copyright e os termos de uso do Bluesky. Esta ferramenta apenas reorganiza mídia já pública; não contorna controles de acesso.
