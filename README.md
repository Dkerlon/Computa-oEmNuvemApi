# Arquivo

Gerenciador privado de arquivos com React, API Express e MongoDB Atlas GridFS.

## Funcionalidades

### Acesso e armazenamento

- Entrada com uma senha própria do aplicativo (`APP_PASSWORD`) e sessão em cookie HTTP-only; opção de sair da conta.
- Arquivos e metadados armazenados no MongoDB Atlas. O conteúdo dos arquivos usa GridFS.
- Modo local para desenvolvimento quando `MONGODB_HOST` está vazio. Nesse modo, arquivos e metadados ficam em `.local-data/`.
- Indicador de espaço utilizado em relação aos 512 MB do plano gratuito do Atlas.

### Arquivos e pastas

- Envio de um ou vários arquivos pela mesma seleção; cada arquivo é enviado separadamente e pode ter até 4 MB.
- Criação de pastas, inclusive dentro de outras pastas, e navegação pela estrutura.
- Visualização dos itens em lista ou grade, com nome, tipo, data de modificação e tamanho.
- Painel de detalhes com tipo, tamanho e datas de criação e modificação.
- Download de arquivos, renomeação de arquivos e pastas e movimentação entre pastas.
- Busca por nome de arquivo ou pasta e atalho `Ctrl/Cmd + K` para focar a busca.
- Áreas **Todos os arquivos**, **Recentes**, **Favoritos**, **Compartilhados** e **Lixeira**.
- Marcação e remoção de favoritos.
- Envio para a lixeira, restauração e exclusão permanente com confirmação. Ao excluir uma pasta permanentemente, seu conteúdo também é removido.

### Compartilhamento

- Criação de link público de download para um arquivo, copiado automaticamente para a área de transferência.
- Link válido por 7 dias; quem tiver o link pode baixar o arquivo sem entrar no aplicativo.
- Desativação do link pelo painel de detalhes. Gerar um novo link substitui o anterior.

### Interface

- Layout responsivo para computador e celular, com menu lateral recolhido em telas pequenas.
- Estados vazios, avisos de sucesso ou erro e indicação clara quando o aplicativo está no modo local.

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
