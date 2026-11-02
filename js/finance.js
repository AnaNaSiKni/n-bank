// Финансовые расчёты. Здесь нет работы со страницей: только данные и числа.

/* ---------- Мелкие помощники ---------- */
function sumBy(list, field) {
  return list.reduce((sum, item) => sum + item[field], 0);
}

function formatPercent(value) {
  return String(value).replace(".", ",") + "%";
}

// Обычная трата или доход, без кредитов
function isRealSpending(transaction) {
  return transaction.amount < 0 && transaction.category !== SYSTEM_CATEGORY;
}

function isRealIncome(transaction) {
  return transaction.amount > 0 && transaction.category !== SYSTEM_CATEGORY;
}

function getRecentTransactions() {
  const since = isoDaysAgo(30);
  return state.transactions.filter((t) => t.date >= since);
}

/* ---------- Н-статус ---------- */
function getStatus() {
  const spent = getRecentTransactions()
    .filter(isRealSpending)
    .reduce((sum, t) => sum - t.amount, 0);

  let index = 0;
  STATUS_LEVELS.forEach((level, i) => {
    if (spent >= level.from) index = i;
  });

  const level = STATUS_LEVELS[index];
  const next = STATUS_LEVELS[index + 1] || null;
  const progress = next ? (spent - level.from) / (next.from - level.from) : 1;
  return { spent, level, next, progress };
}

/* ---------- Вклады ---------- */
function getDepositRate(months) {
  const term = DEPOSIT_TERMS.find((item) => item.months === months);
  const statusBonus = getStatus().level.bonus * 0.5;
  return term.rate + statusBonus;
}

// Простые проценты: сумма × ставка × (месяцы / 12)
function calcDepositIncome(amount, rate, months) {
  return Math.round(((amount * rate) / 100) * (months / 12));
}

/* ---------- Кредиты ---------- */
function getLoanRate() {
  return LOAN_BASE_RATE - getStatus().level.bonus;
}

// Аннуитетный платёж: одинаковая сумма каждый месяц
function calcLoanPayment(amount, rate, months) {
  const monthlyRate = rate / 100 / 12;
  const payment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  return Math.round(payment);
}

function getTotalDebt() {
  return sumBy(state.loans, "rest");
}

// Сколько ещё можно взять в долг при текущем статусе
function getLoanAvailable() {
  return Math.max(0, getStatus().level.loanLimit - getTotalDebt());
}

// Разбор платежа за ближайший месяц: сколько уйдёт на проценты и на долг
function getLoanMonth(loan) {
  const monthlyRate = loan.rate / 100 / 12;
  const interest = Math.round(loan.rest * monthlyRate);
  const isLastMonth = loan.paidMonths + 1 >= loan.months;

  // В последний месяц платим весь остаток, чтобы не осталось копеек
  const payment = isLastMonth ? loan.rest + interest : loan.payment;
  return { interest, principal: payment - interest, payment };
}

/* ---------- Н-здоровье: оценка от 0 до 100 ---------- */
function getHealth() {
  const recent = getRecentTransactions();
  const spent = getStatus().spent;
  const income = recent.filter(isRealIncome).reduce((sum, t) => sum + t.amount, 0);

  const savings = sumBy(state.deposits, "amount") + sumBy(state.goals, "saved");
  const assets = sumBy(state.accounts, "balance") + savings;
  const debt = getTotalDebt();
  const monthlyExpense = Math.max(spent, 1);

  const reservePoints = Math.min(assets / monthlyExpense / 6, 1) * 40;
  const debtPoints = debt === 0 ? 30 : Math.max(0, 1 - debt / Math.max(assets, 1)) * 30;
  const savingsPoints = Math.min(savings / (monthlyExpense * 3), 1) * 20;
  const balancePoints = spent === 0 || income >= spent ? 10 : (income / spent) * 10;

  const parts = [
    { label: "Подушка безопасности", points: reservePoints, max: 40, tip: "Подушки хватит меньше чем на 6 месяцев расходов. Откладывайте больше." },
    { label: "Долговая нагрузка", points: debtPoints, max: 30, tip: "Долг велик по сравнению с накоплениями. Погасите часть кредита досрочно." },
    { label: "Накопления", points: savingsPoints, max: 20, tip: "Накоплений меньше трёх месяцев расходов. Откройте вклад или пополните цель." },
    { label: "Доходы и расходы", points: balancePoints, max: 10, tip: "За 30 дней вы тратите больше, чем получаете." },
  ];

  const score = Math.round(sumBy(parts, "points"));
  const weakest = parts.reduce((worst, part) => (part.points / part.max < worst.points / worst.max ? part : worst));

  let verdict = "Есть над чем поработать";
  if (score >= 80) verdict = "Отличное состояние";
  else if (score >= 55) verdict = "Хорошее состояние";

  const tip = weakest.points >= weakest.max ? "Всё в порядке, так держать!" : weakest.tip;
  return { score, parts, verdict, tip };
}
