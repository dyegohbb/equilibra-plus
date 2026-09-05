# Equili.bra+ — Entrega 01

Fundação Next.js 16 + Neon Auth, restrita a cadastro, login, sessão persistente, logout e uma página privada com Hello World. Não há tabelas ou funcionalidades financeiras.

## Executar localmente

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env.local`.
3. Defina `NEON_AUTH_BASE_URL` com o endpoint **HTTPS do Neon Auth do branch development**. Não use a conexão PostgreSQL.
4. Gere um segredo local com `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` e configure `NEON_AUTH_COOKIE_SECRET`. Não o versione.
5. Execute `npm run dev` e abra http://localhost:3000.

Sem as variáveis, os formulários ficam indisponíveis e `/app` continua bloqueada. Configuração inválida nunca concede uma sessão.

## Rotas e segurança

- `/` encaminha para `/sign-in`.
- `/sign-in` e `/sign-up`: formulários em português; sessão existente encaminha para `/app`.
- `/app`: proxy oficial renova os cookies e filtra acesso; a página também consulta o Neon no servidor, ignorando o cache de sessão para respeitar revogação.
- `/api/auth/[...path]`: handler do SDK oficial. Senhas são enviadas ao Neon Auth; a aplicação não armazena nem calcula hashes.
- Login usa `rememberMe: true`. A duração real da sessão segue a política do Neon; o segredo precisa permanecer estável entre deploys.
- Logout usa o SDK e faz navegação completa para descartar o cache do roteador.
- Nenhum token ou senha é armazenado manualmente no localStorage.
- O SDK exige nome no cadastro; o e-mail é reutilizado nesse campo, mantendo apenas os três campos solicitados.
- Se o Neon exigir verificação por e-mail, o cadastro orienta a verificação antes do login.

## Ambientes e publicação

Projeto GitHub: `dyegohbb/equilibra-plus`. Produção: https://equilibra-plus.vercel.app.

Configure na Vercel, no ambiente **Production**:

- `NEON_AUTH_BASE_URL`: endpoint do Auth do branch `production`.
- `NEON_AUTH_COOKIE_SECRET`: segredo criptográfico de pelo menos 32 caracteres, diferente do DEV e salvo como Secret.

Development e Preview devem usar um branch isolado do Neon e outro segredo. Cadastre apenas as origens necessárias em Neon Auth → Configuration → Trusted domains. Não utilize wildcard global. O SDK também faz o proxy de autenticação pela mesma origem da aplicação.

A Vercel está ligada ao branch `main`. Um push publica nova versão; alteração de variável exige novo deploy. Para rollback do código, use a implantação anterior na Vercel. Evite trocar o segredo sem necessidade: isso invalida o cache de cookies assinado.

## Verificação

- `npm run lint`
- `npm run build`
- `npm run test:e2e`

Os testes usam o Chrome instalado, em processo separado, sem acessar o perfil pessoal. Cobrem rotas privadas, cookie forjado, responsividade, validação e credenciais inválidas. Os testes que precisam do Neon são marcados como pendentes se ele não estiver configurado.

Para executar o fluxo completo com conta descartável no **DEV**, defina `E2E_ALLOW_DEV_SIGNUP=1` antes de `npm run test:e2e`. Isso cria uma conta com e-mail fictício e senha aleatória apenas no DEV. O teste exige localhost; nunca use essa opção apontando o servidor local para produção. Senhas, cookies e traces não são gravados pelo teste. A conta de teste permanece no Neon DEV.

Esse fluxo cobre cadastro, duplicidade, login, refresh, redirecionamento autenticado, cookies persistentes em um novo contexto e logout com revogação. Um novo contexto não substitui a verificação manual de fechar e reabrir o navegador inteiro.

A conclusão da Entrega 01 exige repetir os testes T01–T10 do documento de escopo na URL de produção, incluindo fechar/reabrir navegador e usar celular real. Em produção, utilize uma conta do proprietário, sem seeds de teste.

## Referências

- [Neon Auth Next.js oficial](https://github.com/neondatabase/neon-js/blob/main/packages/auth/NEXT-JS.md)
- Versão instalada: `@neondatabase/auth` 0.5.0-beta; Next.js 16.3.4. Assinaturas verificadas no pacote instalado.
- Guias locais Next.js: `node_modules/next/dist/docs/`.
