# Insta Scheduler

Agenda publicações de vídeo no Instagram (via [Zernio](https://zernio.com)) a
partir de um formulário web: você escolhe o vídeo, a conta e a data; a IA
sugere uma legenda; no dia marcado, um workflow do GitHub Actions publica
sozinho.

## Arquitetura

Ver `docs/superpowers/specs/2026-09-06-insta-scheduler-design.md` para o
desenho completo. Resumo:

- `frontend/` — página estática (GitHub Pages).
- `worker/` — Cloudflare Worker (backend leve, guarda os segredos).
- `scripts/publish/` — script Node rodado diariamente pelo GitHub Actions.
- `queue.json` / `history.json` — fila de posts agendados / já publicados.

## Configuração

### 1. Criar o repositório no GitHub

```bash
gh repo create insta-scheduler --public --source=. --remote=origin
git branch -M main
git push -u origin main
```

> **O repositório precisa ser público** — a Zernio busca a URL do vídeo
> publicamente (sem autenticação) para publicar no Instagram; um
> repositório privado faria toda publicação falhar. Isso também significa
> que os vídeos agendados ficam publicamente baixáveis pela URL da Release
> até serem publicados (aceitável para uso pessoal, mas vale deixar
> explícito).

### 2. Gerar as chaves necessárias

| Segredo | Onde conseguir |
|---|---|
| `ZERNIO_API_KEY` | zernio.com → Settings → API Keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `GITHUB_TOKEN` (para o Worker) | github.com → Settings → Developer settings → Fine-grained tokens, escopo **Contents: Read and write** só neste repositório |
| `APP_PASSWORD` | uma senha à sua escolha, só você vai usar |

### 3. Configurar o secret do GitHub Actions

```bash
gh secret set ZERNIO_API_KEY --repo SEU_USUARIO/insta-scheduler
```

### 4. Publicar a Worker (Cloudflare)

```bash
cd worker
npx wrangler login
npx wrangler secret put APP_PASSWORD
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ZERNIO_API_KEY
```

Edite `worker/wrangler.toml` e troque `GITHUB_OWNER` pelo seu usuário do
GitHub. Depois:

```bash
npm run deploy
```

Anote a URL que a Cloudflare devolver (algo como
`https://insta-scheduler.SEU_SUBDOMINIO.workers.dev`).

### 5. Apontar o frontend para a Worker

Edite `frontend/app.js` e troque `WORKER_URL` pela URL do passo anterior.
Troque também `GITHUB_OWNER` e `GITHUB_REPO` (usados para ler `queue.json`
diretamente do `raw.githubusercontent.com`, já que o GitHub Pages serve
`frontend/` como raiz do site). Faça commit e push — o workflow
`pages-deploy.yml` publica automaticamente.

### 6. Ativar o GitHub Pages

No repositório: Settings → Pages → Source → **GitHub Actions**.

### 7. Testar

1. Abra a URL do GitHub Pages, digite a senha, escolha um vídeo pequeno, uma
   conta e a data de hoje.
2. Confirme que `queue.json` recebeu a entrada (veja o repositório no
   GitHub).
3. Rode o workflow `Daily Instagram Publish` manualmente (aba Actions →
   Run workflow) e confirme que o post saiu e a entrada foi para
   `history.json`.

## Fila e histórico

- `queue.json`: posts agendados (`scheduled`) ou que falharam (`failed`,
  com o motivo em `error` — não são tentados de novo sozinhos).
- `history.json`: posts publicados com sucesso.
