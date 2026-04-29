const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { app, authenticate, buildDashboard, listUsers, runSelfTest } = require("./server");

// HTTP-хелперы проверяют API без запуска внешнего браузера.
function request(server, requestPath) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: "127.0.0.1", port, path: requestPath }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

function postJson(server, requestPath, payload) {
  const { port } = server.address();
  const body = JSON.stringify(payload);
  return postRaw(server, requestPath, body);
}

function postRaw(server, requestPath, body) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body: responseBody }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function withServer(check) {
  const server = http.createServer(app).listen(0);
  try {
    return await check(server);
  } finally {
    server.close();
  }
}

// Ровно пять тестов закрывают данные, расчет дашборда и основные API-сценарии.
const tests = [];
function test(name, check) {
  tests.push({ name, check });
}

test("1. Исходные CSV и пользователи", () => {
  runSelfTest();

  const dataFiles = fs.readdirSync(path.join(__dirname, "data")).filter((file) => file.endsWith(".csv")).sort();
  const expectedFiles = ["Accounts.csv", "LoyaltyHistory.csv", "LoyaltyPrograms.csv", "Offers.csv", "Users.csv"];
  assert.deepStrictEqual(dataFiles, expectedFiles, "должны использоваться только 5 исходных CSV");

  const users = listUsers();
  assert.strictEqual(users.length, 30, "ожидалось 30 пользователей");
  assert(authenticate(users[0].email), "авторизация по email не работает");
  assert(authenticate(users[0].id), "авторизация по id не работает");
});

test("2. Расчет личного дашборда", () => {
  const users = listUsers();
  const dashboard = buildDashboard(users[0].id);

  assert(dashboard.forecast.nextMonthTotal, "прогноз не рассчитан");
  assert(dashboard.products.every((product) => product.link && product.details), "ссылки и детали продуктов не сформированы");
  assert(dashboard.products.every((product) => Array.isArray(product.benefits) && product.benefits.length >= 3), "экосистема должна отдавать подробные преимущества продуктов");
  assert(dashboard.categoryBreakdown.length, "категории кешбэка не сформированы из программ лояльности");
  assert(/[А-ЯЁа-яё]+ \d{4}/.test(dashboard.monthly[0].label), "месяцы должны быть словами");
  assert(dashboard.monthly[0].payouts.length, "даты выплат по месяцу не отданы");
  assert(dashboard.accounts[0].recentPayouts.length, "подробности по счету не отданы");
  assert.strictEqual(dashboard.offers.all.length, 40, "список всех партнеров должен содержать 40 офферов");
  assert.strictEqual(dashboard.offers.featured.length, 8, "до раскрытия должно быть видно 8 партнеров");
  assert(dashboard.offers.all.every((offer) => offer.logoUrl), "логотипы партнеров не прочитаны из Offers.csv");
  assert(!dashboard.totals.some((item) => item.label === "рубли" || item.label === "Браво"), "старые подписи валют не должны возвращаться");
});

test("3. Достижения и прогресс-бары", () => {
  const dashboard = buildDashboard(listUsers()[0].id);
  const expectedAchievements = [
    "Получать кэшбэк несколько месяцев подряд",
    "Иметь активные счета",
    "Накопить кэшбэк",
    "Хранить деньги на балансе",
    "Накопить максимум кэшбэка за 1 месяц",
    "Совершать операции",
  ];
  const expectedTargets = [12, 3, 50000, 1000000, 5000, 100];

  assert.deepStrictEqual(dashboard.achievements.items.map((item) => item.title), expectedAchievements, "список достижений не соответствует заданию");
  assert.deepStrictEqual(dashboard.achievements.items.map((item) => item.target), expectedTargets, "максимумы достижений рассчитаны неверно");
  assert(dashboard.achievements.items.some((item) => item.completed), "выполненные достижения не рассчитаны");
  assert(!dashboard.achievements.items.some((item) => item.description.includes("Максимум")), "в описании достижений не должно быть слова Максимум");

  const averageProgress = Math.round(dashboard.achievements.items.reduce((sum, item) => sum + item.progress, 0) / dashboard.achievements.items.length);
  assert.strictEqual(dashboard.achievements.progress, averageProgress, "общий прогресс должен учитывать частичное выполнение");
});

test("4. Health API и список пользователей", async () => {
  await withServer(async (server) => {
    const health = await request(server, "/api/health");
    assert.strictEqual(health.status, 200, "health endpoint failed");
    const parsedHealth = JSON.parse(health.body);
    assert(parsedHealth.csvFiles && Object.keys(parsedHealth.csvFiles).length === 5, "health должен ссылаться на 5 исходных CSV");

    const apiUsers = await request(server, "/api/users");
    assert.strictEqual(apiUsers.status, 200, "список пользователей не отдан");
    const parsedUsers = JSON.parse(apiUsers.body);
    assert.strictEqual(parsedUsers.length, 30, "API должен отдавать 30 пользователей");
    assert(!parsedUsers[0].name.includes("Р"), "кириллица прочитана некорректно");
    assert(!("segment" in parsedUsers[0]) && !("segmentName" in parsedUsers[0]), "сегменты не должны отдаваться на стартовый экран");
  });
});

test("5. Login API и Dashboard API", async () => {
  const users = listUsers();
  await withServer(async (server) => {
    const login = await postJson(server, "/api/login", { login: users[0].email });
    const parsedLogin = JSON.parse(login.body);
    assert.strictEqual(login.status, 200, "login endpoint failed");
    assert.strictEqual(parsedLogin.userId, users[0].id, "login вернул неверного пользователя");

    const badLogin = await postJson(server, "/api/login", { login: "unknown@example.test" });
    assert.strictEqual(badLogin.status, 401, "неверный логин должен возвращать 401");

    const malformedLogin = await postRaw(server, "/api/login", "{bad-json");
    assert.strictEqual(malformedLogin.status, 400, "битый JSON не должен ронять приложение");

    const apiDashboard = await request(server, `/api/users/${users[0].id}/dashboard`);
    assert.strictEqual(apiDashboard.status, 200, "dashboard endpoint failed");
    const parsedDashboard = JSON.parse(apiDashboard.body);
    assert(!("segment" in parsedDashboard.user) && !("segmentName" in parsedDashboard.user), "сегменты не должны отдаваться в личный раздел");
    assert.strictEqual(parsedDashboard.achievements.items.length, 6, "API должен отдавать 6 достижений");
    assert.strictEqual(parsedDashboard.offers.all.length, 40, "партнеры не отданы API");
    assert(parsedDashboard.products.every((product) => product.benefits.length >= 3), "API должен отдавать подробные карточки экосистемы");

    const missing = await request(server, "/api/users/999/dashboard");
    assert.strictEqual(missing.status, 404, "404 для отсутствующего пользователя не работает");

    const badUrl = await request(server, "/%E0%A4%A");
    assert.strictEqual(badUrl.status, 400, "некорректный URL не должен ронять сервер");
  });
});

(async () => {
  for (const { name, check } of tests) {
    await check();
    console.log(`✓ ${name}`);
  }
  console.log(`All tests passed: ${tests.length} рабочих тестов`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
