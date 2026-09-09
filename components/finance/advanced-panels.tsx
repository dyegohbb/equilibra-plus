"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { LoadingState } from "@/components/ui/spinner";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useNotifications } from "@/components/ui/notifications";
import { parseMoneyToCents } from "@/modules/finance/domain";

type Wallet = { id: string; name: string; type: string };
type Category = { id: string; name: string; type: string };
type Options = {
  wallets: Wallet[];
  categories: Category[];
  competence: string;
  visible: boolean;
};
type Tx = {
  transaction: {
    id: string;
    walletId: string;
    purchaseId: string | null;
    description: string;
    amountCents: number;
    type: string;
    consumptionDate: string;
    competence: string;
    installmentNumber: number | null;
    installmentTotal: number | null;
    deletedAt: string | null;
  };
  walletName: string;
  categoryName: string | null;
};
type RecurringRow = {
  rule: {
    id: string;
    description: string;
    defaultAmountCents: number;
    type: string;
    categoryId: string | null;
    defaultWalletId: string | null;
    startCompetence: string;
    endCompetence: string | null;
    paused: boolean;
    active: boolean;
  };
  walletName: string | null;
  categoryName: string | null;
};
type ReportDatum = {
  competence?: string;
  name?: string;
  income?: number;
  expense?: number;
  net?: number;
  balance?: number;
  amount?: number;
};
type BudgetReport = {
  categoryId: string;
  name: string;
  competence: string;
  budget: number;
  actual: number;
};
type ReportData = {
  monthly: (ReportDatum & {
    competence: string;
    income: number;
    expense: number;
    net: number;
  })[];
  evolution: (ReportDatum & { competence: string; balance: number })[];
  byCategory: (ReportDatum & { name: string; expense: number })[];
  projection: (ReportDatum & { competence: string; amount: number })[];
  budgets: BudgetReport[];
  reservedCents: number;
};
type GoalRow = {
  goal: {
    id: string;
    name: string;
    targetAmountCents: number;
    targetDate: string | null;
    active: boolean;
  };
  savedCents: number;
};
type PendingData = {
  overdue: {
    id: string;
    description: string;
    competence: string;
    expectedAmountCents: number;
  }[];
  uncategorized: {
    id: string;
    description: string;
    consumptionDate: string;
    amountCents: number;
  }[];
  duplicates: {
    description: string;
    consumptionDate: string;
    amountCents: number;
    count: number;
  }[];
  cards: { id: string; name: string; balance: number; dueSoon: boolean }[];
};
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const cash = (v: number, visible: boolean) =>
  visible ? brl.format(v / 100) : "••••••";
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Recife" });
async function request<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data as T;
}
async function post(payload: Record<string, unknown>) {
  return request("/api/advanced", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function AdvancedStatement({
  wallets,
  categories,
  competence,
  visible,
}: Options) {
  const notify = useNotifications(),
    [filters, setFilters] = useState({
      query: "",
      competence: competence.slice(0, 7),
      from: "",
      to: "",
      walletId: "",
      categoryId: "",
      type: "",
      min: "",
      max: "",
      status: "ACTIVE",
    }),
    [page, setPage] = useState(1),
    [data, setData] = useState<{
      rows: Tx[];
      total: number;
      pages: number;
    } | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [installment, setInstallment] = useState<Tx | null>(null),
    [singleEdit, setSingleEdit] = useState<Tx | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const q = new URLSearchParams({
        mode: "transactions",
        page: String(page),
        pageSize: "25",
      });
      Object.entries(filters).forEach(([key, value]) => {
        if (value)
          q.set(
            key === "min" ? "minCents" : key === "max" ? "maxCents" : key,
            key === "min" || key === "max"
              ? String(parseMoneyToCents(value))
              : key === "competence"
                ? `${value}-01`
              : value,
          );
      });
      setData(await request(`/api/advanced?${q}`));
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao carregar extrato.",
      );
    } finally {
      setBusy(false);
    }
  }, [filters, page, notify]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  function update(name: string, value: string) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  }
  async function batch(
    operation: "CATEGORY" | "WALLET" | "DELETE" | "RESTORE",
    targetId?: string,
  ) {
    if (
      operation === "DELETE" &&
      !confirm(`Excluir ${selected.length} lançamento(s)?`)
    )
      return;
    setBusy(true);
    try {
      await post({
        action: "batchTransactions",
        ids: selected,
        operation,
        targetId,
      });
      notify("success", "Lançamentos atualizados.");
      setSelected([]);
      await load();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Erro na ação em lote.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXTRATO GLOBAL</p>
            <h2>{data?.total ?? 0} lançamentos</h2>
          </div>
          <RefreshButton onRefresh={load} />
        </div>
        <div className="filter-grid">
          <label className="compact-filter">
            <span>Competência</span>
            <input
              type="month"
              value={filters.competence}
              onChange={(e) => update("competence", e.target.value)}
            />
          </label>
          <input
            placeholder="Buscar em todo histórico"
            value={filters.query}
            onChange={(e) => update("query", e.target.value)}
          />
          <input
            type="date"
            value={filters.from}
            onChange={(e) => update("from", e.target.value)}
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => update("to", e.target.value)}
          />
          <select
            value={filters.walletId}
            onChange={(e) => update("walletId", e.target.value)}
          >
            <option value="">Todas as carteiras</option>
            {wallets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select
            value={filters.categoryId}
            onChange={(e) => update("categoryId", e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categories.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(e) => update("type", e.target.value)}
          >
            <option value="">Todos os tipos</option>
            <option value="INCOME">Entrada</option>
            <option value="EXPENSE">Saída</option>
            <option value="ADJUSTMENT">Ajuste</option>
            <option value="CARD_PAYMENT">Pagamento</option>
          </select>
          <input
            inputMode="decimal"
            placeholder="Valor mínimo"
            value={filters.min}
            onChange={(e) => update("min", e.target.value)}
          />
          <input
            inputMode="decimal"
            placeholder="Valor máximo"
            value={filters.max}
            onChange={(e) => update("max", e.target.value)}
          />
          <select
            value={filters.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="ACTIVE">Ativos</option>
            <option value="DELETED">Excluídos</option>
            <option value="ALL">Todos</option>
          </select>
        </div>
        {selected.length > 0 && (
          <div className="batch-bar">
            <b>{selected.length} selecionados</b>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void batch("CATEGORY", e.target.value);
              }}
            >
              <option value="">Recategorizar…</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void batch("WALLET", e.target.value);
              }}
            >
              <option value="">Mover para…</option>
              {wallets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {filters.status === "DELETED" ? (
              <button
                className="small-button"
                onClick={() => void batch("RESTORE")}
              >
                Restaurar
              </button>
            ) : (
              <button
                className="danger-button"
                onClick={() => void batch("DELETE")}
              >
                Excluir
              </button>
            )}
          </div>
        )}
        {busy && !data ? (
          <LoadingState label="Carregando extrato…" />
        ) : (
          <div className="advanced-list">
            {data?.rows.map((row) => (
              <article className="advanced-row" key={row.transaction.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(row.transaction.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, row.transaction.id]
                        : ids.filter((id) => id !== row.transaction.id),
                    )
                  }
                />
                <div>
                  <b>{row.transaction.description}</b>
                  <small>
                    {row.transaction.consumptionDate
                      .split("-")
                      .reverse()
                      .join("/")}{" "}
                    · {row.walletName} · {row.categoryName ?? "Sem categoria"}
                  </small>
                </div>
                <strong
                  className={
                    row.transaction.amountCents < 0 ? "negative" : "positive"
                  }
                >
                  {cash(row.transaction.amountCents, visible)}
                </strong>
                {!row.transaction.deletedAt &&
                  (row.transaction.purchaseId &&
                  row.transaction.installmentTotal &&
                  row.transaction.installmentTotal > 1 ? (
                    <button
                      className="text-button"
                      onClick={() => setInstallment(row)}
                    >
                      Parcelas
                    </button>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => setSingleEdit(row)}
                    >
                      Editar
                    </button>
                  ))}
              </article>
            ))}
          </div>
        )}
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>
            Anterior
          </button>
          <span>
            {page} / {data?.pages ?? 1}
          </span>
          <button
            disabled={page >= (data?.pages ?? 1)}
            onClick={() => setPage((x) => x + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
      {installment && (
        <InstallmentModal
          row={installment}
          wallets={wallets}
          categories={categories}
          close={() => setInstallment(null)}
          done={async () => {
            setInstallment(null);
            await load();
          }}
        />
      )}
      {singleEdit && (
        <SingleTransactionModal
          row={singleEdit}
          wallets={wallets}
          close={() => setSingleEdit(null)}
          done={async () => {
            setSingleEdit(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function SingleTransactionModal({
  row,
  wallets,
  close,
  done,
}: {
  row: Tx;
  wallets: Wallet[];
  close: () => void;
  done: () => Promise<void>;
}) {
  const notify = useNotifications(),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await request("/api/finance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updateTransaction",
          id: row.transaction.id,
          description: f.get("description"),
          walletId: f.get("walletId"),
          consumptionDate: f.get("consumptionDate"),
          competence: `${f.get("competence")}-01`,
          type: f.get("type"),
        }),
      });
      notify("success", "Lançamento atualizado.");
      await done();
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao atualizar lançamento.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="confirm-modal edit-modal"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">EDITAR LANÇAMENTO</p>
        <h2>{row.transaction.description}</h2>
        <label className="field">
          <span>Descrição</span>
          <input
            name="description"
            defaultValue={row.transaction.description}
            required
          />
        </label>
        <label className="field">
          <span>Carteira</span>
          <select name="walletId" defaultValue={row.transaction.walletId}>
            {wallets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Data</span>
            <input
              name="consumptionDate"
              type="date"
              defaultValue={row.transaction.consumptionDate}
              required
            />
          </label>
          <label className="field">
            <span>Competência</span>
            <input
              name="competence"
              type="month"
              defaultValue={row.transaction.competence.slice(0, 7)}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Tipo</span>
          <select
            name="type"
            defaultValue={
              row.transaction.amountCents < 0 ? "EXPENSE" : "INCOME"
            }
          >
            <option value="EXPENSE">Saída</option>
            <option value="INCOME">Entrada</option>
          </select>
        </label>
        <div className="confirm-actions">
          <button type="button" className="cancel-button" onClick={close}>
            Cancelar
          </button>
          <button className="action-button modal-save" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InstallmentModal({
  row,
  wallets,
  categories,
  close,
  done,
}: {
  row: Tx;
  wallets: Wallet[];
  categories: Category[];
  close: () => void;
  done: () => Promise<void>;
}) {
  const notify = useNotifications(),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      mode = String(f.get("mode"));
    if (
      mode === "CANCEL" &&
      !confirm("Cancelar as parcelas no escopo selecionado?")
    )
      return;
    setBusy(true);
    try {
      await post({
        action: "changeInstallments",
        transactionId: row.transaction.id,
        scope: f.get("scope"),
        mode,
        description: f.get("description"),
        walletId: f.get("walletId"),
        categoryId: f.get("categoryId") || null,
        type: f.get("type"),
        totalAmountCents:
          mode === "EDIT" && f.get("total")
            ? parseMoneyToCents(String(f.get("total")))
            : undefined,
      });
      notify(
        "success",
        mode === "EDIT" ? "Parcelas atualizadas." : "Parcelas canceladas.",
      );
      await done();
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao alterar parcelas.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="confirm-modal edit-modal"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">COMPRA PARCELADA</p>
        <h2>{row.transaction.description}</h2>
        <div className="form-grid">
          <label className="field">
            <span>Aplicar em</span>
            <select name="scope">
              <option value="THIS">Somente esta</option>
              <option value="FUTURE">Esta e próximas</option>
              <option value="ALL">Todas as parcelas</option>
            </select>
          </label>
          <label className="field">
            <span>Ação</span>
            <select name="mode">
              <option value="EDIT">Editar e redistribuir</option>
              <option value="CANCEL">Cancelar</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Descrição</span>
          <input
            name="description"
            defaultValue={row.transaction.description}
          />
        </label>
        <label className="field">
          <span>Novo total do escopo (opcional)</span>
          <input name="total" inputMode="decimal" />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Carteira</span>
            <select name="walletId" defaultValue={row.transaction.walletId}>
              {wallets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Categoria</span>
            <select name="categoryId">
              <option value="">Sem categoria</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Tipo</span>
          <select
            name="type"
            defaultValue={
              row.transaction.amountCents < 0 ? "EXPENSE" : "INCOME"
            }
          >
            <option value="EXPENSE">Saída</option>
            <option value="INCOME">Entrada</option>
          </select>
        </label>
        <div className="confirm-actions">
          <button type="button" className="cancel-button" onClick={close}>
            Fechar
          </button>
          <button className="action-button modal-save" disabled={busy}>
            {busy ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function RecurringManager({
  wallets,
  categories,
  competence,
  visible,
}: Options) {
  const notify = useNotifications(),
    [rows, setRows] = useState<RecurringRow[]>([]),
    [busy, setBusy] = useState(true),
    [editing, setEditing] = useState<RecurringRow | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await request("/api/advanced?mode=recurring"));
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao carregar recorrências.",
      );
    } finally {
      setBusy(false);
    }
  }, [notify]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  async function state(id: string, next: string) {
    try {
      await post({
        action: "setRecurringState",
        id,
        state: next,
        fromCompetence: competence,
      });
      notify("success", "Recorrência atualizada.");
      await load();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Erro ao atualizar.");
    }
  }
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">REGRAS MENSAIS</p>
            <h2>Recorrências ativas e encerradas</h2>
          </div>
          <RefreshButton onRefresh={load} />
        </div>
        {busy ? (
          <LoadingState label="Carregando recorrências…" />
        ) : (
          <div className="advanced-list">
            {rows.map((x) => (
              <article className="advanced-row" key={x.rule.id}>
                <div>
                  <b>{x.rule.description}</b>
                  <small>
                    {x.rule.active
                      ? x.rule.paused
                        ? "Pausada"
                        : "Ativa"
                      : "Encerrada"}{" "}
                    · {x.categoryName ?? "Sem categoria"} ·{" "}
                    {x.walletName ?? "Carteira definida ao faturar"}
                  </small>
                </div>
                <strong
                  className={
                    x.rule.defaultAmountCents < 0 ? "negative" : "positive"
                  }
                >
                  {cash(x.rule.defaultAmountCents, visible)}
                </strong>
                <div className="row-actions">
                  <button className="text-button" onClick={() => setEditing(x)}>
                    Editar
                  </button>
                  {x.rule.active && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void state(
                          x.rule.id,
                          x.rule.paused ? "ACTIVE" : "PAUSED",
                        )
                      }
                    >
                      {x.rule.paused ? "Retomar" : "Pausar"}
                    </button>
                  )}
                  {x.rule.active && (
                    <button
                      className="delete-rule-button"
                      onClick={() => void state(x.rule.id, "ENDED")}
                    >
                      Encerrar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {editing && (
        <RecurringModal
          item={editing}
          wallets={wallets}
          categories={categories}
          competence={competence}
          close={() => setEditing(null)}
          done={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
function RecurringModal({
  item,
  wallets,
  categories,
  competence,
  close,
  done,
}: {
  item: RecurringRow;
  wallets: Wallet[];
  categories: Category[];
  competence: string;
  close: () => void;
  done: () => Promise<void>;
}) {
  const notify = useNotifications(),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await post({
        action: "updateRecurring",
        id: item.rule.id,
        description: f.get("description"),
        amountCents: parseMoneyToCents(String(f.get("amount"))),
        type: f.get("type"),
        categoryId: f.get("categoryId") || null,
        walletId: f.get("walletId") || null,
        startCompetence: `${f.get("startCompetence")}-01`,
        endCompetence: f.get("endCompetence")
          ? `${f.get("endCompetence")}-01`
          : null,
        fromCompetence: competence,
      });
      notify("success", "Recorrência e ocorrências futuras atualizadas.");
      await done();
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao editar recorrência.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="confirm-modal edit-modal"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">ALTERAÇÕES FUTURAS</p>
        <h2>Editar recorrência</h2>
        <label className="field">
          <span>Descrição</span>
          <input
            name="description"
            defaultValue={item.rule.description}
            required
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Valor</span>
            <input
              name="amount"
              defaultValue={(Math.abs(item.rule.defaultAmountCents) / 100)
                .toFixed(2)
                .replace(".", ",")}
              required
            />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select name="type" defaultValue={item.rule.type}>
              <option value="EXPENSE">Saída</option>
              <option value="INCOME">Entrada</option>
            </select>
          </label>
          <label className="field">
            <span>Carteira padrão</span>
            <select
              name="walletId"
              defaultValue={item.rule.defaultWalletId ?? ""}
            >
              <option value="">Definir ao faturar</option>
              {wallets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Categoria</span>
            <select name="categoryId" defaultValue={item.rule.categoryId ?? ""}>
              <option value="">Sem categoria</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Início</span>
            <input
              name="startCompetence"
              type="month"
              defaultValue={item.rule.startCompetence.slice(0, 7)}
              required
            />
          </label>
          <label className="field">
            <span>Fim opcional</span>
            <input
              name="endCompetence"
              type="month"
              defaultValue={item.rule.endCompetence?.slice(0, 7) ?? ""}
            />
          </label>
        </div>
        <div className="confirm-actions">
          <button type="button" className="cancel-button" onClick={close}>
            Cancelar
          </button>
          <button className="action-button modal-save" disabled={busy}>
            {busy ? "Salvando…" : "Aplicar ao futuro"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ReportsPanel({ categories, competence, visible }: Options) {
  const notify = useNotifications(),
    [from, setFrom] = useState(`${Number(competence.slice(0, 4)) - 1}-01`),
    [to, setTo] = useState(competence.slice(0, 7)),
    [data, setData] = useState<ReportData | null>(null),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(
        await request(`/api/advanced?mode=reports&from=${from}-01&to=${to}-01`),
      );
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Erro nos relatórios.");
    } finally {
      setBusy(false);
    }
  }, [from, to, notify]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  function exportCsv() {
    const lines = [
      ["Competência", "Entradas", "Saídas", "Resultado"],
      ...(data?.monthly ?? []).map((x) => [
        x.competence,
        x.income / 100,
        x.expense / 100,
        x.net / 100,
      ]),
    ];
    const blob = new Blob([lines.map((x) => x.join(";")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RELATÓRIOS</p>
            <h2>Evolução financeira</h2>
          </div>
          <div className="heading-actions">
            <RefreshButton onRefresh={load} />
            <button className="small-button" onClick={exportCsv}>
              Exportar CSV
            </button>
          </div>
        </div>
        <div className="report-filters">
          <input
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="month"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {busy ? (
          <LoadingState label="Calculando relatórios…" />
        ) : (
          <>
            <div className="report-grid">
              <ReportCard
                title="Fluxo de caixa"
                rows={data?.monthly ?? []}
                value={(x) => x.net ?? 0}
                visible={visible}
              />
              <ReportCard
                title="Evolução patrimonial"
                rows={data?.evolution ?? []}
                value={(x) => x.balance ?? 0}
                visible={visible}
              />
              <ReportCard
                title="Despesas por categoria"
                rows={data?.byCategory ?? []}
                label={(x) => x.name ?? "Sem categoria"}
                value={(x) => x.expense ?? 0}
                visible={visible}
              />
              <ReportCard
                title="Projeção programada"
                rows={data?.projection ?? []}
                value={(x) => x.amount ?? 0}
                visible={visible}
              />
            </div>
            <section className="subpanel">
              <h3>Orçamento × realizado</h3>
              <BudgetForm
                categories={categories}
                competence={competence}
                reload={load}
              />
              {(data?.budgets ?? []).map((x) => (
                <div
                  className="budget-row"
                  key={`${x.categoryId}-${x.competence}`}
                >
                  <span>
                    {x.name} · {x.competence.slice(0, 7)}
                  </span>
                  <progress
                    max={x.budget}
                    value={Math.min(x.actual, x.budget)}
                  />
                  <b>
                    {cash(x.actual, visible)} / {cash(x.budget, visible)}
                  </b>
                </div>
              ))}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
function ReportCard({
  title,
  rows,
  value,
  label = (x) => x.competence?.slice(0, 7) ?? "",
  visible,
}: {
  title: string;
  rows: ReportDatum[];
  value: (x: ReportDatum) => number;
  label?: (x: ReportDatum) => string;
  visible: boolean;
}) {
  const max = Math.max(1, ...rows.map((x) => Math.abs(value(x))));
  return (
    <article className="report-card">
      <h3>{title}</h3>
      {rows.length ? (
        rows.slice(-12).map((x, index) => (
          <div className="bar-row" key={index}>
            <span>{label(x)}</span>
            <i
              style={{
                width: `${Math.max(3, (Math.abs(value(x)) / max) * 100)}%`,
              }}
            />
            <b>{cash(value(x), visible)}</b>
          </div>
        ))
      ) : (
        <p className="muted">Sem dados no período.</p>
      )}
    </article>
  );
}
function BudgetForm({
  categories,
  competence,
  reload,
}: {
  categories: Category[];
  competence: string;
  reload: () => Promise<void>;
}) {
  const notify = useNotifications();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await post({
        action: "setBudget",
        categoryId: f.get("categoryId"),
        competence: `${f.get("competence")}-01`,
        amountCents: parseMoneyToCents(String(f.get("amount"))),
      });
      notify("success", "Orçamento salvo.");
      await reload();
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao salvar orçamento.",
      );
    }
  }
  return (
    <form className="inline-form horizontal-form" onSubmit={submit}>
      <select name="categoryId" required>
        <option value="">Categoria</option>
        {categories
          .filter((x) => x.type !== "INCOME")
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
      </select>
      <input
        name="competence"
        type="month"
        defaultValue={competence.slice(0, 7)}
        required
      />
      <input name="amount" placeholder="Limite" required />
      <button>Salvar orçamento</button>
    </form>
  );
}

export function GoalsPanel({ visible }: Options) {
  const notify = useNotifications(),
    [rows, setRows] = useState<GoalRow[]>([]),
    [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await request("/api/advanced?mode=goals"));
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao carregar metas.",
      );
    } finally {
      setBusy(false);
    }
  }, [notify]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await post({
        action: "createGoal",
        name: f.get("name"),
        targetAmountCents: parseMoneyToCents(String(f.get("target"))),
        targetDate: f.get("date") || undefined,
      });
      notify("success", "Meta criada.");
      e.currentTarget.reset();
      await load();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Erro ao criar meta.");
    }
  }
  async function contribute(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await post({
        action: "addGoalEntry",
        goalId: id,
        amountCents:
          parseMoneyToCents(String(f.get("amount"))) *
          (f.get("kind") === "WITHDRAW" ? -1 : 1),
        date: today(),
        description: f.get("description") || "Aporte",
      });
      notify("success", "Reserva atualizada.");
      e.currentTarget.reset();
      await load();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Erro no aporte.");
    }
  }
  const reserved = rows
    .filter((x) => x.goal.active)
    .reduce((s, x) => s + x.savedCents, 0);
  return (
    <div className="page-stack">
      <section className="balance-hero mini-hero">
        <div>
          <p className="eyebrow">TOTAL RESERVADO</p>
          <strong>{cash(reserved, visible)}</strong>
        </div>
        <RefreshButton onRefresh={load} />
      </section>
      <section className="panel">
        <h2>Nova meta</h2>
        <form className="inline-form horizontal-form" onSubmit={create}>
          <input name="name" placeholder="Nome da meta" required />
          <input name="target" placeholder="Valor-alvo" required />
          <input name="date" type="date" />
          <button>Criar meta</button>
        </form>
      </section>
      {busy ? (
        <LoadingState label="Carregando metas…" />
      ) : (
        <div className="goal-grid">
          {rows.map((x) => (
            <article
              className={`panel goal-card ${x.goal.active ? "" : "goal-archived"}`}
              key={x.goal.id}
            >
              <div className="section-heading">
                <h2>{x.goal.name}</h2>
                <span>
                  {Math.min(
                    100,
                    Math.round((x.savedCents / x.goal.targetAmountCents) * 100),
                  )}
                  %
                </span>
              </div>
              <progress
                max={x.goal.targetAmountCents}
                value={Math.max(0, x.savedCents)}
              />
              <strong>
                {cash(x.savedCents, visible)} /{" "}
                {cash(x.goal.targetAmountCents, visible)}
              </strong>
              {x.goal.active && (
                <form
                  className="goal-entry"
                  onSubmit={(e) => void contribute(e, x.goal.id)}
                >
                  <input name="amount" placeholder="Valor" required />
                  <input name="description" placeholder="Descrição" />
                  <select name="kind">
                    <option value="ADD">Aporte</option>
                    <option value="WITHDRAW">Retirada</option>
                  </select>
                  <button>Registrar</button>
                </form>
              )}
              {x.goal.active && (
                <button
                  className="delete-rule-button"
                  onClick={() =>
                    void post({ action: "archiveGoal", id: x.goal.id }).then(
                      load,
                    )
                  }
                >
                  Arquivar meta
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function PendingPanel({ visible }: Options) {
  const notify = useNotifications(),
    [data, setData] = useState<PendingData | null>(null),
    [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await request("/api/advanced?mode=pending"));
    } catch (e) {
      notify(
        "error",
        e instanceof Error ? e.message : "Erro ao carregar pendências.",
      );
    } finally {
      setBusy(false);
    }
  }, [notify]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  if (busy && !data) return <LoadingState label="Revisando pendências…" />;
  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <RefreshButton onRefresh={load} />
      </div>
      <div className="pending-grid">
      <PendingGroup
        title="Programações atrasadas"
        count={data?.overdue.length ?? 0}
      >
        {data?.overdue.map((x) => (
          <div className="simple-row" key={x.id}>
            <div>
              <b>{x.description}</b>
              <span>{x.competence.slice(0, 7)}</span>
            </div>
            <strong>{cash(x.expectedAmountCents, visible)}</strong>
          </div>
        ))}
      </PendingGroup>
      <PendingGroup
        title="Sem categoria"
        count={data?.uncategorized.length ?? 0}
      >
        {data?.uncategorized.map((x) => (
          <div className="simple-row" key={x.id}>
            <div>
              <b>{x.description}</b>
              <span>{x.consumptionDate}</span>
            </div>
            <strong>{cash(x.amountCents, visible)}</strong>
          </div>
        ))}
      </PendingGroup>
      <PendingGroup
        title="Possíveis duplicidades"
        count={data?.duplicates.length ?? 0}
      >
        {data?.duplicates.map((x, index) => (
          <div className="simple-row" key={index}>
            <div>
              <b>{x.description}</b>
              <span>
                {x.consumptionDate} · {x.count} ocorrências
              </span>
            </div>
            <strong>{cash(x.amountCents, visible)}</strong>
          </div>
        ))}
      </PendingGroup>
      <PendingGroup title="Faturas em aberto" count={data?.cards.length ?? 0}>
        {data?.cards.map((x) => (
          <div className="simple-row" key={x.id}>
            <div>
              <b>{x.name}</b>
              <span>{x.dueSoon ? "Vencimento próximo" : "Em aberto"}</span>
            </div>
            <strong>{cash(Math.abs(x.balance), visible)}</strong>
          </div>
        ))}
      </PendingGroup>
      </div>
    </div>
  );
}
function PendingGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="count-badge">{count}</span>
      </div>
      {count ? children : <p className="muted">Tudo certo por aqui.</p>}
    </section>
  );
}
