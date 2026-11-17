# Arquivo

Gerenciador privado de arquivos com React, API Express e MongoDB Atlas GridFS. Inclui pastas, busca, favoritos, lixeira, downloads e links de compartilhamento com validade de 7 dias.

## Rodar no computador

1. Instale Node.js 20 ou superior.
2. Execute `npm install` nesta pasta.
3. Preencha o `.env` (veja `.env.example`). `MONGODB_HOST` recebe somente o domínio do cluster, sem `mongodb+srv://`. Usuário e senha ficam nos campos separados.
4. Execute `npm run dev` e abra `http://127.0.0.1:5173`.

Se `MONGODB_HOST` estiver vazio, a aplicação usa `.local-data/` apenas para desenvolvimento local. Na Vercel, MongoDB é obrigatório. A senha para entrar no aplicativo é `APP_PASSWORD`; ela é diferente da senha do usuário do MongoDB.

## Publicar na Vercel

1. Importe este repositório na Vercel como projeto Vite. `npm run build` gera `dist/`.
2. Em **Settings → Environment Variables**, cadastre `MONGODB_HOST`, `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_DB`, `APP_PASSWORD` e `SESSION_SECRET`. Use os valores do seu `.env` local, exceto `PORT`.
3. No Atlas, em **Security → Database & Network Access**, permita a conexão da Vercel. As funções do plano gratuito usam IPs de saída dinâmicos; para o plano gratuito, pode ser necessário `0.0.0.0/0`. Isso permite tentativas de conexão de qualquer IP, portanto crie uma senha forte e um usuário dedicado com permissão `readWrite` somente no banco `arquivo`, em vez de `atlasAdmin`.
4. Faça o deploy e teste `/api/status`, login e upload. O arquivo `.env` não é publicado nem versionado.

## Limites e segurança

- O Atlas Free tem 512 MB para dados e índices.
- O upload aceita arquivos de até 4 MB por vez por causa do limite de corpo de requisição das Vercel Functions. Downloads também ficam dentro desse limite.
- Os links de compartilhamento dão acesso de leitura a quem possuir o link, expiram em 7 dias e podem ser desativados no painel de detalhes.
- A interface tem um único acesso administrativo protegido por `APP_PASSWORD`. Para contas individuais e permissões por pessoa, seria necessário ampliar a autenticação.
- O `.env`, `.local-data/` e `node_modules/` estão no `.gitignore`.
