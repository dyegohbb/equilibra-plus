# Automação de lançamentos pelo iPhone

## Segurança

Configure na Vercel, somente em Production:

- `AUTOMATION_API_TOKEN`: segredo aleatório com pelo menos 32 caracteres.
- `AUTOMATION_USER_ID`: ID do usuário Neon Auth que será dono dos lançamentos.

Com a sessão aberta, acesse `/api/automation/options` para consultar o seu `userId` e os IDs válidos de carteiras e categorias. Não compartilhe o token e não o coloque em parâmetros da URL.

## Endpoint

`POST /api/public/transactions`

Headers:

```text
Authorization: Bearer SEU_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "idempotencyKey": "identificador-unico-do-sms",
  "description": "Compra identificada pelo SMS",
  "amountCents": 4590,
  "type": "EXPENSE",
  "walletId": "UUID_DA_CARTEIRA",
  "categoryId": "UUID_DA_CATEGORIA",
  "consumptionDate": "2026-09-06"
}
```

`competence` é opcional. Sem ela, a aplicação calcula a competência usando a data e o fechamento do cartão. O valor deve ser enviado como centavos inteiros. A mesma `idempotencyKey` pode ser reenviada sem duplicar o lançamento.

## Atalho do iOS

No app Atalhos, use a automação de mensagem recebida para extrair estabelecimento e valor. Em seguida use “Obter Conteúdo da URL” com método POST, corpo JSON e os headers acima. Gere a chave de idempotência a partir do conteúdo completo do SMS ou de um identificador estável da mensagem.
