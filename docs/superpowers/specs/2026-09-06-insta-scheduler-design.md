# Insta Scheduler — Design

Data: 2026-09-06
Status: Aprovado para plano de implementação

## Problema

Hoje, publicar um vídeo no Instagram (via Zernio) exige uma sessão interativa com o Claude: escolher o vídeo, escrever a legenda, subir o arquivo manualmente e confirmar a publicação passo a passo. O objetivo é ter uma ferramenta própria, hospedada preferencialmente no GitHub, que permita:

- escolher o vídeo e a conta do Instagram por um frontend simples;
- agendar a publicação para uma data específica;
- ter a legenda gerada automaticamente por IA (revisável antes de confirmar);
- publicar sozinha, todo dia, sem intervenção manual no dia da publicação.

## Fora de escopo (YAGNI)

- Múltiplas plataformas além do Instagram (Zernio suporta outras, mas não é pedido agora).
- Edição de vídeo (corte, texto, filtros) — os vídeos já chegam prontos.
- Múltiplos usuários/login complexo — ferramenta de uso pessoal, uma senha simples é suficiente.
- Reagendamento automático em caso de falha — falha fica visível para retry manual, não é reprocessada sozinha (evita duplicidade de post).

## Arquitetura

```
┌─────────────────────┐        ┌──────────────────────┐        ┌────────────────────┐
│  Frontend (GitHub    │  HTTPS │  Cloudflare Worker    │  HTTPS │   GitHub API        │
│  Pages, estático)    │───────▶│  (backend leve,       │───────▶│   - Release assets  │
│  - form de agendamento│       │   protegido por senha)│        │     (vídeos)        │
│  - captura 1 frame do │       │  - upload de vídeo    │        │   - Contents API    │
│    vídeo no navegador │◀──────│  - gera legenda (IA)  │        │     (queue.json)    │
└─────────────────────┘ legenda │  - grava fila         │        └────────────────────┘
                          sugerida└──────────┬────────────┘
                                             │
                                   ┌─────────▼─────────┐        ┌────────────────────┐
                                   │ Anthropic API      │        │  GitHub Actions     │
                                   │ (gera legenda a    │        │  (cron diário)      │
                                   │ partir do frame)   │        │  lê queue.json,      │
                                   └────────────────────┘        │  publica no Zernio,  │
                                                                  │  atualiza histórico  │
                                                                  └──────────┬──────────┘
                                                                             │
                                                                   ┌─────────▼─────────┐
                                                                   │   Zernio API       │
                                                                   │  (Instagram)       │
                                                                   └────────────────────┘
```

## Componentes

### 1. Frontend (`frontend/`, publicado via GitHub Pages)

Formulário único de agendamento:
- Seleção de arquivo de vídeo (input local, não é enviado até confirmar a legenda).
- Dropdown de conta do Instagram (populado via Worker → Zernio `GET /v1/accounts`).
- Campo de data de publicação (date picker, não permite datas passadas).
- Campo opcional "tema/contexto" (texto livre, ajuda a IA a escrever a legenda).
- Botão "Gerar legenda" → captura 1 frame do vídeo (`<video>` + `<canvas>`, seek para ~40% da duração) e envia ao Worker junto com o tema.
- Campo de legenda pré-preenchido com a sugestão da IA, editável livremente.
- Botão "Agendar publicação" → envia vídeo completo + metadados (conta, data, legenda final) ao Worker.
- Lista simples da fila atual (lida de `queue.json` via GitHub raw content), mostrando status (`scheduled`, `published`, `failed`).
- Campo de senha (a mesma senha simples usada em todas as chamadas à Worker).

Sem framework — HTML/CSS/JS puro, para manter o deploy trivial no GitHub Pages.

### 2. Worker (`worker/`, Cloudflare Workers, plano gratuito)

Três rotas:

- `POST /caption` — recebe `{password, hint, frame_base64}`, valida senha, chama a Anthropic Messages API (visão) com o frame, devolve `{caption}`.
- `GET /accounts` — recebe `{password}` via header, chama `GET /v1/accounts` do Zernio com a `ZERNIO_API_KEY` guardada na Worker, devolve a lista de contas Instagram.
- `POST /schedule` — recebe `{password, video (multipart), account_id, date, caption}`:
  1. valida senha;
  2. cria uma GitHub Release (ou reaproveita uma release "media" existente) e sobe o vídeo como asset via upload binário direto (sem base64 — evita estourar o limite de CPU do plano gratuito);
  3. lê `queue.json` atual via Contents API, adiciona a nova entrada, grava de volta (commit).

Segredos da Worker (Cloudflare secrets, nunca expostos ao navegador): `APP_PASSWORD`, `GITHUB_TOKEN` (PAT com escopo `repo`, restrito a este repositório), `ANTHROPIC_API_KEY`, `ZERNIO_API_KEY`.

### 3. Armazenamento no repositório

- **Vídeos**: assets binários anexados a uma GitHub Release (URL pública estável, sem limite de 25MB do Zernio, sem gasto de banda do Pages).
- **`queue.json`**: fila de publicações agendadas.
  ```json
  [
    {
      "id": "uuid",
      "video_url": "https://github.com/.../releases/download/media/bike3_amarelo.mp4",
      "account_id": "6a9d5a2277555aae01e4b22d",
      "platform": "instagram",
      "date": "2026-09-10",
      "caption": "...",
      "status": "scheduled",
      "created_at": "2026-09-06T15:00:00Z"
    }
  ]
  ```
- **`history.json`**: mesmas entradas, movidas para cá após publicação (com `published_at`) ou falha (com `error`).

### 4. Publicação diária (`.github/workflows/daily-publish.yml`)

- Trigger: `schedule` (cron `0 12 * * *`, ou seja 12:00 UTC / ~09:00 BRT — ajustável no próprio arquivo) + `workflow_dispatch` (para testar manualmente).
- Passos:
  1. Checkout do repo.
  2. Script (Node ou Python) lê `queue.json`, filtra `status == "scheduled" && date <= hoje` (usa `<=` para cobrir o caso do workflow não rodar num dia específico).
  3. Para cada entrada: `POST /v1/media/upload-direct` (Zernio) com a `video_url` da Release → obtém URL temporária do Zernio → `POST /v1/posts` com `publishNow: true`, `platforms: [{platform: "instagram", accountId}]`.
  4. Em sucesso: move a entrada para `history.json` com `status: "published"`. Em falha: mantém em `queue.json` com `status: "failed"` e `error` preenchido (não tenta de novo sozinho).
  5. Commit e push das mudanças em `queue.json`/`history.json`.
- Secret do repositório: `ZERNIO_API_KEY` (Actions secret, o mesmo valor usado na Worker).

### 5. Deploy do frontend (`.github/workflows/pages-deploy.yml`)

- Publica o conteúdo de `frontend/` no GitHub Pages a cada push na branch principal.

## Segurança

- Nenhum segredo (Zernio, Anthropic, GitHub PAT) chega ao navegador — tudo fica em secrets da Cloudflare Worker / GitHub Actions.
- O frontend é uma URL pública (limitação do GitHub Pages no plano gratuito), protegida apenas por uma senha simples verificada na Worker. Isso é aceitável para uso pessoal de um único usuário, mas **não é segurança forte** — não deve ser usado se as contas do Instagram forem de terceiros/clientes sensíveis sem reforçar a autenticação depois.
- README documenta como gerar e restringir o PAT do GitHub (escopo mínimo: `repo` só neste repositório, ou fine-grained token).

## Tratamento de erros

| Ponto de falha | Comportamento |
|---|---|
| Senha errada na Worker | 401, frontend mostra mensagem, nada é gravado |
| Falha ao gerar legenda (Anthropic indisponível) | Frontend libera edição manual da legenda, fluxo continua |
| Falha no upload do vídeo para a Release | Erro exibido no frontend, nenhuma entrada é criada em `queue.json` |
| Falha ao publicar no Zernio (cron) | Entrada marcada `failed` com o erro, permanece visível na fila para retry manual |
| Cron não roda (falha de infra do GitHub Actions) | Notificação automática por e-mail do GitHub para falha de workflow |

## Teste (validação manual, sem suíte automatizada de UI)

1. Agendar um vídeo pequeno para "hoje" pelo frontend e confirmar que a entrada aparece em `queue.json`.
2. Rodar `daily-publish.yml` manualmente (`workflow_dispatch`) e confirmar que o post sai no Instagram e a entrada migra para `history.json`.
3. Testar o caminho de erro: agendar com `account_id` inválido e confirmar que a entrada fica `failed` com a mensagem de erro, sem derrubar o restante do workflow.
