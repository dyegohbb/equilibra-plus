# Equilibra+ — análise de funcionalidades importantes

## Estado atual

O Equilibra+ já possui um núcleo funcional para finanças pessoais: autenticação, contas e cartões, categorias, lançamentos à vista e parcelados, competências, recorrências, faturamento de programados, pagamento de cartão, extrato editável, saldo acumulado, previsão com pendências, exportação de dados e endpoint idempotente para automação do iPhone.

As recomendações abaixo foram priorizadas pelo impacto na rotina, integridade dos dados e clareza financeira.

## Prioridade 1 — necessárias para uso diário confiável

### 1. Saldo inicial e ajuste de carteira

Hoje uma carteira nasce zerada e o usuário precisa simular uma entrada para representar o dinheiro que já possuía. Permitir saldo inicial na criação e um lançamento de ajuste auditável torna a implantação e a conciliação corretas.

### 2. Orçamento mensal por categoria

Definir limites para categorias, acompanhar realizado, programado, disponível e percentual consumido. Deve permitir copiar o orçamento do mês anterior e alertar ao se aproximar ou ultrapassar o limite.

### 3. Recorrências sem horizonte artificial

Uma recorrência sem data final gera atualmente apenas doze competências. O sistema deve criar ocorrências futuras sob demanda, mantendo a regra ativa até seu encerramento, sem precisar inserir anos de registros antecipadamente.

### 4. Conciliação e importação bancária

Importar CSV/OFX, revisar itens antes de confirmar, detectar duplicados e conciliar com programações existentes. Essa é a principal forma de reduzir trabalho manual e aumentar a confiança no saldo.

### 5. Transferência entre carteiras

Registrar transferências vinculadas entre contas sem contabilizá-las como receita ou despesa, com edição/exclusão atômica dos dois lados.

### 6. Gestão completa de fatura

Separar faturas por competência e estado — aberta, fechada, paga e vencida —, exibir vencimento, pagamento parcial, saldo remanescente e histórico de pagamentos.

### 7. Filtros e paginação do extrato

Filtrar por período, carteira, categoria, tipo, faixa de valor e status, além de paginação no servidor. A consulta atual carrega todos os lançamentos da competência, o que perde desempenho com histórico grande.

## Prioridade 2 — melhora relevante de controle

### 8. Edição de compras parceladas como conjunto

Permitir alterar ou cancelar uma parcela, esta e as próximas, ou toda a compra. O sistema deve recalcular parcelas preservando o total e o histórico já conciliado.

### 9. Gestão completa de recorrências

Listar regras ativas e encerradas, editar valor, categoria, descrição, carteira padrão e período, pausar/retomar e aplicar mudanças somente ao futuro.

### 10. Relatórios e evolução

Fluxo de caixa por mês, despesas por categoria, evolução patrimonial, comparação orçamento versus realizado e projeção dos próximos meses, com filtros e exportação.

### 11. Metas e reservas

Criar objetivos financeiros com valor-alvo, prazo e aportes, distinguindo dinheiro disponível de valores reservados.

### 12. Busca global e ações em lote

Pesquisar todo o histórico, recategorizar vários lançamentos, mover de carteira e excluir/arquivar em lote com confirmação.

### 13. Central de pendências

Reunir programações atrasadas, faturas próximas do vencimento, lançamentos sem categoria e possíveis duplicidades em uma fila de revisão.

## Prioridade 3 — maturidade do produto

### 14. Preferências do usuário

Timezone, moeda, formato de data, mês inicial do dashboard, carteira padrão e preferências de privacidade sincronizadas entre dispositivos.

### 15. Notificações configuráveis

Alertas de vencimento, orçamento, saldo previsto negativo e recorrências não faturadas, com controle de canal e antecedência.

### 16. Backup e restauração guiada

Além da exportação bruta, oferecer download pela interface, importação validada, confirmação de conflitos e recuperação segura.

### 17. PWA e experiência móvel

Instalação na tela inicial, atalhos para novo lançamento, melhor suporte offline para rascunhos e fila segura de sincronização.

### 18. Regras automáticas de categorização

Aprender ou configurar correspondências por descrição, remetente do SMS ou estabelecimento, sempre permitindo revisão antes de aplicar em massa.

## Qualidade técnica recomendada

- Testes de integração das operações financeiras e de autorização por usuário.
- Testes ponta a ponta do lançamento, recorrência, faturamento, pagamento e exclusão.
- Proteção explícita contra CSRF nas mutações autenticadas por cookie.
- Cabeçalhos de segurança e política de conteúdo.
- Observabilidade de erros no servidor sem exposição de dados financeiros.
- Índices e paginação revisados com volume representativo.
- Componentização gradual da tela financeira, hoje concentrada em um único arquivo grande.

## Sequência sugerida

1. Saldo inicial, transferência e gestão de fatura.
2. Orçamento por categoria e central de pendências.
3. Recorrências contínuas e edição completa.
4. Importação/conciliação e filtros avançados.
5. Relatórios, metas, notificações e PWA.
