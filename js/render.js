// Здесь только отрисовка: берём state и рисуем страницу.
const byId = (id) => document.getElementById(id);

const moneyFormat = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
const money = (value) => moneyFormat.format(value);

const CHART_COLORS = ["#4b3fd1", "#7a5af8", "#e9a93b", "#2a2178", "#a99bff", "#f2cf8f"];

// Крестик нарисован SVG: так он всегда ровно по центру кнопки
const CROSS_ICON =
  '<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function formatDate(isoDate) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

// Защита: текст пользователя нельзя вставлять в innerHTML как есть
function escapeHtml(text) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text).replace(/[&<>"']/g, (ch) => map[ch]);
}

function renderBalance() {
  const total = state.accounts.reduce((sum, acc) => sum + acc.balance, 0);
  byId("total-balance").textContent = money(total);
}

function renderMonthStats() {
  const since = isoDaysAgo(30);
  const recent = state.transactions.filter((t) => t.date >= since);
  const income = recent.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const expense = recent.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  byId("month-income").textContent = money(income);
  byId("month-expense").textContent = money(expense);
}

function renderStatus() {
  const { spent, level, next, progress } = getStatus();
  const hint = next
    ? `Потратьте ещё ${money(next.from - spent)} за 30 дней, и откроется «${next.name}»`
    : "Максимальный статус. Так держать!";
  byId("status").innerHTML = `
    <div class="status__top">
      <span class="status__badge">Н-статус: ${level.name}</span>
      <span class="status__bonus">${level.bonus ? `+${level.bonus} п.п. к повышенному кэшбэку` : "Бонус откроется на уровне «Плюс»"}. Кредитный лимит: ${money(level.loanLimit)}</span>
    </div>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}"><span style="width:${Math.round(progress * 100)}%"></span></div>
    <p class="status__hint">${hint}</p>`;
}

function renderCards() {
  byId("cards-list").innerHTML = state.accounts
    .map(
      (acc) => `
        <article class="card card--${acc.style}">
          <div class="card__top">
            <span class="card__name">${escapeHtml(acc.name)}</span>
            <span class="card__system">МИР</span>
          </div>
          <span class="card__number">•••• ${acc.last4}</span>
          <div class="card__bottom">
            <span class="card__sum">${money(acc.balance)}</span>
            <span class="card__date">${acc.expires}</span>
          </div>
        </article>`
    )
    .join("");
}

function fillAccountSelect(select, defaultIndex) {
  const previous = select.value;
  select.innerHTML = state.accounts
    .map((acc) => `<option value="${acc.id}">${escapeHtml(acc.name)} •••• ${acc.last4} · ${money(acc.balance)}</option>`)
    .join("");
  if (state.accounts.some((acc) => acc.id === previous)) {
    select.value = previous;
  } else if (state.accounts[defaultIndex]) {
    select.value = state.accounts[defaultIndex].id;
  }
}

function renderAccountSelects() {
  fillAccountSelect(byId("transfer-from"), 0);
  fillAccountSelect(byId("transfer-to"), 1);
  fillAccountSelect(byId("goal-source"), 0);
  fillAccountSelect(byId("deposit-source"), 0);
}

// Поиск + фильтр + сортировка
function getVisibleTransactions() {
  const query = byId("search").value.trim().toLowerCase();
  const category = byId("filter-category").value;
  const sort = byId("sort").value;

  const list = state.transactions.filter(
    (t) => (category === "all" || t.category === category) && t.title.toLowerCase().includes(query)
  );

  list.sort((a, b) => {
    if (sort === "date-asc") return a.date.localeCompare(b.date) || a.id - b.id;
    if (sort === "amount-desc") return b.amount - a.amount;
    if (sort === "amount-asc") return a.amount - b.amount;
    return b.date.localeCompare(a.date) || b.id - a.id; // date-desc
  });
  return list;
}

function renderOperations() {
  const list = getVisibleTransactions();
  byId("operations-list").innerHTML = list
    .map((t) => {
      const incomeClass = t.amount > 0 ? "operation__amount--income" : "";
      const sign = t.amount > 0 ? "+" : "";
      return `
        <li class="operation">
          <div class="operation__info">
            <p class="operation__title">${escapeHtml(t.title)}</p>
            <p class="operation__meta">${escapeHtml(t.category)} · ${formatDate(t.date)}</p>
          </div>
          <div class="operation__right">
            <span class="operation__amount ${incomeClass}">${sign}${money(t.amount)}</span>
            ${t.locked ? '<span class="icon-space" title="Системная операция"></span>' : `<button class="icon-btn operation__delete" type="button" data-id="${t.id}" aria-label="Удалить операцию ${escapeHtml(t.title)}">${CROSS_ICON}</button>`}
          </div>
        </li>`;
    })
    .join("");

  byId("operations-empty").hidden = list.length > 0;
  byId("operations-count").textContent = `Показано: ${list.length} из ${state.transactions.length}`;
}

function renderGoals() {
  const saved = state.goals.reduce((sum, g) => sum + g.saved, 0);
  byId("goals-total").textContent = `В копилках: ${money(saved)}`;

  byId("goals-list").innerHTML = state.goals.length
    ? state.goals
        .map((g) => {
          const percent = Math.min(100, Math.floor((g.saved / g.target) * 100));
          const done = g.saved >= g.target;
          return `
            <li class="goal">
              <div class="goal__head">
                <span class="goal__name">${escapeHtml(g.name)}</span>
                <span class="goal__sum">${money(g.saved)} из ${money(g.target)}</span>
              </div>
              <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
              <div class="goal__actions">
                ${
                  done
                    ? `<span class="goal__done">Цель достигнута</span>`
                    : `<input class="goal__input" type="number" min="1" step="1" placeholder="Сумма" aria-label="Сумма пополнения: ${escapeHtml(g.name)}">
                       <button class="btn btn--ghost goal__deposit" type="button" data-id="${g.id}">Пополнить</button>`
                }
                <button class="icon-btn goal__remove" type="button" data-id="${g.id}" aria-label="Удалить цель ${escapeHtml(g.name)}">${CROSS_ICON}</button>
              </div>
            </li>`;
        })
        .join("")
    : `<li class="empty">Целей пока нет. Создайте первую.</li>`;
}

// Кольцевая диаграмма расходов, нарисованная на canvas без библиотек
function renderChart() {
  const canvas = byId("expense-chart");
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const center = size / 2;
  const outer = size / 2 - 10;
  const inner = outer * 0.62;
  const radius = (outer + inner) / 2;
  const textColor = getComputedStyle(document.body).color;

  const totals = {};
  state.transactions
    .filter((t) => t.amount < 0)
    .forEach((t) => { totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount); });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const sum = entries.reduce((s, [, value]) => s + value, 0);

  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = outer - inner;

  if (sum === 0) {
    ctx.strokeStyle = "rgba(128,130,160,0.35)";
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
    byId("chart-legend").innerHTML = `<li class="legend__item">Расходов пока нет</li>`;
    return;
  }

  let start = -Math.PI / 2;
  entries.forEach(([, value], i) => {
    const angle = (value / sum) * Math.PI * 2;
    ctx.strokeStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.beginPath();
    ctx.arc(center, center, radius, start, start + angle);
    ctx.stroke();
    start += angle;
  });

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Шрифт подбирается под длину суммы, чтобы она не вылезала за кольцо
  const label = money(sum);
  ctx.font = `600 ${label.length > 11 ? 20 : label.length > 9 ? 24 : 28}px system-ui, sans-serif`;
  ctx.fillText(label, center, center);

  byId("chart-legend").innerHTML = entries
    .map(([category, value], i) => `
      <li class="legend__item">
        <span class="legend__dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        <span class="legend__name">${escapeHtml(category)}</span>
        <span class="legend__value">${money(value)} · ${Math.round((value / sum) * 100)}%</span>
      </li>`)
    .join("");
}

// Строки калькулятора кэшбэка создаются один раз
function renderCashbackRows() {
  const defaults = { Продукты: 15000, Кафе: 6000, Транспорт: 3000, Развлечения: 4000, other: 5000 };
  const picked = ["Продукты", "Кафе", "Транспорт"];
  const rows = [...CASHBACK_CATEGORIES, { id: "other", name: "Остальное" }];

  byId("cashback-list").innerHTML = rows
    .map((cat) => {
      const pick =
        cat.id === "other"
          ? `<span class="cb-pick"><span>${cat.name}<span class="cb-note">базовая ставка ${CASHBACK_BASE}%</span></span></span>`
          : `<label class="cb-pick">
               <input type="checkbox" class="cb-check" ${picked.includes(cat.id) ? "checked" : ""}>
               <span>${cat.name}<span class="cb-note">до ${cat.rate}%, лимит ${money(cat.cap)} в месяц</span></span>
             </label>`;
      return `
        <div class="cb-row" data-id="${cat.id}">
          ${pick}
          <span class="cb-rate"></span>
          <input class="cb-spend" type="number" min="0" max="${CASHBACK_MAX_SPEND}" step="100" value="${defaults[cat.id]}" aria-label="Траты в месяц: ${cat.name}">
          <span class="cb-result"></span>
        </div>`;
    })
    .join("");
}

/* ---------- Время, вклады, кредиты, здоровье ---------- */
function renderMonths() {
  byId("months-passed").textContent = state.monthsPassed
    ? `Прошло месяцев: ${state.monthsPassed}`
    : "Демо: перемотайте время вперёд";
}

// Списки сроков зависят от статуса (ставка меняется), поэтому строим их заново
function renderTermOptions() {
  const depositSelect = byId("deposit-term");
  const loanSelect = byId("loan-term");
  const oldDeposit = depositSelect.value;
  const oldLoan = loanSelect.value;

  depositSelect.innerHTML = DEPOSIT_TERMS
    .map((term) => `<option value="${term.months}">${term.months} мес. · ${formatPercent(getDepositRate(term.months))} годовых</option>`)
    .join("");
  loanSelect.innerHTML = LOAN_TERMS
    .map((months) => `<option value="${months}">${months} мес.</option>`)
    .join("");

  if (oldDeposit) depositSelect.value = oldDeposit;
  if (oldLoan) loanSelect.value = oldLoan;
}

function createProgressBar(percent) {
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`;
}

function createDepositHtml(deposit) {
  const income = calcDepositIncome(deposit.amount, deposit.rate, deposit.months);
  const percent = Math.floor((deposit.passed / deposit.months) * 100);
  const isMatured = deposit.passed >= deposit.months;

  const button = isMatured
    ? `<button class="btn" type="button" data-action="withdraw" data-id="${deposit.id}">Забрать ${money(deposit.amount + income)}</button>`
    : `<button class="btn btn--ghost" type="button" data-action="close" data-id="${deposit.id}">Закрыть досрочно</button>`;

  return `
    <li class="product">
      <div class="product__head">
        <span class="product__name">Вклад на ${deposit.months} мес.</span>
        <span class="product__rate">${formatPercent(deposit.rate)}</span>
      </div>
      <p class="product__info">${money(deposit.amount)} · доход к концу срока ${money(income)}</p>
      ${createProgressBar(percent)}
      <p class="product__info">Прошло ${deposit.passed} из ${deposit.months} мес.</p>
      <div class="product__actions">${button}</div>
    </li>`;
}

function createLoanHtml(loan) {
  const percent = Math.floor((loan.paidMonths / loan.months) * 100);

  return `
    <li class="product">
      <div class="product__head">
        <span class="product__name">${escapeHtml(loan.name)}</span>
        <span class="product__rate">${formatPercent(loan.rate)}</span>
      </div>
      <p class="product__info">Остаток долга ${money(loan.rest)} · платёж ${money(loan.payment)} в месяц</p>
      ${createProgressBar(percent)}
      <p class="product__info">Выплачено ${loan.paidMonths} из ${loan.months} мес.</p>
      <div class="product__actions">
        <button class="btn btn--ghost" type="button" data-action="repay" data-id="${loan.id}">Погасить ${money(loan.rest)}</button>
      </div>
    </li>`;
}

function renderDeposits() {
  byId("deposits-total").textContent = `На вкладах: ${money(sumBy(state.deposits, "amount"))}`;
  byId("deposits-list").innerHTML = state.deposits.length
    ? state.deposits.map(createDepositHtml).join("")
    : `<li class="empty">Вкладов пока нет. Откройте первый.</li>`;
}

function renderLoans() {
  byId("loans-total").textContent = `Долг: ${money(getTotalDebt())}`;
  byId("loans-list").innerHTML = state.loans.length
    ? state.loans.map(createLoanHtml).join("")
    : `<li class="empty">Кредитов нет. Это хорошо.</li>`;
}

function renderHealth() {
  const health = getHealth();
  byId("health-score").textContent = health.score;
  byId("health-verdict").textContent = health.verdict;
  byId("health-tip").textContent = health.tip;
  byId("health-parts").innerHTML = health.parts
    .map((part) => `
      <li class="health__part">
        <div class="health__row"><span>${part.label}</span><span>${Math.round(part.points)} из ${part.max}</span></div>
        ${createProgressBar(Math.round((part.points / part.max) * 100))}
      </li>`)
    .join("");
}
