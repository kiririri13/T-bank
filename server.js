const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const assert = require("assert");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Исходные таблицы кейса: приложение намеренно работает только с этими CSV.
const CSV_FILES = {
  users: "Users.csv",
  accounts: "Accounts.csv",
  programs: "LoyaltyPrograms.csv",
  offers: "Offers.csv",
  history: "LoyaltyHistory.csv",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

// Месяцы нужны для человекочитаемых подписей в графике и деталях выплат.
const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

// Родительный падеж используется в датах вида "12 января 2025".
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// Небольшой CSV-парсер оставляет проект без внешних зависимостей.
function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    const next = clean[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  const [headers, ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ""), values[index] || ""]))
  );
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}

function number(value) {
  return Number.parseFloat(value || 0);
}

function monthKey(date) {
  return date.slice(0, 7);
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return `${capitalize(MONTHS[month - 1])} ${year}`;
}

function dateLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`;
}

function currencyLabel(currency) {
  return {
    rub: "руб",
    miles: "мили",
    "bravo-points": "браво",
  }[currency] || currency;
}

function programLabel(name) {
  return name === "Bravo" ? "Платинум" : name;
}

function categoryForProgram(program) {
  return {
    id: program.loyalty_program_id,
    name: programLabel(program.loyalty_program_name),
    description: `Выгода начисляется в валюте: ${currencyLabel(program.cashback_currency)}.`,
  };
}

// Загружаем исходные данные один раз при старте сервера.
function loadData() {
  const users = readCsv(CSV_FILES.users);
  const accounts = readCsv(CSV_FILES.accounts);
  const programs = readCsv(CSV_FILES.programs);
  const offers = readCsv(CSV_FILES.offers);
  const history = readCsv(CSV_FILES.history);
  const programById = new Map(programs.map((program) => [program.loyalty_program_id, program]));

  return {
    csvFiles: CSV_FILES,
    users,
    accounts,
    programs,
    offers,
    history,
    programById,
  };
}

const DATA = loadData();

function segmentRank(segment) {
  return { LOW: 1, MEDIUM: 2, HIGH: 3 }[segment] || 1;
}

// Прогноз строится по последним 3 месяцам и небольшой поправке на тренд.
function monthlyForecast(points) {
  if (!points.length) return 0;
  const lastThree = points.slice(-3);
  const avg = lastThree.reduce((sum, item) => sum + item.total, 0) / lastThree.length;
  const trend = lastThree.length > 1 ? lastThree[lastThree.length - 1].total - lastThree[0].total : 0;
  return Math.max(0, Math.round(avg + trend * 0.18));
}

function monthSerial(key) {
  const [year, month] = key.split("-").map(Number);
  return year * 12 + month;
}

function longestRewardStreak(monthly) {
  const points = monthly.map((item) => monthSerial(item.month)).sort((a, b) => a - b);
  let best = 0;
  let current = 0;
  let previous = null;

  for (const point of points) {
    current = previous !== null && point === previous + 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = point;
  }

  return best;
}

// Рекомендации экосистемы формируются на сервере, чтобы фронт только отображал готовые карточки.
function ecosystemProducts(segment, totals) {
  const totalValue = Object.values(totals).reduce((sum, item) => sum + item.amount, 0);
  const base = [
    {
      id: "mobile",
      name: "Т-Мобайл",
      short: "Связь",
      details: "Связь, eSIM и регулярные платежи внутри экосистемы Т.",
      benefits: [
        "Единая оплата связи и сервисов в приложении Т-Банка.",
        "Регулярные списания помогают поддерживать стабильную историю выгоды.",
        "Удобно подключить eSIM и управлять расходами без отдельного кабинета.",
      ],
      link: "https://www.tbank.ru/mobile-operator/",
      fit: segment === "LOW" ? 94 : 74,
    },
    {
      id: "invest",
      name: "Т-Инвестиции",
      short: "Инвестиции",
      details: "Инструменты для свободного остатка и долгосрочного накопления.",
      benefits: [
        "Можно направлять свободный остаток в отдельный финансовый контур.",
        "Подходит для долгосрочных целей и регулярного пополнения.",
        "Все операции и аналитика остаются внутри приложения Т-Банка.",
      ],
      link: "https://www.tbank.ru/invest/",
      fit: segment === "HIGH" ? 96 : segment === "MEDIUM" ? 87 : 65,
    },
    {
      id: "business",
      name: "Т-Бизнес",
      short: "Для предпринимателей",
      details: "Расчетный счет, платежные сервисы и инструменты для роста продаж.",
      benefits: [
        "Расчетный счет, платежи и сервисы для ежедневной работы бизнеса.",
        "Помогает разделить личные и рабочие финансы.",
        "Можно подключить дополнительные инструменты для продаж и учета.",
      ],
      link: "https://www.tbank.ru/business/",
      fit: segment === "HIGH" ? 91 : 70,
    },
  ];

  return base
    .map((product) => ({
      ...product,
      cta: "Подробнее",
      expectedBenefit: Math.round((totalValue / 12) * (product.fit / 100) * 0.2 + 150),
    }))
    .sort((a, b) => b.fit - a.fit);
}

// Достижения считаются от фиксированных максимумов из задания.
function buildAchievements(summary, monthly, accounts, categoryBreakdown) {
  const totalReward = categoryBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const bestMonthReward = monthly.reduce((max, item) => Math.max(max, item.total), 0);
  const metricValues = {
    rewardStreak: longestRewardStreak(monthly),
    accounts: accounts.length,
    totalReward,
    totalBalance: summary.totalBalance,
    bestMonthReward,
    totalTransactions: summary.totalTransactions,
  };
  const rules = [
    ["cashback_streak", "Получать кэшбэк несколько месяцев подряд", "Поддерживать начисления кэшбэка месяц за месяцем.", "rewardStreak", 12],
    ["active_accounts", "Иметь активные счета", "Пользоваться несколькими активными счетами.", "accounts", 3],
    ["cashback_total", "Накопить кэшбэк", "Собрать кэшбэк за весь период.", "totalReward", 50000],
    ["balance_holder", "Хранить деньги на балансе", "Держать общий баланс на счетах.", "totalBalance", 1000000],
    ["best_month_cashback", "Накопить максимум кэшбэка за 1 месяц", "Получить максимальный кэшбэк за один месяц.", "bestMonthReward", 5000],
    ["operations", "Совершать операции", "Накапливать операции в истории лояльности.", "totalTransactions", 100],
  ];

  const achievements = rules.map(([id, title, description, metric, target]) => {
    const item = {
      id,
      title,
      description,
      current: metricValues[metric] || 0,
      target,
    };
    const progress = Math.min(100, Math.round((item.current / item.target) * 100));
    return {
      ...item,
      current: Math.min(Math.round(item.current), target),
      progress,
      completed: progress >= 100,
    };
  });

  return {
    completed: achievements.filter((item) => item.completed).length,
    total: achievements.length,
    progress: Math.round(achievements.reduce((sum, item) => sum + item.progress, 0) / achievements.length),
    items: achievements,
  };
}

function offerPayload(offer, userSegment) {
  const available = segmentRank(offer.financial_segment) <= segmentRank(userSegment);
  return {
    id: offer.partner_id,
    partnerName: offer.partner_name,
    description: offer.short_description,
    logoUrl: offer.logo_url,
    color: offer.brand_color_hex,
    cashbackPercent: Number.parseInt(offer.cashback_percent, 10),
    available,
    score: Number.parseInt(offer.cashback_percent, 10) + (offer.financial_segment === userSegment ? 8 : 0) + (available ? 4 : 0),
  };
}

// Собираем полный личный раздел пользователя из пяти CSV-таблиц.
function buildDashboard(userId) {
  const user = DATA.users.find((item) => item.id === String(userId));
  if (!user) return null;

  const baseAccounts = DATA.accounts
    .filter((account) => account.user_id === user.id)
    .map((account) => {
      const program = DATA.programById.get(account.loyalty_program_id);
      const programName = programLabel(program.loyalty_program_name);
      const category = categoryForProgram(program);
      return {
        id: account.account_id,
        balance: number(account.current_balance),
        programId: account.loyalty_program_id,
        programName,
        currency: program.cashback_currency,
        currencyLabel: currencyLabel(program.cashback_currency),
        category,
      };
    });

  const accountIds = new Set(baseAccounts.map((account) => account.id));
  const history = DATA.history
    .filter((item) => accountIds.has(item.account_id))
    .map((item) => {
      const account = baseAccounts.find((candidate) => candidate.id === item.account_id);
      return {
        id: item.transaction_id,
        accountId: item.account_id,
        amount: number(item.cashback_amount),
        date: item.payout_date,
        dateLabel: dateLabel(item.payout_date),
        month: monthKey(item.payout_date),
        monthLabel: monthLabel(monthKey(item.payout_date)),
        programName: account.programName,
        currency: account.currency,
        currencyLabel: account.currencyLabel,
        category: account.category,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const totals = {};
  const categoryMap = new Map();
  const monthlyMap = new Map();

  for (const item of history) {
    if (!totals[item.currency]) {
      totals[item.currency] = {
        currency: item.currency,
        label: item.currencyLabel,
        amount: 0,
        transactions: 0,
      };
    }
    totals[item.currency].amount += item.amount;
    totals[item.currency].transactions += 1;

    if (!categoryMap.has(item.category.id)) {
      categoryMap.set(item.category.id, {
        id: item.category.id,
        name: item.category.name,
        description: item.category.description,
        amount: 0,
        transactions: 0,
      });
    }
    const categoryBucket = categoryMap.get(item.category.id);
    categoryBucket.amount += item.amount;
    categoryBucket.transactions += 1;

    if (!monthlyMap.has(item.month)) {
      monthlyMap.set(item.month, {
        month: item.month,
        label: item.monthLabel,
        total: 0,
        byCurrency: {},
        payouts: [],
      });
    }
    const monthBucket = monthlyMap.get(item.month);
    monthBucket.total += item.amount;
    monthBucket.byCurrency[item.currency] = (monthBucket.byCurrency[item.currency] || 0) + item.amount;
    monthBucket.payouts.push({
      id: item.id,
      date: item.date,
      dateLabel: item.dateLabel,
      amount: Math.round(item.amount),
      accountId: item.accountId,
      programName: item.programName,
      currency: item.currency,
      currencyLabel: item.currencyLabel,
      categoryName: item.category.name,
    });
  }

  const monthly = [...monthlyMap.values()]
    .map((item) => ({
      ...item,
      total: Math.round(item.total),
      payouts: item.payouts.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const forecast = monthlyForecast(monthly);
  const totalBalance = baseAccounts.reduce((sum, account) => sum + account.balance, 0);
  const totalsList = Object.values(totals).map((item) => ({ ...item, amount: Math.round(item.amount) }));
  const primaryCurrency = totalsList.slice().sort((a, b) => b.amount - a.amount)[0] || null;
  const categoryBreakdown = [...categoryMap.values()]
    .map((item) => ({ ...item, amount: Math.round(item.amount) }))
    .sort((a, b) => b.amount - a.amount);

  const accounts = baseAccounts.map((account) => {
    const accountHistory = history.filter((item) => item.accountId === account.id);
    const rewardTotal = accountHistory.reduce((sum, item) => sum + item.amount, 0);
    const lastPayout = accountHistory[accountHistory.length - 1];
    const accountMonths = new Set(accountHistory.map((item) => item.month)).size;
    return {
      ...account,
      rewardTotal: Math.round(rewardTotal),
      transactions: accountHistory.length,
      monthsWithRewards: accountMonths,
      monthlyAverage: accountMonths ? Math.round(rewardTotal / accountMonths) : 0,
      lastPayoutDate: lastPayout ? lastPayout.dateLabel : "пока нет выплат",
      recentPayouts: accountHistory.slice(-6).reverse().map((item) => ({
        id: item.id,
        dateLabel: item.dateLabel,
        amount: Math.round(item.amount),
        currencyLabel: item.currencyLabel,
        categoryName: item.category.name,
      })),
    };
  });

  const allOffers = DATA.offers
    .map((offer) => offerPayload(offer, user.financial_segment))
    .sort((a, b) => b.score - a.score);
  const featuredOffers = allOffers.filter((offer) => offer.available).slice(0, 8);

  const summary = {
    totalBalance: Math.round(totalBalance),
    totalTransactions: history.length,
    activePrograms: accounts.length,
    primaryCurrency,
    monthsWithRewards: monthly.length,
  };

  return {
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      phone: user.phone_number,
    },
    accounts,
    summary,
    totals: totalsList,
    monthly,
    history: history.map((item) => ({
      id: item.id,
      accountId: item.accountId,
      amount: Math.round(item.amount),
      date: item.date,
      dateLabel: item.dateLabel,
      month: item.month,
      monthLabel: item.monthLabel,
      programName: item.programName,
      currencyLabel: item.currencyLabel,
      categoryName: item.category.name,
    })),
    categoryBreakdown,
    forecast: {
      nextMonthTotal: forecast,
      threeMonthTotal: Math.round(forecast * 3.08),
    },
    offers: {
      featured: featuredOffers,
      all: allOffers,
    },
    products: ecosystemProducts(user.financial_segment, totals),
    achievements: buildAchievements(summary, monthly, accounts, categoryBreakdown),
    aiInsight: buildInsight(user.financial_segment, totalsList, featuredOffers, forecast),
  };
}

function buildInsight(segment, totals, offers, forecast) {
  const topReward = totals.slice().sort((a, b) => b.amount - a.amount)[0];
  const topOffer = offers[0];
  const productHint = segment === "HIGH" ? "инвестиционные продукты" : segment === "MEDIUM" ? "подписки и регулярные платежи" : "повседневные категории";
  return {
    title: "ИИ-помощник выгоды",
    text: topReward
      ? `Основной источник выгоды сейчас: ${topReward.label}. Если активировать ${topOffer?.partnerName || "партнерские акции"} и чаще оплачивать ${productHint} картой Т, прогноз на следующий месяц может вырасти примерно до ${forecast.toLocaleString("ru-RU")} бонусных единиц.`
      : "Пока мало истории для точного вывода. Начните с партнерских акций и подключите регулярные платежи.",
    actions: [
      "Показать акции с максимальным кешбэком",
      "Собрать план на месяц",
      "Найти потерянную выгоду",
    ],
  };
}

// Краткий список профилей для стартового экрана выбора пользователя.
function listUsers() {
  return DATA.users.map((user) => {
    const accounts = DATA.accounts.filter((account) => account.user_id === user.id);
    const totalBalance = accounts.reduce((sum, account) => sum + number(account.current_balance), 0);
    return {
      id: user.id,
      name: user.full_name,
      email: user.email,
      phone: user.phone_number,
      accounts: accounts.length,
      totalBalance: Math.round(totalBalance),
    };
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Слишком большой запрос"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase().replace(/[^\d+a-zа-яё@._-]/gi, "");
}

function authenticate(login) {
  const normalized = normalizeLogin(login);
  if (!normalized) return null;
  return DATA.users.find((user) => {
    const email = normalizeLogin(user.email);
    const phone = normalizeLogin(user.phone_number);
    const id = normalizeLogin(user.id);
    return normalized === email || normalized === phone || normalized === id;
  }) || null;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function allowCors(req, res) {
  const origin = req.headers.origin || "";
  const wildcard = ALLOWED_ORIGINS.includes("*");
  const allowedOrigin = wildcard ? "*" : ALLOWED_ORIGINS.find((item) => item === origin);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function handlePreflight(req, res, pathname) {
  if (req.method !== "OPTIONS" || !pathname.startsWith("/api/")) {
    return false;
  }
  allowCors(req, res);
  res.writeHead(204);
  res.end();
  return true;
}

function serveStatic(res, requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

function sendServerError(res, error) {
  console.error(error);
  if (res.headersSent) {
    res.end();
    return;
  }
  json(res, 500, { error: "Непредвиденная ошибка сервера. Попробуйте еще раз." });
}

// Минимальный HTTP-роутер для API и статического фронтенда.
async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  if (handlePreflight(req, res, parsed.pathname)) {
    return;
  }
  if (parsed.pathname.startsWith("/api/")) {
    allowCors(req, res);
  }
  if (parsed.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      csvFiles: DATA.csvFiles,
      users: DATA.users.length,
      offers: DATA.offers.length,
      programs: DATA.programs.length,
    });
    return;
  }
  if (parsed.pathname === "/api/login" && req.method === "POST") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const user = authenticate(payload.login);
      if (!user) {
        json(res, 401, { error: "Аккаунт не найден. Используйте email, телефон или id из тестовых данных." });
        return;
      }
      json(res, 200, {
        userId: user.id,
        name: user.full_name,
        email: user.email,
        phone: user.phone_number,
      });
    } catch (error) {
      json(res, 400, { error: "Не удалось прочитать данные входа" });
    }
    return;
  }
  if (parsed.pathname === "/api/users") {
    json(res, 200, listUsers());
    return;
  }
  const dashboardMatch = parsed.pathname.match(/^\/api\/users\/(\d+)\/dashboard$/);
  if (dashboardMatch) {
    const dashboard = buildDashboard(dashboardMatch[1]);
    if (!dashboard) {
      json(res, 404, { error: "Пользователь не найден" });
      return;
    }
    json(res, 200, dashboard);
    return;
  }
  let requestPath;
  try {
    requestPath = decodeURIComponent(parsed.pathname);
  } catch (error) {
    json(res, 400, { error: "Некорректный адрес запроса" });
    return;
  }
  serveStatic(res, requestPath);
}

async function app(req, res) {
  try {
    await handleRequest(req, res);
  } catch (error) {
    sendServerError(res, error);
  }
}

function start(port = PORT, host = HOST) {
  return http.createServer(app).listen(port, host, () => {
    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    console.log(`T-Bank Loyalty Hub: http://${displayHost}:${port}`);
  });
}

function runSelfTest() {
  assert.strictEqual(DATA.users.length, 30);
  assert.strictEqual(DATA.programs.length, 3);
  const first = buildDashboard(1);
  assert(first.user.name.includes("Иванов"));
  assert(first.totals.length > 0);
  assert(first.monthly.length > 0);
  assert(first.monthly[0].label.includes("2025"));
  assert(first.monthly[0].payouts.length > 0);
  assert(first.categoryBreakdown.length > 0);
  assert(first.offers.featured.length > 0);
  assert(first.offers.all.length === 40);
  assert(first.accounts.length > 0);
  assert(first.achievements.items.length > 0);
  assert(first.products.every((product) => product.link));
  assert(first.aiInsight.text.length > 20);
}

if (require.main === module) {
  start();
}

module.exports = { app, authenticate, buildDashboard, categoryForProgram, listUsers, parseCsv, runSelfTest, start };
