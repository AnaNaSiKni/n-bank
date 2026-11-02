// Все данные вымышленные.
const STORAGE_KEY = "nbank-state-v2";

// Ограничения на деньги: меняйте здесь
const LIMITS = {
  maxOperation: 1000000,  // максимум за одну операцию, перевод или пополнение
  maxBalance: 10000000,   // максимум на одной карте
  maxGoal: 5000000,       // максимум для цели
  maxGoals: 6,
  maxCards: 5,
  maxDeposits: 5,
  maxLoans: 3,
  titleLength: 30,
};

// Кэшбэк
const CASHBACK_BASE = 1;          // базовая ставка, %
const CASHBACK_MAX_PICKS = 3;     // сколько категорий можно сделать «повышенными»
const CASHBACK_MONTH_CAP = 6000;  // общий лимит кэшбэка в месяц, ₽
const CASHBACK_MAX_SPEND = 500000;
const CASHBACK_CATEGORIES = [
  { id: "Продукты",    name: "Продукты",         rate: 5,  cap: 1500 },
  { id: "Кафе",        name: "Кафе и рестораны", rate: 7,  cap: 1000 },
  { id: "Транспорт",   name: "Транспорт",        rate: 5,  cap: 800 },
  { id: "Развлечения", name: "Развлечения",      rate: 10, cap: 1000 },
];

// Вклады: чем дольше срок, тем выше ставка (% годовых)
const DEPOSIT_MIN = 10000;
const DEPOSIT_TERMS = [
  { months: 3,  rate: 11 },
  { months: 6,  rate: 13 },
  { months: 12, rate: 15 },
];

// Кредиты
const LOAN_MIN = 10000;
const LOAN_BASE_RATE = 19;           // % годовых, статус снижает ставку
const LOAN_TERMS = [6, 12, 24, 36, 60]; // сроки в месяцах

// Операции с этой категорией создаёт сам банк, они не считаются обычными тратами
const SYSTEM_CATEGORY = "Кредит";

// Н-статус зависит от расходов за 30 дней и добавляет баллы к повышенному кэшбэку
const STATUS_LEVELS = [
  { name: "Старт",  from: 0,     bonus: 0, loanLimit: 100000 },
  { name: "Плюс",   from: 20000, bonus: 1, loanLimit: 300000 },
  { name: "Индиго", from: 50000, bonus: 2, loanLimit: 1000000 },
];

function toIsoDate(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

function createDefaultState() {
  return {
    nextId: 9,
    accounts: [
      { id: "debit",  name: "Дебетовая",       last4: "4821", expires: "09/29", balance: 92340,  style: "indigo" },
      { id: "saving", name: "Накопительная",   last4: "1175", expires: "03/28", balance: 150000, style: "ink" },
      { id: "travel", name: "Для путешествий", last4: "6034", expires: "12/27", balance: 18900,  style: "frost" },
    ],
    // Операции относятся к дебетовой карте
    transactions: [
      { id: 1, title: "Пятёрочка",   category: "Продукты",    amount: -1250,  date: isoDaysAgo(2) },
      { id: 2, title: "Зарплата",    category: "Доход",       amount: 85000,  date: isoDaysAgo(8) },
      { id: 3, title: "Метро",       category: "Транспорт",   amount: -60,    date: isoDaysAgo(3) },
      { id: 4, title: "Кофейня",     category: "Кафе",        amount: -340,   date: isoDaysAgo(4) },
      { id: 5, title: "Кинотеатр",   category: "Развлечения", amount: -700,   date: isoDaysAgo(6) },
      { id: 6, title: "Перекрёсток", category: "Продукты",    amount: -6180,  date: isoDaysAgo(9) },
      { id: 7, title: "Такси",       category: "Транспорт",   amount: -450,   date: isoDaysAgo(10) },
      { id: 8, title: "Ресторан",    category: "Кафе",        amount: -12900, date: isoDaysAgo(12) },
    ],
    goals: [{ id: "g1", name: "Отпуск", target: 150000, saved: 30000 }],
    deposits: [{ id: "d1", amount: 50000, months: 6, rate: 13, passed: 2 }],
    loans: [],
    monthsPassed: 0,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
        // На случай, если в сохранённых данных нет новых разделов
        ["goals", "deposits", "loans"].forEach((key) => {
          if (!Array.isArray(parsed[key])) parsed[key] = [];
        });
        if (typeof parsed.monthsPassed !== "number") parsed.monthsPassed = 0;
        return parsed;
      }
    }
  } catch (error) {
    console.warn("Не удалось прочитать сохранённые данные", error);
  }
  return createDefaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Не удалось сохранить данные", error);
  }
}

let state = loadState();
