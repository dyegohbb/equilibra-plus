"use client";
import {
  createContext,
  FormEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Brand } from "@/components/ui/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LoadingState } from "@/components/ui/spinner";
import { RefreshButton } from "@/components/ui/refresh-button";
import { useNotifications } from "@/components/ui/notifications";
import {
  addMonths,
  calculateInstallmentCompetences,
  calculateInstallments,
  parseMoneyToCents,
} from "@/modules/finance/domain";
import {
  AdvancedStatement,
  GoalsPanel,
  PendingPanel,
  PlanningPanel,
  RecurringManager,
  ReportsPanel,
} from "@/components/finance/advanced-panels";

type Wallet = {
  id: string;
  name: string;
  type: "CASH_ACCOUNT" | "CREDIT_CARD";
  closingDay: number | null;
  dueDay: number | null;
  active: boolean;
};
type Category = { id: string; name: string; type: string; active: boolean };
type Tx = {
  transaction: {
    id: string;
    walletId: string;
    description: string;
    amountCents: number;
    type: string;
    consumptionDate: string;
    competence: string;
    installmentNumber: number | null;
    installmentTotal: number | null;
    purchaseId: string | null;
  };
  walletName: string;
  categoryName: string | null;
};
type Scheduled = {
  entry: {
    id: string;
    scheduledRuleId: string;
    description: string;
    expectedAmountCents: number;
    competence: string;
    status: string;
  };
  categoryName: string | null;
  defaultWalletId: string | null;
};
type Data = {
  wallets: Wallet[];
  walletBalances: (Wallet & { balanceCents: number })[];
  categories: Category[];
  transactions: Tx[];
  scheduled: Scheduled[];
  categoryExpenses: { name: string; amountCents: number }[];
  summary: {
    incomeCents: number;
    expenseCents: number;
    balanceCents: number;
    pendingCents: number;
    pendingCurrentIncomeCents: number;
    pendingCurrentExpenseCents: number;
    pendingPreviousIncomeCents: number;
    pendingPreviousExpenseCents: number;
    pendingAccumulatedCents: number;
    pendingIncomeAccumulatedCents: number;
    pendingExpenseAccumulatedCents: number;
    pendingAccumulatedCount: number;
    pendingOldestCompetence: string | null;
    projectedAvailableBalanceCents: number;
    availableBalanceCents: number;
    reservedCents: number;
    unreservedBalanceCents: number;
    cardDebtCents: number;
    netWorthCents: number;
  };
  cards: (Wallet & {
    balanceCents: number;
    invoiceCents: number;
    outstandingCents: number;
  })[];
};
type Tab =
  | "dashboard"
  | "new"
  | "transactions"
  | "wallets"
  | "scheduled"
  | "cards"
  | "reports"
  | "planning"
  | "goals"
  | "pending";
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Recife",
});
const current = `${today.slice(0, 7)}-01`;
const nextCompetence = addMonths(current, 1);
const nextMonth = nextCompetence.slice(0, 7);
const comp = (v: string) => `${v.slice(5, 7)}/${v.slice(0, 4)}`;
const fmt = (v: number) => brl.format(v / 100);
const BalanceVisibilityContext = createContext(false);
const BALANCE_VISIBILITY_KEY = "equilibra:balances-visible";
const items: [Tab, string][] = [
  ["dashboard", "Início"],
  ["new", "Novo Lançamento"],
  ["transactions", "Extrato"],
  ["wallets", "Carteiras"],
  ["scheduled", "Programados"],
  ["cards", "Cartões"],
  ["reports", "Relatórios"],
  ["planning", "Planejamento"],
  ["goals", "Metas"],
  ["pending", "Pendências"],
];
const navIcons: Record<Tab, string> = {
  dashboard: "⌂",
  new: "＋",
  transactions: "≡",
  wallets: "▣",
  scheduled: "◷",
  cards: "▰",
  reports: "↗",
  planning: "⌁",
  goals: "◎",
  pending: "!",
};
const successMessages: Record<string, string> = {
  createWallet: "Carteira criada.",
  updateWallet: "Carteira atualizada.",
  createCategory: "Categoria criada.",
  updateCategory: "Categoria atualizada.",
  createPurchase: "Lançamento salvo no extrato.",
  createPurchaseBatch: "Lançamentos salvos no extrato.",
  createSchedule: "Recorrência criada.",
  billSchedule: "Programado faturado e adicionado ao extrato.",
  skipSchedule: "Programado ignorado neste mês.",
  deleteScheduleRule: "Recorrência excluída.",
  payCard: "Pagamento do cartão registrado.",
};
export function FinanceApp({
  email,
  initialTab = "dashboard",
}: {
  email: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab),
    [competence, setCompetence] = useState(nextCompetence),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [actionBusy, setActionBusy] = useState(false),
    [balancesVisible, setBalancesVisible] = useState(false);
  const notify = useNotifications();
  // Começa oculto na primeira visita e restaura apenas uma escolha explícita deste navegador.
  useEffect(() => {
    queueMicrotask(() => setBalancesVisible(window.localStorage.getItem(BALANCE_VISIBILITY_KEY) === "true"));
  }, []);
  function toggleBalances() {
    setBalancesVisible((visible) => {
      const next = !visible;
      window.localStorage.setItem(BALANCE_VISIBILITY_KEY, String(next));
      return next;
    });
  }
  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const r = await fetch(`/api/finance?competence=${competence}`, {
          cache: "no-store",
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      if (!background) setLoading(false);
    }
  }, [competence]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const refreshCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/finance?resource=categories", {
          cache: "no-store",
        }),
        result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível atualizar categorias.");
      setData((currentData) =>
        currentData
          ? { ...currentData, categories: result.categories }
          : currentData,
      );
    } catch (cause) {
      notify(
        "error",
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar categorias.",
      );
      throw cause;
    }
  }, [notify]);
  async function mutate(p: Record<string, unknown>) {
    setActionBusy(true);
    try {
      const r = await fetch("/api/finance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(p),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load(true);
      notify(
        "success",
        successMessages[String(p.action)] ?? "Alteração salva com sucesso.",
      );
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Não foi possível concluir a operação.";
      notify("error", message);
      throw e;
    } finally {
      setActionBusy(false);
    }
  }
  const wallets = data?.wallets.filter((x) => x.active) ?? [],
    categories = data?.categories.filter((x) => x.active) ?? [];
  return (
    <BalanceVisibilityContext.Provider value={balancesVisible}>
      <div className="finance-shell">
        {actionBusy && <LoadingState label="Salvando suas alterações…" />}
        {loading && <LoadingState label="Carregando seus números…" />}
        <aside className="sidebar">
          <Brand />
          <Nav tab={tab} setTab={setTab} />
          <div className="account">
            <span>{email}</span>
            <SignOutButton />
          </div>
        </aside>
        <main className="finance-main">
          <header className="app-topbar">
            <div>
              <p className="eyebrow">EQUILI.BRA+</p>
              <h1>{items.find((x) => x[0] === tab)?.[1]}</h1>
            </div>
            <div className="topbar-actions">
              <button
                className="visibility-button"
                type="button"
                onClick={toggleBalances}
                aria-pressed={balancesVisible}
                title={balancesVisible ? "Ocultar valores" : "Mostrar valores"}
              >
                <span aria-hidden="true">{balancesVisible ? "◉" : "⊘"}</span>
                {balancesVisible ? "Ocultar saldos" : "Mostrar saldos"}
              </button>
              <label>
                Competência
                <input
                  type="month"
                  value={competence.slice(0, 7)}
                  onChange={(e) => setCompetence(`${e.target.value}-01`)}
                />
              </label>
            </div>
          </header>
          <div className="mobile-nav">
            <Nav tab={tab} setTab={setTab} />
          </div>
          {error && <p className="app-alert">{error}</p>}
          {data && (
            <>
              {[
                "dashboard",
                "wallets",
                "scheduled",
                "cards",
              ].includes(tab) && (
                <div className="page-toolbar">
                  <RefreshButton onRefresh={() => load(true)} />
                </div>
              )}
              {tab === "dashboard" && <Dashboard data={data} />}{" "}
              {tab === "new" && (
                <New
                  wallets={wallets}
                  categories={categories}
                  mutate={mutate}
                  refreshCategories={refreshCategories}
                  done={() => setTab("transactions")}
                />
              )}{" "}
              {tab === "transactions" && (
                <AdvancedStatement
                  wallets={wallets}
                  categories={categories}
                  competence={competence}
                  visible={balancesVisible}
                />
              )}{" "}
              {tab === "wallets" && <Manage data={data} mutate={mutate} />}{" "}
              {tab === "scheduled" && (
                <ScheduledWorkspace
                  rows={data.scheduled}
                  wallets={wallets}
                  categories={categories}
                  competence={competence}
                  mutate={mutate}
                  visible={balancesVisible}
                />
              )}{" "}
              {tab === "cards" && (
                <Cards
                  data={data}
                  wallets={wallets}
                  competence={competence}
                  mutate={mutate}
                />
              )}{" "}
              {tab === "reports" && (
                <ReportsPanel
                  wallets={wallets}
                  categories={categories}
                  competence={competence}
                  visible={balancesVisible}
                />
              )}{" "}
              {tab === "goals" && (
                <GoalsPanel
                  wallets={wallets}
                  categories={categories}
                  competence={competence}
                  visible={balancesVisible}
                />
              )}{" "}
              {tab === "pending" && (
                <PendingPanel
                  wallets={wallets}
                  categories={categories}
                  competence={competence}
                  visible={balancesVisible}
                />
              )}
              {tab === "planning" && (
                <PlanningPanel
                  wallets={wallets}
                  categories={categories}
                  competence={competence}
                  visible={balancesVisible}
                />
              )}
            </>
          )}
        </main>
      </div>
    </BalanceVisibilityContext.Provider>
  );
}
function Nav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  function navigate(id: Tab) {
    window.history.pushState(null, "", id === "new" ? "/lancamento" : "/app");
    setTab(id);
  }
  return (
    <nav>
      {items.map(([id, label]) => (
        <button
          key={id}
          className={tab === id ? "active" : ""}
          onClick={() => navigate(id)}
        >
          <span aria-hidden="true">{navIcons[id]}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
function Dashboard({ data }: { data: Data }) {
  const s = data.summary;
  const categoryTotal = data.categoryExpenses.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );
  return (
    <div className="overview-stack">
      <section
        className={`unified-balance ${s.projectedAvailableBalanceCents < 0 ? "unified-balance-negative" : ""}`}
      >
        <div className="unified-heading">
          <div>
            <p className="eyebrow">VISÃO FINANCEIRA UNIFICADA</p>
            <div className="label-with-info">
              <h2>Saldo previsto</h2>
              <InfoTip text="Saldo atual mais entradas programadas pendentes, menos saídas programadas pendentes e menos toda a dívida aberta dos cartões." />
            </div>
          </div>
          <strong>
            <Money value={s.projectedAvailableBalanceCents} />
          </strong>
        </div>
        <div className="unified-formula unified-formula-groups">
          <OverviewTerm
            label="Saldo atual"
            value={s.availableBalanceCents}
            tip="Dinheiro disponível nas carteiras do tipo conta, acumulado até a competência selecionada. Cartões não entram neste valor."
          />
          <ProgrammedOverview
            label="Programados do mês"
            income={s.pendingCurrentIncomeCents}
            expense={s.pendingCurrentExpenseCents}
            incomeTip="Entradas programadas desta competência que continuam pendentes e serão somadas ao saldo previsto."
            expenseTip="Saídas programadas desta competência que continuam pendentes e serão descontadas do saldo previsto."
          />
          <ProgrammedOverview
            label="Programados anteriores"
            income={s.pendingPreviousIncomeCents}
            expense={s.pendingPreviousExpenseCents}
            incomeTip="Entradas de competências anteriores que ainda não foram faturadas nem ignoradas."
            expenseTip="Saídas de competências anteriores que ainda não foram faturadas nem ignoradas."
          />
          <OverviewTerm
            label="Total dos cartões"
            value={s.cardDebtCents}
            tip="Soma de tudo que ainda está em aberto nos cartões de crédito até a competência selecionada."
            expense
          />
        </div>
      </section>
      <section className="panel category-overview">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SAÍDAS POR CATEGORIA</p>
            <div className="label-with-info">
              <h2>Onde o dinheiro foi usado</h2>
              <InfoTip text="Distribuição dos lançamentos de saída já realizados na competência selecionada. Programações ainda pendentes não aparecem aqui." />
            </div>
          </div>
          <strong><Money value={categoryTotal} /></strong>
        </div>
        {data.categoryExpenses.length ? (
          <div className="category-breakdown">
            {data.categoryExpenses.map((item) => (
              <div className="category-value" key={item.name}>
                <div>
                  <span>{item.name}</span>
                  <b><Money value={item.amountCents} /></b>
                </div>
                <span className="category-track">
                  <i
                    style={{
                      width: `${categoryTotal ? Math.max(3, (item.amountCents / categoryTotal) * 100) : 0}%`,
                    }}
                  />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Nenhuma saída realizada nesta competência." />
        )}
      </section>
    </div>
  );
}
function ProgrammedOverview({
  label,
  income,
  expense,
  incomeTip,
  expenseTip,
}: {
  label: string;
  income: number;
  expense: number;
  incomeTip: string;
  expenseTip: string;
}) {
  return (
    <article className="overview-term programmed-overview">
      <h3>{label}</h3>
      <div className="programmed-value programmed-income">
        <div className="label-with-info">
          <span>Entradas</span>
          <InfoTip text={incomeTip} />
        </div>
        <strong>+ <Money value={income} /></strong>
      </div>
      <div className="programmed-value programmed-expense">
        <div className="label-with-info">
          <span>Saídas</span>
          <InfoTip text={expenseTip} />
        </div>
        <strong>− <Money value={expense} /></strong>
      </div>
    </article>
  );
}
function OverviewTerm({
  label,
  value,
  tip,
  expense = false,
}: {
  label: string;
  value: number;
  tip: string;
  expense?: boolean;
}) {
  return (
    <article className={`overview-term ${expense ? "overview-expense" : ""}`}>
      <div className="label-with-info">
        <span>{label}</span>
        <InfoTip text={tip} />
      </div>
      <strong><Money value={value} prefix={expense ? "− " : ""} /></strong>
    </article>
  );
}
function New({
  wallets,
  categories,
  mutate,
  refreshCategories,
  done,
}: {
  wallets: Wallet[];
  categories: Category[];
  mutate: (p: Record<string, unknown>) => Promise<void>;
  refreshCategories: () => Promise<void>;
  done: () => void;
}) {
  type QueuedPurchase = {
    localId: string;
    description: string;
    amountCents: number;
    type: "INCOME" | "EXPENSE";
    walletId: string;
    categoryId?: string;
    consumptionDate: string;
    competence: string;
    mode: "CASH" | "INSTALLMENT_VALUE" | "TOTAL_VALUE";
    quantity?: number;
  };
  const notify = useNotifications();
  const [wid, setWid] = useState(wallets[0]?.id ?? ""),
    [kind, setKind] = useState<"INCOME" | "EXPENSE">("EXPENSE"),
    [mode, setMode] = useState<"CASH" | "INSTALLMENT_VALUE" | "TOTAL_VALUE">(
      "CASH",
    ),
    [amount, setAmount] = useState(""),
    [qty, setQty] = useState(2),
    [date, setDate] = useState(today),
    [purchaseCompetence, setPurchaseCompetence] = useState(nextMonth),
    [queue, setQueue] = useState<QueuedPurchase[]>([]),
    [error, setError] = useState(""),
    [categoryBusy, setCategoryBusy] = useState(false),
    [categoryOpen, setCategoryOpen] = useState(false);
  const preview = useMemo(() => {
    try {
      return mode === "CASH" || !amount
        ? []
        : calculateInstallments(mode, parseMoneyToCents(amount), qty).map(
            (v, i) => ({
              v,
              c: calculateInstallmentCompetences(
                `${purchaseCompetence}-01`,
                qty,
              )[i],
            }),
          );
    } catch {
      return [];
    }
  }, [mode, amount, qty, purchaseCompetence]);
  function addToQueue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const description = String(f.get("description") ?? "").trim();
      if (!description) throw new Error("Informe a descrição.");
      const purchase: QueuedPurchase = {
        localId: crypto.randomUUID(),
        description,
        amountCents: parseMoneyToCents(amount),
        type: kind,
        walletId: wid,
        categoryId: String(f.get("categoryId") || "") || undefined,
        consumptionDate: date,
        competence: `${purchaseCompetence}-01`,
        mode,
        quantity: mode === "CASH" ? undefined : qty,
      };
      setQueue((items) => [...items, purchase]);
      setAmount("");
      const descriptionInput = e.currentTarget.querySelector<HTMLInputElement>(
        'input[name="description"]',
      );
      if (descriptionInput) {
        descriptionInput.value = "";
        descriptionInput.focus();
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar.");
    }
  }
  async function saveQueue() {
    if (!queue.length) return;
    try {
      await mutate({
        action: "createPurchaseBatch",
        purchases: queue.map((item) => ({
          description: item.description,
          amountCents: item.amountCents,
          type: item.type,
          walletId: item.walletId,
          categoryId: item.categoryId,
          consumptionDate: item.consumptionDate,
          competence: item.competence,
          mode: item.mode,
          quantity: item.quantity,
        })),
      });
      setQueue([]);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }
  async function createCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCategoryBusy(true);
    try {
      const response = await fetch("/api/finance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "createCategory",
            name: f.get("name"),
            type: f.get("type"),
          }),
        }),
        result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível criar a categoria.");
      await refreshCategories();
      notify("success", "Categoria criada.");
      setCategoryOpen(false);
    } catch (cause) {
      notify(
        "error",
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a categoria.",
      );
    } finally {
      setCategoryBusy(false);
    }
  }
  if (!wallets.length) return <Empty text="Cadastre primeiro uma carteira." />;
  return (
    <>
      <form className="panel form-panel" onSubmit={addToQueue}>
        <div className="segmented">
          <button
            type="button"
            className={kind === "EXPENSE" ? "active" : ""}
            onClick={() => setKind("EXPENSE")}
          >
            Saída
          </button>
          <button
            type="button"
            className={kind === "INCOME" ? "active" : ""}
            onClick={() => setKind("INCOME")}
          >
            Entrada
          </button>
        </div>
        <div className="form-grid">
          <Field label="Descrição">
            <input name="description" required placeholder="Ex.: Mercado" />
          </Field>
          <Field label="Valor">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              required
              placeholder="0,00"
            />
          </Field>
          <Field label="Carteira">
            <select value={wid} onChange={(e) => setWid(e.target.value)}>
              {wallets.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoria">
            <div className="select-with-action">
              <select name="categoryId">
                <option value="">Sem categoria</option>
                {categories.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <div className="category-inline-actions">
                <button
                  type="button"
                  className="category-add-button"
                  onClick={() => setCategoryOpen(true)}
                  aria-label="Criar uma categoria"
                >
                  ＋
                </button>
                <RefreshButton onRefresh={refreshCategories} compact />
              </div>
            </div>
          </Field>
          <Field label="Data de consumo">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Forma">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="CASH">À vista</option>
              <option value="INSTALLMENT_VALUE">Valor da parcela</option>
              <option value="TOTAL_VALUE">Valor total</option>
            </select>
          </Field>
          {mode !== "CASH" && (
            <Field label="Parcelas">
              <input
                type="number"
                min="2"
                max="120"
                value={qty}
                onChange={(e) => setQty(+e.target.value)}
              />
            </Field>
          )}
          <Field label="Competência">
            <input
              type="month"
              value={purchaseCompetence}
              onChange={(e) => setPurchaseCompetence(e.target.value)}
              required
            />
          </Field>
        </div>
        {preview.length > 0 && (
          <div className="preview">
            {preview.map((x, i) => (
              <span key={i}>
                {i + 1}/{preview.length} <b>{fmt(x.v)}</b>{" "}
                <small>{comp(x.c)}</small>
              </span>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button className="action-button">Adicionar à lista</button>
      </form>
      <section className="panel form-panel purchase-queue">
        <div className="section-heading">
          <h2>Lançamentos a salvar</h2>
          <span className="count-badge">{queue.length}</span>
        </div>
        {queue.length === 0 ? (
          <Empty text="Adicione lançamentos para montar a lista." />
        ) : (
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Carteira</th>
                  <th>Categoria</th>
                  <th>Competência</th>
                  <th>Valor</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.localId}>
                    <td>{item.description}</td>
                    <td>{item.type === "EXPENSE" ? "Saída" : "Entrada"}</td>
                    <td>{wallets.find((x) => x.id === item.walletId)?.name}</td>
                    <td>
                      {categories.find((x) => x.id === item.categoryId)?.name ??
                        "Sem categoria"}
                    </td>
                    <td>{comp(item.competence)}</td>
                    <td className={item.type === "EXPENSE" ? "negative" : "positive"}>
                      {fmt(item.amountCents)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="queue-remove"
                        onClick={() =>
                          setQueue((items) =>
                            items.filter((x) => x.localId !== item.localId),
                          )
                        }
                        aria-label={`Remover ${item.description} da lista`}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          type="button"
          className="action-button queue-save"
          disabled={!queue.length}
          onClick={() => void saveQueue()}
        >
          Salvar {queue.length} {queue.length === 1 ? "lançamento" : "lançamentos"}
        </button>
      </section>
      {categoryOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setCategoryOpen(false)}
        >
          <form
            className="confirm-modal edit-modal category-modal"
            onSubmit={createCategory}
            onMouseDown={(e) => e.stopPropagation()}
            aria-labelledby="category-title"
          >
            <p className="eyebrow">NOVA CATEGORIA</p>
            <h2 id="category-title">Adicionar categoria</h2>
            <Field label="Nome">
              <input name="name" required autoFocus maxLength={60} />
            </Field>
            <Field label="Uso">
              <select
                name="type"
                defaultValue={kind === "EXPENSE" ? "EXPENSE" : "INCOME"}
              >
                <option value="EXPENSE">Saídas</option>
                <option value="INCOME">Entradas</option>
                <option value="BOTH">Entradas e saídas</option>
              </select>
            </Field>
            <div className="confirm-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setCategoryOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="action-button modal-save"
                disabled={categoryBusy}
              >
                {categoryBusy ? (
                  <LoadingState label="Criando categoria…" />
                ) : (
                  "Criar categoria"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
// Mantido temporariamente para compatibilidade com o editor individual durante a migração do extrato.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Statement({ rows }: { rows: Tx[] }) {
  const [q, setQ] = useState(""),
    [removing, setRemoving] = useState<Tx | null>(null),
    [editing, setEditing] = useState<Tx | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const notify = useNotifications();
  const walletOptions = Array.from(
    new Map(
      rows.map((row) => [row.transaction.walletId, row.walletName]),
    ).entries(),
  );
  async function request(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/finance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      notify(
        "success",
        payload.action === "removeTransaction"
          ? "Lançamento removido do extrato."
          : "Lançamento atualizado.",
      );
      window.setTimeout(() => window.location.reload(), 650);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Não foi possível concluir a operação.";
      setError(message);
      notify("error", message);
      setBusy(false);
    }
  }
  function close() {
    if (!busy) {
      setRemoving(null);
      setEditing(null);
      setError("");
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    await request({
      action: "updateTransaction",
      id: editing.transaction.id,
      description: f.get("description"),
      walletId: f.get("walletId"),
      consumptionDate: f.get("consumptionDate"),
      competence: `${f.get("competence")}-01`,
      type: f.get("type"),
    });
  }
  return (
    <>
      <Panel title="Extrato confirmado">
        <input
          className="search"
          placeholder="Buscar descrição…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <TxList
          rows={rows.filter((x) =>
            x.transaction.description.toLowerCase().includes(q.toLowerCase()),
          )}
          onRemove={setRemoving}
          onEdit={setEditing}
        />
      </Panel>
      {removing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={close}>
          <section
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="warning-icon" aria-hidden="true">
              !
            </span>
            <p className="eyebrow">CONFIRMAR EXCLUSÃO</p>
            <h2 id="remove-title">Remover do extrato?</h2>
            <p>
              O lançamento <strong>{removing.transaction.description}</strong>,
              no valor de{" "}
              <strong>{fmt(removing.transaction.amountCents)}</strong>, deixará
              de aparecer no extrato e nos totais.
            </p>
            {removing.transaction.type === "CARD_PAYMENT" && (
              <p className="modal-note">
                As duas movimentações vinculadas serão removidas juntas.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="confirm-actions">
              <button className="cancel-button" disabled={busy} onClick={close}>
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() =>
                  void request({
                    action: "removeTransaction",
                    id: removing.transaction.id,
                  })
                }
              >
                {busy ? (
                  <LoadingState label="Removendo lançamento…" />
                ) : (
                  "Sim, remover"
                )}
              </button>
            </div>
          </section>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={close}>
          <form
            className="confirm-modal edit-modal"
            onSubmit={save}
            onMouseDown={(e) => e.stopPropagation()}
            aria-labelledby="edit-title"
          >
            <p className="eyebrow">EDITAR LANÇAMENTO</p>
            <h2 id="edit-title">Ajustar movimentação</h2>
            <Field label="Descrição">
              <input
                name="description"
                defaultValue={editing.transaction.description}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Carteira">
              <select
                name="walletId"
                defaultValue={editing.transaction.walletId}
              >
                {walletOptions.map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Data">
                <input
                  name="consumptionDate"
                  type="date"
                  defaultValue={editing.transaction.consumptionDate}
                  required
                />
              </Field>
              <Field label="Competência">
                <input
                  name="competence"
                  type="month"
                  defaultValue={editing.transaction.competence.slice(0, 7)}
                  required
                />
              </Field>
            </div>
            <Field label="Tipo">
              <select
                name="type"
                defaultValue={
                  editing.transaction.amountCents < 0 ? "EXPENSE" : "INCOME"
                }
              >
                <option value="EXPENSE">Saída</option>
                <option value="INCOME">Entrada</option>
              </select>
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="cancel-button"
                disabled={busy}
                onClick={close}
              >
                Cancelar
              </button>
              <button className="action-button modal-save" disabled={busy}>
                {busy ? (
                  <LoadingState label="Salvando alterações…" />
                ) : (
                  "Salvar alterações"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
function TxList({
  rows,
  onRemove,
  onEdit,
}: {
  rows: Tx[];
  onRemove?: (row: Tx) => void;
  onEdit?: (row: Tx) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return rows.length ? (
    <div>
      {rows.map((x) => (
        <article className="tx-row" key={x.transaction.id}>
          <span className={x.transaction.amountCents >= 0 ? "in" : "out"}>
            {x.transaction.amountCents >= 0 ? "↗" : "↘"}
          </span>
          <div>
            <b>
              {x.transaction.description}
              {x.transaction.installmentNumber
                ? ` · ${x.transaction.installmentNumber}/${x.transaction.installmentTotal}`
                : ""}
            </b>
            <small>
              {x.transaction.consumptionDate.split("-").reverse().join("/")} ·{" "}
              {x.walletName}
              {x.categoryName ? ` · ${x.categoryName}` : ""}
            </small>
          </div>
          <div>
            <strong>
              <Money value={x.transaction.amountCents} />
            </strong>
            <small>{comp(x.transaction.competence)}</small>
          </div>
          {onRemove && (
            <div className="row-menu">
              <button
                className="more-button"
                aria-label={`Ações para ${x.transaction.description}`}
                aria-expanded={open === x.transaction.id}
                onClick={() =>
                  setOpen(open === x.transaction.id ? null : x.transaction.id)
                }
              >
                •••
              </button>
              {open === x.transaction.id && (
                <div className="menu-popover">
                  {onEdit &&
                    !["CARD_PAYMENT", "TRANSFER"].includes(
                      x.transaction.type,
                    ) && (
                      <button
                        onClick={() => {
                          setOpen(null);
                          onEdit(x);
                        }}
                      >
                        Editar
                      </button>
                    )}
                  <button
                    className="menu-remove"
                    onClick={() => {
                      setOpen(null);
                      onRemove(x);
                    }}
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  ) : (
    <Empty />
  );
}
function Manage({
  data,
  mutate,
}: {
  data: Data;
  mutate: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [card, setCard] = useState(false);
  async function wallet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await mutate({
      action: "createWallet",
      name: f.get("name"),
      type: card ? "CREDIT_CARD" : "CASH_ACCOUNT",
      closingDay: card ? +String(f.get("closing")) : undefined,
      dueDay: card ? +String(f.get("due")) : undefined,
      initialBalanceCents: f.get("initialBalance")
        ? parseMoneyToCents(String(f.get("initialBalance"))) *
          (f.get("initialKind") === "DEBT" ? -1 : 1)
        : 0,
    });
    e.currentTarget.reset();
  }
  async function adjust(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await mutate({
      action: "adjustWallet",
      walletId: f.get("walletId"),
      amountCents:
        parseMoneyToCents(String(f.get("amount"))) *
        (f.get("direction") === "REMOVE" ? -1 : 1),
      description: f.get("description") || "Ajuste de saldo",
      date: f.get("date"),
    });
    e.currentTarget.reset();
  }
  async function category(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await mutate({
      action: "createCategory",
      name: f.get("name"),
      type: f.get("type"),
    });
    e.currentTarget.reset();
  }
  return (
    <div className="two-columns">
      <Panel title="Carteiras">
        <form className="inline-form" onSubmit={wallet}>
          <input name="name" required placeholder="Nome" />
          <select
            value={card ? "card" : "cash"}
            onChange={(e) => setCard(e.target.value === "card")}
          >
            <option value="cash">Conta normal</option>
            <option value="card">Cartão</option>
          </select>
          <input
            name="initialBalance"
            inputMode="decimal"
            placeholder="Saldo inicial (opcional)"
          />
          <select name="initialKind">
            <option value="BALANCE">Saldo positivo</option>
            <option value="DEBT">Saldo devedor</option>
          </select>
          {card && (
            <>
              <input
                name="closing"
                type="number"
                min="1"
                max="31"
                required
                placeholder="Fecha"
              />
              <input
                name="due"
                type="number"
                min="1"
                max="31"
                required
                placeholder="Vence"
              />
            </>
          )}
          <button>Adicionar</button>
        </form>
        <h3 className="form-subtitle">Ajuste auditável</h3>
        <form className="inline-form" onSubmit={adjust}>
          <select name="walletId" required>
            {data.wallets
              .filter((x) => x.active)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
          <input
            name="amount"
            inputMode="decimal"
            placeholder="Valor"
            required
          />
          <select name="direction">
            <option value="ADD">Adicionar saldo</option>
            <option value="REMOVE">Remover saldo</option>
          </select>
          <input name="description" placeholder="Motivo do ajuste" />
          <input name="date" type="date" defaultValue={today} required />
          <button>Ajustar saldo</button>
        </form>
        {data.wallets.map((x) => (
          <ManageRow
            key={x.id}
            title={x.name}
            subtitle={
              x.type === "CREDIT_CARD"
                ? `Cartão · fecha ${x.closingDay} · vence ${x.dueDay}`
                : "Conta normal"
            }
            active={x.active}
            action={() =>
              mutate({ action: "updateWallet", id: x.id, active: !x.active })
            }
          />
        ))}
      </Panel>
      <Panel title="Categorias">
        <form className="inline-form" onSubmit={category}>
          <input name="name" required placeholder="Nome" />
          <select name="type">
            <option value="BOTH">Entrada e saída</option>
            <option value="EXPENSE">Saída</option>
            <option value="INCOME">Entrada</option>
          </select>
          <button>Adicionar</button>
        </form>
        {data.categories.map((x) => (
          <ManageRow
            key={x.id}
            title={x.name}
            subtitle={x.type}
            active={x.active}
            action={() =>
              mutate({ action: "updateCategory", id: x.id, active: !x.active })
            }
          />
        ))}
      </Panel>
    </div>
  );
}
function ManageRow({
  title,
  subtitle,
  active,
  action,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  action: () => void;
}) {
  return (
    <div className="simple-row">
      <div>
        <b>{title}</b>
        <span>{subtitle}</span>
      </div>
      <button className="text-button" onClick={action}>
        {active ? "Desativar" : "Reativar"}
      </button>
    </div>
  );
}
function ScheduledWorkspace({
  rows,
  wallets,
  categories,
  competence,
  mutate,
  visible,
}: {
  rows: Scheduled[];
  wallets: Wallet[];
  categories: Category[];
  competence: string;
  mutate: (p: Record<string, unknown>) => Promise<void>;
  visible: boolean;
}) {
  const [view, setView] = useState<"pending" | "recurring">("pending");
  return (
    <div className="scheduled-workspace">
      <div className="scheduled-tabs" role="tablist" aria-label="Programados">
        <button
          role="tab"
          aria-selected={view === "pending"}
          className={view === "pending" ? "active" : ""}
          onClick={() => setView("pending")}
        >
          Pendentes da competência
          <span>{rows.filter((x) => x.entry.status === "PENDING").length}</span>
        </button>
        <button
          role="tab"
          aria-selected={view === "recurring"}
          className={view === "recurring" ? "active" : ""}
          onClick={() => setView("recurring")}
        >
          Todas as recorrências
        </button>
      </div>
      {view === "pending" ? (
        <Schedules
          rows={rows}
          wallets={wallets}
          categories={categories}
          competence={competence}
          mutate={mutate}
        />
      ) : (
        <RecurringManager
          wallets={wallets}
          categories={categories}
          competence={competence}
          visible={visible}
        />
      )}
    </div>
  );
}
function Schedules({
  rows,
  wallets,
  categories,
  competence,
  mutate,
}: {
  rows: Scheduled[];
  wallets: Wallet[];
  categories: Category[];
  competence: string;
  mutate: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState<Scheduled | null>(null),
    [billing, setBilling] = useState<Scheduled | null>(null),
    [hasEnd, setHasEnd] = useState(false),
    [autoBill, setAutoBill] = useState(false),
    [autoBillDay, setAutoBillDay] = useState(10),
    [startCompetence, setStartCompetence] = useState(competence.slice(0, 7)),
    [endCompetence, setEndCompetence] = useState(nextMonth);
  const notify = useNotifications();
  const pendingRows = rows.filter((x) => x.entry.status === "PENDING");
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await mutate({
        action: "createSchedule",
        description: f.get("description"),
        amountCents: parseMoneyToCents(String(f.get("amount"))),
        type: f.get("type"),
        categoryId: f.get("categoryId") || undefined,
        walletId: f.get("walletId") || undefined,
        autoBillEnabled: autoBill,
        autoBillDay,
        startCompetence: `${startCompetence}-01`,
        endCompetence: hasEnd ? `${endCompetence}-01` : undefined,
      });
      e.currentTarget.reset();
      setHasEnd(false);
      setAutoBill(false);
    } catch {}
  }
  function openBill(x: Scheduled) {
    if (!wallets.length) {
      notify("error", "Cadastre uma carteira antes de faturar um programado.");
      return;
    }
    setBilling(x);
  }
  async function bill(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!billing) return;
    const f = new FormData(e.currentTarget);
    try {
      await mutate({
        action: "billSchedule",
        id: billing.entry.id,
        walletId: f.get("walletId"),
        amountCents: parseMoneyToCents(String(f.get("amount"))),
        consumptionDate: f.get("date"),
      });
      setBilling(null);
    } catch {}
  }
  return (
    <>
      <div className="page-stack">
        <Panel title="Nova programação mensal">
          <form className="schedule-form" onSubmit={create}>
            <div className="form-grid">
              <Field label="Descrição">
                <input
                  name="description"
                  required
                  placeholder="Ex.: Aluguel"
                  maxLength={120}
                />
              </Field>
              <Field label="Valor mensal">
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                />
              </Field>
              <Field label="Tipo">
                <select name="type">
                  <option value="EXPENSE">Saída</option>
                  <option value="INCOME">Entrada</option>
                </select>
              </Field>
              <Field label="Categoria">
                <select name="categoryId">
                  <option value="">Sem categoria</option>
                  {categories.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Carteira padrão">
                <select name="walletId" required={autoBill}>
                  <option value="">Definir somente ao faturar</option>
                  {wallets.map((wallet) => (
                    <option value={wallet.id} key={wallet.id}>
                      {wallet.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Competência inicial">
                <input
                  type="month"
                  value={startCompetence}
                  onChange={(event) => {
                    const next = event.target.value;
                    setStartCompetence(next);
                    if (endCompetence < next) setEndCompetence(next);
                  }}
                  required
                />
              </Field>
            </div>
            <div className="schedule-period">
              <label className="schedule-end-toggle">
                <input
                  type="checkbox"
                  checked={hasEnd}
                  onChange={(event) => setHasEnd(event.target.checked)}
                />
                <span aria-hidden="true" />
                <b>Definir uma competência final</b>
              </label>
              {hasEnd && (
                <Field label="Competência final">
                  <input
                    type="month"
                    min={startCompetence}
                    value={endCompetence}
                    onChange={(event) => setEndCompetence(event.target.value)}
                    required
                  />
                </Field>
              )}
            </div>
            <div className="schedule-automation-settings">
              <div className="schedule-setting-heading">
                <div>
                  <strong>Faturamento automático</strong>
                  <InfoTip text="Na data escolhida, a ocorrência pendente é lançada automaticamente na carteira padrão. Pode ser ligado ou desligado individualmente em cada recorrência." />
                </div>
                <label className="schedule-end-toggle">
                  <input
                    type="checkbox"
                    checked={autoBill}
                    onChange={(event) => setAutoBill(event.target.checked)}
                  />
                  <span aria-hidden="true" />
                  <b>{autoBill ? "Ativado" : "Desativado"}</b>
                </label>
              </div>
              {autoBill && (
                <Field label="Dia do faturamento automático">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={autoBillDay}
                    onChange={(event) => setAutoBillDay(Number(event.target.value))}
                    required
                  />
                </Field>
              )}
            </div>
            <button className="action-button">Criar programação</button>
          </form>
        </Panel>
        <Panel title={`Pendentes · ${comp(competence)}`}>
          <div className="scheduled-list">
            {pendingRows.map((x) => (
              <div className="simple-row scheduled-item" key={x.entry.id}>
                <div>
                  <b>{x.entry.description}</b>
                  <span>{x.categoryName ?? "Sem categoria"}</span>
                </div>
                <strong
                  className={
                    x.entry.expectedAmountCents < 0 ? "negative" : "positive"
                  }
                >
                  {fmt(x.entry.expectedAmountCents)}
                </strong>
                <div className="scheduled-actions">
                  <button className="small-button" onClick={() => openBill(x)}>
                    Faturar
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      void mutate({
                        action: "skipSchedule",
                        id: x.entry.id,
                      }).catch(() => undefined)
                    }
                  >
                    Ignorar este mês
                  </button>
                  <button
                    className="delete-rule-button"
                    onClick={() => setDeleting(x)}
                  >
                    Excluir recorrência
                  </button>
                </div>
              </div>
            ))}
            {!pendingRows.length && (
              <Empty text="Nenhuma programação pendente nesta competência." />
            )}
          </div>
        </Panel>
      </div>
      {billing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setBilling(null)}
        >
          <form
            className="confirm-modal billing-modal"
            onSubmit={bill}
            onMouseDown={(e) => e.stopPropagation()}
            aria-labelledby="billing-title"
          >
            <p className="eyebrow">FATURAR PROGRAMADO</p>
            <h2 id="billing-title">{billing.entry.description}</h2>
            <p>
              Confirme os dados reais antes de inserir este item no extrato.
            </p>
            <Field label="Carteira">
              <select
                name="walletId"
                defaultValue={billing.defaultWalletId ?? wallets[0]?.id}
                required
              >
                {wallets.map((wallet) => (
                  <option value={wallet.id} key={wallet.id}>
                    {wallet.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Valor real">
                <input
                  name="amount"
                  inputMode="decimal"
                  defaultValue={(
                    Math.abs(billing.entry.expectedAmountCents) / 100
                  )
                    .toFixed(2)
                    .replace(".", ",")}
                  required
                />
              </Field>
              <Field label="Data real">
                <input name="date" type="date" defaultValue={today} required />
              </Field>
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setBilling(null)}
              >
                Cancelar
              </button>
              <button className="action-button modal-save">
                Confirmar faturamento
              </button>
            </div>
          </form>
        </div>
      )}
      {deleting && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDeleting(null)}
        >
          <section
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-rule-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="warning-icon" aria-hidden="true">
              !
            </span>
            <p className="eyebrow">EXCLUIR RECORRÊNCIA</p>
            <h2 id="delete-rule-title">
              Parar “{deleting.entry.description}”?
            </h2>
            <p>
              Todos os meses ainda pendentes desta recorrência serão cancelados.
              Lançamentos que já foram faturados continuarão no extrato.
            </p>
            <div className="confirm-actions">
              <button
                className="cancel-button"
                onClick={() => setDeleting(null)}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                onClick={() =>
                  void mutate({
                    action: "deleteScheduleRule",
                    id: deleting.entry.scheduledRuleId,
                  }).catch(() => undefined)
                }
              >
                Excluir recorrência
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Cards({
  data,
  wallets,
  competence,
  mutate,
}: {
  data: Data;
  wallets: Wallet[];
  competence: string;
  mutate: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [id, setId] = useState(data.cards[0]?.id ?? "");
  const card = data.cards.find((x) => x.id === id);
  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await mutate({
      action: "payCard",
      cardId: id,
      sourceWalletId: f.get("source"),
      amountCents: parseMoneyToCents(String(f.get("amount"))),
      date: f.get("date"),
      competence,
    });
  }
  if (!data.cards.length)
    return <Empty text="Cadastre um cartão em Carteiras." />;
  return (
    <div className="two-columns cards-layout">
      <Panel title="Fatura da competência">
        <Field label="Cartão">
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {data.cards.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="invoice-summary">
          <span>Compras em {comp(competence)}</span>
          <h3 className="invoice">
            <Money value={card?.invoiceCents ?? 0} />
          </h3>
          <small>
            Saldo total em aberto:{" "}
            <b>
              <Money value={card?.outstandingCents ?? 0} />
            </b>
          </small>
        </div>
        <TxList
          rows={data.transactions.filter(
            (x) => x.transaction.walletId === id && x.transaction.purchaseId,
          )}
        />
      </Panel>
      <Panel title="Pagar cartão">
        <p className="muted">
          O saldo negativo continua nos próximos meses até você registrar o
          pagamento.
        </p>
        <form onSubmit={pay}>
          <Field label="Conta de origem">
            <select name="source">
              {wallets
                .filter((x) => x.type === "CASH_ACCOUNT")
                .map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Valor">
            <input
              key={`${id}-${card?.outstandingCents}`}
              name="amount"
              defaultValue={((card?.outstandingCents ?? 0) / 100)
                .toFixed(2)
                .replace(".", ",")}
              required
            />
          </Field>
          <Field label="Data">
            <input name="date" type="date" defaultValue={today} />
          </Field>
          <button className="action-button">Registrar pagamento</button>
        </form>
      </Panel>
    </div>
  );
}
function Money({ value, prefix = "" }: { value: number; prefix?: string }) {
  const visible = useContext(BalanceVisibilityContext);
  return (
    <span
      className="money-value"
      aria-label={visible ? fmt(value) : "Valor oculto"}
    >
      {visible ? `${prefix}${fmt(value)}` : "••••••"}
    </span>
  );
}
function InfoTip({ text }: { text: string }) {
  return (
    <details className="info-tip">
      <summary aria-label="Mais informações">i</summary>
      <span role="tooltip">{text}</span>
    </details>
  );
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">VISÃO FINANCEIRA</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ text = "Nenhum item nesta competência." }: { text?: string }) {
  return (
    <div className="empty">
      ○<p>{text}</p>
    </div>
  );
}
