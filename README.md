# Robô de Arbitragem de Criptomoedas

Este projeto é um robô de arbitragem de criptomoedas construído com Next.js, TypeScript, Prisma e Pusher. Ele monitora oportunidades de arbitragem entre as exchanges Gate.io (spot) e MEXC (futuros) e as exibe em um dashboard em tempo real.

## Funcionalidades

- **Dashboard em Tempo Real**: Visualiza oportunidades de arbitragem com spreads, preços e lucros estimados.
- **Conexão com Exchanges**: Usa WebSockets para se conectar às APIs da Gate.io e MEXC.
- **Comunicação com o Frontend**: Usa o Pusher para enviar dados de arbitragem do backend para o frontend.
- **Persistência de Dados**: Usa o Prisma e um banco de dados PostgreSQL para armazenar dados (atualmente não implementado para salvar oportunidades).
- **Implantação na Vercel**: Configurado para fácil implantação na Vercel, incluindo o uso de Funções Cron.

## Como Rodar Localmente

1.  **Clonar o repositório:**
    ```bash
    git clone <url_do_repositorio>
    cd robo-de-arbitragem2
    ```

2.  **Instalar dependências:**
    ```bash
    pnpm install
    ```

3.  **Configurar Variáveis de Ambiente:**
    Crie um arquivo chamado `.env` na raiz do projeto e adicione as seguintes variáveis:

    ```env
    # Banco de Dados (ex: do Supabase ou Railway)
    DATABASE_URL="postgresql://user:password@host:port/database"

    # Pusher (obtenha suas chaves no painel do Pusher)
    PUSHER_APP_ID="seu_app_id"
    NEXT_PUBLIC_PUSHER_KEY="sua_key"
    PUSHER_SECRET="seu_secret"
    NEXT_PUBLIC_PUSHER_CLUSTER="seu_cluster"
    ```

4.  **Gerar o Cliente Prisma:**
    ```bash
    pnpm prisma generate
    ```

5.  **Iniciar o servidor de desenvolvimento:**
    ```bash
    pnpm dev
    ```

    Abra [http://localhost:3000](http://localhost:3000) em seu navegador.

## Implantação na Vercel

Este projeto está pronto para ser implantado na Vercel.

1.  **Faça o push do seu código para um repositório no GitHub.**

2.  **Importe o projeto na Vercel:**
    - Conecte sua conta do GitHub à Vercel.
    - Selecione o repositório.
    - A Vercel deve detectar automaticamente que é um projeto Next.js.

3.  **Configure as Variáveis de Ambiente:**
    - No painel do seu projeto na Vercel, vá para "Settings" > "Environment Variables".
    - Adicione as mesmas variáveis de ambiente que você configurou no seu arquivo `.env` local (`DATABASE_URL`, `PUSHER_APP_ID`, etc.).

4.  **Implante:**
    - Clique em "Deploy".
    - A Vercel construirá e implantará seu projeto. O cron job definido em `vercel.json` começará a ser executado automaticamente, acionando a busca por arbitragem.

## Arquitetura

- **Frontend**: Construído com Next.js e React. Usa o Pusher-JS para receber atualizações em tempo real. Os componentes da interface do usuário estão em `components/`.
- **Backend**:
  - **API Routes do Next.js**: Usadas para o endpoint de autorização do Pusher (`/api/pusher`) e para o cron job (`/api/arbitrage-cron`).
  - **Conectores de Exchange**: `src/gateio-connector.ts` e `src/mexc-connector.ts` gerenciam as conexões WebSocket com as exchanges.
  - **Lógica de Arbitragem**: O arquivo `src/app/api/arbitrage-cron/route.ts` contém a lógica para encontrar oportunidades de arbitragem e enviá-las via Pusher.
- **Banco de Dados**: O schema do Prisma está em `prisma/schema.prisma`.
