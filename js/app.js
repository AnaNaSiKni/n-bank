// Здесь поведение: события, проверки, изменение данных.
const THEME_KEY = "nbank-theme";
let toastTimer;

function showToast(message, isError = false) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.toggle("toast--error", isError);
  toast.classList.add("toast--visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("toast--visible"), 3500);
}

function getAccount(id) {
  return state.accounts.find((acc) => acc.id === id);
}

/* ---------- Проверки денег ---------- */
// Возвращает текст ошибки или null, если сумма допустима
function validateAmount(value, max = LIMITS.maxOperation) {
  if (!Number.isFinite(value) || value <= 0) return "Введите сумму больше нуля.";
  if (!Number.isInteger(value)) return "Укажите целое число рублей.";
  if (value > max) return `Максимум за один раз: ${money(max)}.`;
  return null;
}

function receiveError(account, amount) {
  if (account.balance + amount > LIMITS.maxBalance) {
    return `На карте «${account.name}» не может быть больше ${money(LIMITS.maxBalance)}.`;
  }
  return null;
}

function refreshAll() {
  renderBalance();
  renderMonthStats();
  renderStatus();
  renderCards();
  renderAccountSelects();
  renderOperations();
  renderGoals();
  renderMonths();
  renderDeposits();
  renderLoans();
  renderHealth();
  renderTermOptions();
  renderChart();
  updateDepositPreview();
  updateLoanPreview();
  updateCashback();
}

/* ---------- Фильтры, поиск, сортировка ---------- */
byId("search").addEventListener("input", renderOperations);
byId("filter-category").addEventListener("change", renderOperations);
byId("sort").addEventListener("change", renderOperations);

/* ---------- Добавление операции ---------- */
byId("add-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const title = byId("add-title").value.trim();
  const category = byId("add-category").value;
  const value = Number(byId("add-amount").value);
  const date = byId("add-date").value;
  const debit = getAccount("debit");

  let error = null;
  if (!title) error = "Введите название операции.";
  else if (title.length > LIMITS.titleLength) error = `Название не длиннее ${LIMITS.titleLength} символов.`;
  else if (!date) error = "Выберите дату.";
  else if (date > toIsoDate(new Date())) error = "Дата не может быть в будущем.";
  else error = validateAmount(value);

  const amount = category === "Доход" ? value : -value;
  if (!error && amount < 0 && debit.balance < value) {
    error = `Недостаточно средств на дебетовой карте: ${money(debit.balance)}.`;
  }
  if (!error && amount > 0) error = receiveError(debit, amount);
  if (error) return showToast(error, true);

  debit.balance += amount;
  state.transactions.push({ id: state.nextId++, title, category, amount, date });
  saveState();
  refreshAll();

  byId("add-form").reset();
  byId("add-date").value = toIsoDate(new Date());
  showToast("Операция добавлена");
});

/* ---------- Удаление операции (делегирование событий) ---------- */
byId("operations-list").addEventListener("click", (event) => {
  const button = event.target.closest(".operation__delete");
  if (!button) return;

  const id = Number(button.dataset.id);
  const transaction = state.transactions.find((t) => t.id === id);
  if (!transaction || transaction.locked) return;

  const debit = getAccount("debit");
  const after = debit.balance - transaction.amount; // откатываем влияние операции
  if (after < 0) return showToast("Нельзя удалить: баланс карты станет отрицательным", true);
  if (after > LIMITS.maxBalance) return showToast("Нельзя удалить: на карте будет слишком много денег", true);

  debit.balance = after;
  state.transactions = state.transactions.filter((t) => t.id !== id);
  saveState();
  refreshAll();
  showToast("Операция удалена");
});

/* ---------- Перевод между счетами ---------- */
byId("transfer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const errorBox = byId("transfer-error");
  errorBox.textContent = "";

  const from = getAccount(byId("transfer-from").value);
  const to = getAccount(byId("transfer-to").value);
  const amount = Number(byId("transfer-amount").value);

  let error = null;
  if (!from || !to || from.id === to.id) error = "Выберите два разных счёта.";
  else error = validateAmount(amount);
  if (!error && amount > from.balance) error = `Недостаточно средств. Доступно: ${money(from.balance)}.`;
  if (!error) error = receiveError(to, amount);
  if (error) {
    errorBox.textContent = error;
    return;
  }

  from.balance -= amount;
  to.balance += amount;
  saveState();
  refreshAll();

  byId("transfer-amount").value = "";
  showToast(`Переведено ${money(amount)}: ${from.name} → ${to.name}`);
});

/* ---------- Новая карта ---------- */
byId("add-card-btn").addEventListener("click", () => {
  if (state.accounts.length >= LIMITS.maxCards) {
    return showToast(`Можно открыть не больше ${LIMITS.maxCards} карт`, true);
  }
  const name = (prompt("Название новой карты:") || "").trim();
  if (!name) return;
  if (name.length > 20) return showToast("Название слишком длинное (максимум 20 символов)", true);

  const now = new Date();
  state.accounts.push({
    id: "acc" + state.nextId++,
    name,
    last4: String(Math.floor(1000 + Math.random() * 9000)),
    expires: `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getFullYear() + 4).slice(2)}`,
    balance: 0,
    style: ["indigo", "ink", "frost"][state.accounts.length % 3],
  });
  saveState();
  refreshAll();
  showToast(`Карта «${name}» открыта. Пополните её переводом`);
});

/* ---------- Цели ---------- */
byId("goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = byId("goal-name").value.trim();
  const target = Number(byId("goal-target").value);

  let error = null;
  if (state.goals.length >= LIMITS.maxGoals) error = `Не больше ${LIMITS.maxGoals} целей одновременно.`;
  else if (!name) error = "Введите название цели.";
  else if (name.length > LIMITS.titleLength) error = `Название не длиннее ${LIMITS.titleLength} символов.`;
  else error = validateAmount(target, LIMITS.maxGoal);
  if (error) return showToast(error, true);

  state.goals.push({ id: "g" + state.nextId++, name, target, saved: 0 });
  saveState();
  refreshAll();
  byId("goal-form").reset();
  showToast(`Цель «${name}» создана`);
});

byId("goals-list").addEventListener("click", (event) => {
  const depositBtn = event.target.closest(".goal__deposit");
  const removeBtn = event.target.closest(".goal__remove");

  if (depositBtn) {
    const goal = state.goals.find((g) => g.id === depositBtn.dataset.id);
    const input = depositBtn.closest(".goal").querySelector(".goal__input");
    const source = getAccount(byId("goal-source").value);
    const amount = Number(input.value);

    let error = validateAmount(amount);
    if (!error && amount > source.balance) error = `Недостаточно средств на карте: ${money(source.balance)}.`;
    if (!error && amount > goal.target - goal.saved) error = `До цели осталось ${money(goal.target - goal.saved)}.`;
    if (error) return showToast(error, true);

    source.balance -= amount;
    goal.saved += amount;
    saveState();
    refreshAll();
    showToast(goal.saved >= goal.target ? `Цель «${goal.name}» достигнута!` : `Отложено ${money(amount)} на «${goal.name}»`);
  }

  if (removeBtn) {
    const goal = state.goals.find((g) => g.id === removeBtn.dataset.id);
    const debit = getAccount("debit");
    if (!confirm(`Удалить цель «${goal.name}»? Накопленные ${money(goal.saved)} вернутся на дебетовую карту.`)) return;

    const error = receiveError(debit, goal.saved);
    if (error) return showToast(error, true);

    debit.balance += goal.saved;
    state.goals = state.goals.filter((g) => g.id !== goal.id);
    saveState();
    refreshAll();
    showToast("Цель удалена, деньги возвращены");
  }
});

/* ---------- Калькулятор кэшбэка ---------- */
function updateCashback() {
  const { level } = getStatus();
  let sum = 0;
  let spendAll = 0;

  document.querySelectorAll(".cb-row").forEach((row) => {
    const cat = CASHBACK_CATEGORIES.find((c) => c.id === row.dataset.id);
    const check = row.querySelector(".cb-check");
    const input = row.querySelector(".cb-spend");

    let spend = Number(input.value) || 0;
    if (spend < 0) { spend = 0; input.value = 0; }
    if (spend > CASHBACK_MAX_SPEND) { spend = CASHBACK_MAX_SPEND; input.value = spend; }

    let rate = CASHBACK_BASE;
    let amount;
    let capped = false;
    if (cat && check.checked) {
      rate = cat.rate + level.bonus;
      const raw = (spend * rate) / 100;
      amount = Math.min(raw, cat.cap);
      capped = raw > cat.cap;
    } else {
      amount = (spend * rate) / 100;
    }

    sum += amount;
    spendAll += spend;
    row.querySelector(".cb-rate").textContent = `${rate}%`;
    row.querySelector(".cb-result").innerHTML = money(amount) + (capped ? '<span class="cb-note">достигнут лимит</span>' : "");
  });

  const total = Math.min(sum, CASHBACK_MONTH_CAP);
  const picked = document.querySelectorAll(".cb-check:checked").length;
  byId("cashback-total").textContent = money(total);
  byId("cashback-year").textContent = money(total * 12);
  byId("cashback-rate").textContent = (spendAll ? (total / spendAll) * 100 : 0).toFixed(1).replace(".", ",") + "%";
  byId("cb-hint").textContent =
    `Повышенных категорий: ${picked} из ${CASHBACK_MAX_PICKS}. Бонус статуса «${level.name}»: +${level.bonus} п.п.` +
    (sum > CASHBACK_MONTH_CAP ? ` Общий лимит ${money(CASHBACK_MONTH_CAP)} в месяц достигнут.` : "");
}

byId("cashback-list").addEventListener("input", updateCashback);
byId("cashback-list").addEventListener("change", (event) => {
  const over = document.querySelectorAll(".cb-check:checked").length > CASHBACK_MAX_PICKS;
  if (event.target.classList.contains("cb-check") && over) {
    event.target.checked = false;
    showToast(`Можно выбрать не больше ${CASHBACK_MAX_PICKS} категорий`, true);
  }
  updateCashback();
});

// Подставляем реальные расходы за 30 дней
byId("cb-fill").addEventListener("click", () => {
  const since = isoDaysAgo(30);
  const spent = {};
  state.transactions
    .filter((t) => isRealSpending(t) && t.date >= since)
    .forEach((t) => { spent[t.category] = (spent[t.category] || 0) + Math.abs(t.amount); });

  if (!Object.keys(spent).length) return showToast("За 30 дней расходов нет, подставлять нечего", true);

  document.querySelectorAll(".cb-row").forEach((row) => {
    const known = CASHBACK_CATEGORIES.some((c) => c.id === row.dataset.id);
    const value = known
      ? spent[row.dataset.id] || 0
      : Object.entries(spent).filter(([c]) => !CASHBACK_CATEGORIES.some((x) => x.id === c)).reduce((s, [, v]) => s + v, 0);
    row.querySelector(".cb-spend").value = Math.min(Math.round(value / 100) * 100, CASHBACK_MAX_SPEND);
  });
  updateCashback();
  showToast("Подставлены ваши расходы за 30 дней");
});

// Выбираем три категории, где повышенная ставка даёт больше всего
byId("cb-best").addEventListener("click", () => {
  const { level } = getStatus();
  const gains = [...document.querySelectorAll(".cb-row")]
    .filter((row) => row.dataset.id !== "other")
    .map((row) => {
      const cat = CASHBACK_CATEGORIES.find((c) => c.id === row.dataset.id);
      const spend = Number(row.querySelector(".cb-spend").value) || 0;
      const gain = Math.min((spend * (cat.rate + level.bonus)) / 100, cat.cap) - (spend * CASHBACK_BASE) / 100;
      return { row, gain, name: cat.name };
    })
    .sort((a, b) => b.gain - a.gain);

  const chosen = [];
  gains.forEach((g, i) => {
    const on = i < CASHBACK_MAX_PICKS && g.gain > 0;
    g.row.querySelector(".cb-check").checked = on;
    if (on) chosen.push(g.name);
  });
  updateCashback();
  showToast(chosen.length ? `Лучшие категории: ${chosen.join(", ")}` : "Введите траты, чтобы подобрать категории", !chosen.length);
});

/* ---------- Системные операции ---------- */
// Такие операции создаёт сам банк (проценты, платежи). Удалять их нельзя.
function addSystemTransaction(title, category, amount) {
  state.transactions.push({
    id: state.nextId++,
    title,
    category,
    amount,
    date: toIsoDate(new Date()),
    locked: true,
  });
}

/* ---------- Вклады ---------- */
function updateDepositPreview() {
  const amount = Number(byId("deposit-amount").value);
  const months = Number(byId("deposit-term").value);
  const rate = getDepositRate(months);
  const preview = byId("deposit-preview");

  if (!amount) {
    preview.textContent = `Проценты (${formatPercent(rate)} годовых) выплачиваются в конце срока.`;
    return;
  }
  preview.textContent = `Доход за ${months} мес.: ${money(calcDepositIncome(amount, rate, months))}`;
}

byId("deposit-amount").addEventListener("input", updateDepositPreview);
byId("deposit-term").addEventListener("change", updateDepositPreview);

byId("deposit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(byId("deposit-amount").value);
  const months = Number(byId("deposit-term").value);
  const source = getAccount(byId("deposit-source").value);

  let error = null;
  if (state.deposits.length >= LIMITS.maxDeposits) error = `Не больше ${LIMITS.maxDeposits} вкладов одновременно.`;
  else error = validateAmount(amount);
  if (!error && amount < DEPOSIT_MIN) error = `Минимальная сумма вклада: ${money(DEPOSIT_MIN)}.`;
  if (!error && amount > source.balance) error = `Недостаточно средств на карте: ${money(source.balance)}.`;
  if (error) return showToast(error, true);

  source.balance -= amount;
  state.deposits.push({ id: "d" + state.nextId++, amount, months, rate: getDepositRate(months), passed: 0 });
  saveState();
  byId("deposit-form").reset();
  refreshAll();
  showToast(`Вклад на ${money(amount)} открыт`);
});

byId("deposits-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;

  const deposit = state.deposits.find((d) => d.id === button.dataset.id);
  const debit = getAccount("debit");
  let payout = deposit.amount; // при досрочном закрытии проценты не начисляются

  if (button.dataset.action === "withdraw") {
    const income = calcDepositIncome(deposit.amount, deposit.rate, deposit.months);
    payout = deposit.amount + income;
    const error = receiveError(debit, payout);
    if (error) return showToast(error, true);
    addSystemTransaction("Проценты по вкладу", "Доход", income);
  } else {
    if (!confirm("Закрыть вклад досрочно? Проценты не начисляются.")) return;
    const error = receiveError(debit, payout);
    if (error) return showToast(error, true);
  }

  debit.balance += payout;
  state.deposits = state.deposits.filter((d) => d.id !== deposit.id);
  saveState();
  refreshAll();
  showToast(`На дебетовую карту зачислено ${money(payout)}`);
});

/* ---------- Кредиты ---------- */
function updateLoanPreview() {
  const amount = Number(byId("loan-amount").value);
  const months = Number(byId("loan-term").value);
  const rate = getLoanRate();
  const available = money(getLoanAvailable());
  const preview = byId("loan-preview");

  if (!amount) {
    preview.textContent = `Ставка ${formatPercent(rate)}. Доступный лимит: ${available}.`;
    return;
  }
  const payment = calcLoanPayment(amount, rate, months);
  const overpay = payment * months - amount;
  preview.textContent = `Платёж ${money(payment)} в месяц · переплата ${money(overpay)} · лимит ${available}`;
}

byId("loan-amount").addEventListener("input", updateLoanPreview);
byId("loan-term").addEventListener("change", updateLoanPreview);

byId("loan-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(byId("loan-amount").value);
  const months = Number(byId("loan-term").value);
  const debit = getAccount("debit");

  let error = null;
  if (state.loans.length >= LIMITS.maxLoans) error = `Не больше ${LIMITS.maxLoans} кредитов одновременно.`;
  else error = validateAmount(amount);
  if (!error && amount < LOAN_MIN) error = `Минимальная сумма кредита: ${money(LOAN_MIN)}.`;
  if (!error && amount > getLoanAvailable()) {
    error = `Ваш лимит по кредиту: ${money(getLoanAvailable())}. Он растёт вместе с Н-статусом.`;
  }
  if (!error) error = receiveError(debit, amount);
  if (error) return showToast(error, true);

  const rate = getLoanRate();
  debit.balance += amount;
  state.loans.push({
    id: "l" + state.nextId++,
    name: `Кредит на ${money(amount)}`,
    amount,
    rate,
    months,
    payment: calcLoanPayment(amount, rate, months),
    rest: amount,
    paidMonths: 0,
  });
  addSystemTransaction("Выдан кредит", SYSTEM_CATEGORY, amount);
  saveState();
  byId("loan-form").reset();
  refreshAll();
  showToast(`Кредит оформлен, ${money(amount)} зачислено на дебетовую карту`);
});

byId("loans-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='repay']");
  if (!button) return;

  const loan = state.loans.find((l) => l.id === button.dataset.id);
  const debit = getAccount("debit");
  if (debit.balance < loan.rest) {
    return showToast(`Для погашения нужно ${money(loan.rest)} на дебетовой карте`, true);
  }
  if (!confirm(`Погасить кредит досрочно? Спишется ${money(loan.rest)}, без штрафов.`)) return;

  debit.balance -= loan.rest;
  addSystemTransaction("Досрочное погашение", SYSTEM_CATEGORY, -loan.rest);
  state.loans = state.loans.filter((l) => l.id !== loan.id);
  saveState();
  refreshAll();
  showToast("Кредит погашен");
});

/* ---------- Перемотка времени: проценты и платежи ---------- */
byId("skip-month").addEventListener("click", () => {
  const debit = getAccount("debit");
  const months = state.loans.map(getLoanMonth);
  const totalPayment = sumBy(months, "payment");

  if (totalPayment > debit.balance) {
    return showToast(`Для платежей по кредитам нужно ${money(totalPayment)} на дебетовой карте`, true);
  }

  // 1. Платим по кредитам
  state.loans.forEach((loan, index) => {
    const month = months[index];
    debit.balance -= month.payment;
    loan.rest -= month.principal;
    loan.paidMonths += 1;
    addSystemTransaction(`Платёж: ${loan.name}`, SYSTEM_CATEGORY, -month.payment);
  });
  const finished = state.loans.filter((loan) => loan.paidMonths >= loan.months).length;
  state.loans = state.loans.filter((loan) => loan.paidMonths < loan.months);

  // 2. Вклады становятся на месяц ближе к концу срока
  state.deposits.forEach((deposit) => {
    if (deposit.passed < deposit.months) deposit.passed += 1;
  });

  state.monthsPassed += 1;
  saveState();
  refreshAll();

  let message = `Прошёл месяц. Платежи по кредитам: ${money(totalPayment)}`;
  if (finished) message = "Кредит полностью выплачен!";
  showToast(message);
});

/* ---------- Скачать операции в CSV ---------- */
function quoteCsv(text) {
  return '"' + String(text).replace(/"/g, '""') + '"';
}

function exportCsv() {
  const rows = getVisibleTransactions().map((t) => [t.date, quoteCsv(t.title), quoteCsv(t.category), t.amount].join(";"));
  const text = "\ufeff" + ["Дата;Название;Категория;Сумма", ...rows].join("\n"); // BOM нужен, чтобы Excel понял кириллицу

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  link.download = "n-bank-operations.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`Скачано операций: ${rows.length}`);
}
byId("export-csv").addEventListener("click", exportCsv);

/* ---------- Тема ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const button = byId("theme-toggle");
  button.textContent = theme === "dark" ? "Светлая" : "Тёмная";
  button.setAttribute("aria-pressed", String(theme === "dark"));
  renderChart(); // цвет текста в центре диаграммы зависит от темы
}

byId("theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ничего */ }
  applyTheme(next);
});

/* ---------- Быстрое действие: открыть форму добавления ---------- */
document.querySelector('.quick a[href="#operations"]').addEventListener("click", () => {
  document.querySelector("#operations .add").open = true;
});

/* ---------- Старт ---------- */
["add-amount", "transfer-amount"].forEach((id) => {
  byId(id).max = LIMITS.maxOperation;
  byId(id).step = 1;
});
byId("transfer-amount").placeholder = `До ${money(LIMITS.maxOperation)}`;
byId("add-amount").placeholder = `До ${money(LIMITS.maxOperation)}`;
byId("goal-target").max = LIMITS.maxGoal;
byId("deposit-amount").max = LIMITS.maxOperation;
byId("loan-amount").max = LIMITS.maxOperation;
byId("add-title").maxLength = LIMITS.titleLength;
byId("goal-name").maxLength = LIMITS.titleLength;
byId("add-date").max = toIsoDate(new Date());
byId("add-date").value = toIsoDate(new Date());

let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ничего */ }
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

renderCashbackRows();
refreshAll();
applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
