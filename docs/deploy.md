# Deploy em produção

Tudo roda em planos gratuitos, sem cartão de crédito.

```mermaid
flowchart LR
  U((Visitante)) --> V["Vercel\nshell + 3 microfronts (estáticos)"]
  V -->|"/api/* (mesma origem)"| R["Render (Docker)\ngateway + 5 serviços"]
  R --> N[("Neon\nPostgres")]
  R --> RC[("Redis Cloud\nRedis")]
  R -->|SMTP| B["Brevo\ne-mails"]
```

| Peça                        | Onde                        | Por quê                                                                                                                                                                                                                                                |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Front (shell e microfronts) | Vercel                      | Arquivos estáticos em CDN. Um projeto só: o shell na raiz e os remotes em `/mf/*`.                                                                                                                                                                     |
| Backend                     | Render, um contêiner Docker | Os serviços ficam ligados o tempo todo (consumidores da fila, relays do outbox, SSE), o que funções serverless não fazem. O plano gratuito permite um serviço web, então o contêiner roda os 5 serviços como processos separados, atrás de um gateway. |
| Postgres                    | Neon                        | Postgres gerenciado gratuito.                                                                                                                                                                                                                          |
| Redis                       | Redis Cloud                 | Gratuito, com Streams e scripts Lua.                                                                                                                                                                                                                   |
| E-mail                      | Brevo                       | SMTP gratuito, 300 e-mails por dia.                                                                                                                                                                                                                    |

A Vercel repassa `/api/*` para o Render (veja `vercel.json`). Para o navegador, site e API têm a mesma origem: o cookie de sessão do painel (`SameSite=Strict`) funciona e não é preciso liberar CORS.

## Limitações do plano gratuito

- **O backend dorme** após 15 minutos sem acesso. A primeira visita depois disso leva cerca de 1 minuto. Se a página mostrar erro, espere alguns segundos e recarregue.
- **Redis com 30 MB:** a fila de eventos é limitada a cerca de 10 mil eventos (`EVENT_STREAM_MAXLEN`). Os mais antigos são descartados.
- **E-mails:** até 3 por destinatário e 250 por dia no total (`MAIL_MAX_*`), dentro dos 300 diários do Brevo. Passando disso, o pedido é concluído normalmente, mas o e-mail não sai.

## Passo a passo

Ordem sugerida: banco e Redis, depois o e-mail, depois o backend e por fim o front. Guarde cada valor copiado em um lugar seguro: são senhas.

### 1. Neon (Postgres)

1. Crie uma conta em https://neon.tech (pode entrar com o GitHub).
2. Crie um projeto chamado `plateia`, na região **AWS US West (Oregon)**, a mesma do Render, para menor latência.
3. Em **Connect**, marque **Connection pooling** e copie a connection string. Ela termina com `?sslmode=require`.
4. Esse é o valor de `DATABASE_URL`.

### 2. Redis Cloud

1. Crie uma conta em https://redis.io/try-free.
2. Crie um banco **Free** (30 MB), de preferência na AWS `us-west-2`.
3. Na página do banco, copie o **Public endpoint** (`host:porta`) e a senha do usuário `default`.
4. Monte: `REDIS_URL=redis://default:SENHA@HOST:PORTA`.

### 3. Brevo (e-mail)

1. Crie uma conta em https://www.brevo.com.
2. Em **Senders, domains & dedicated IPs → Senders**, adicione e verifique o e-mail que vai aparecer como remetente.
3. Em **SMTP & API → SMTP**, gere uma chave SMTP. Anote o **login** (`SMTP_USER`) e a **chave** (`SMTP_PASS`).
4. `MAIL_FROM` fica no formato `Plateia <seu-remetente-verificado@exemplo.com>`.

### 4. Render (backend)

1. Crie uma conta em https://render.com entrando com o GitHub e autorize o acesso ao repositório `plateia`.
2. **New → Blueprint**, escolha o repositório. O Render lê o `render.yaml` e cria o serviço `plateia-api`.
3. Preencha as variáveis pedidas:

   | Variável                              | Valor                                                                                                                     |
   | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                        | do passo 1                                                                                                                |
   | `REDIS_URL`                           | do passo 2                                                                                                                |
   | `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | do passo 3                                                                                                                |
   | `APP_URL`, `CORS_ORIGINS`             | a URL do site na Vercel, por exemplo `https://plateia.vercel.app`. Se ainda não souber, coloque essa e ajuste no passo 6. |

   Os segredos `BACKOFFICE_JWT_SECRET` e `MAIL_RECIPIENT_HASH_SECRET` são gerados pelo próprio Render.

4. O primeiro deploy constrói a imagem (alguns minutos), roda as migrações e grava o histórico de vendas de demonstração.
5. Anote a URL do serviço. Se não for `https://plateia-api.onrender.com`, atualize a linha `/api/:path*` do `vercel.json` com a URL certa e faça commit.
6. Teste: `https://<sua-url>.onrender.com/health` deve responder `{"status":"ok"}`.

### 5. Vercel (front)

1. Crie uma conta em https://vercel.com entrando com o GitHub.
2. **Add New → Project**, importe o repositório `plateia`.
3. Em **Framework Preset**, deixe **Other**. Build, pasta de saída e rewrites vêm do `vercel.json`. Não há variáveis para configurar.
4. **Deploy**.

### 6. Ajuste final

1. Copie a URL de produção da Vercel.
2. No Render, atualize `APP_URL` e `CORS_ORIGINS` com essa URL. O Render faz um novo deploy sozinho. `APP_URL` é usada nos links dos e-mails.

## Verificação

- Abra o site: a lista de eventos deve carregar (a primeira vez pode levar 1 minuto, com o backend acordando).
- Compre um ingresso com o seu e-mail e confira a caixa de entrada (e o spam).
- Abra `/admin` e entre com uma conta de demonstração (veja o README).

## Atualizações

A cada push no `main`, a Vercel e o Render fazem o deploy sozinhos. O CI valida o build da imagem Docker antes, no pull request.

## Rodando o pacote de produção localmente

```bash
docker build -f deploy/backend/Dockerfile -t plateia-api .
```

```bash
npm run build:web:prod
```

O primeiro comando gera a mesma imagem que o Render usa; o segundo, o mesmo site estático que a Vercel publica (em `dist-web/`).
