// Состояние экрана хранит выбранного пользователя, месяц графика и раскрытый счет.
const state = {
  userId: null,
  users: [],
  theme: localStorage.getItem("theme") || "dark",
  dashboard: null,
  selectedMonth: null,
  selectedAccountId: null,
  expandedOffers: false,
};

// Все DOM-узлы собираются один раз, чтобы рендер-функции были компактнее.
const el = {
  loginView: document.querySelector("#loginView"),
  appView: document.querySelector("#appView"),
  profileSearch: document.querySelector("#profileSearch"),
  profileList: document.querySelector("#profileList"),
  profileError: document.querySelector("#profileError"),
  visualUsers: document.querySelector("#visualUsers"),
  visualPrograms: document.querySelector("#visualPrograms"),
  visualOffers: document.querySelector("#visualOffers"),
  userName: document.querySelector("#userName"),
  userMeta: document.querySelector("#userMeta"),
  profileLabel: document.querySelector("#profileLabel"),
  status: document.querySelector("#status"),
  dashboard: document.querySelector(".dashboard"),
  metrics: document.querySelector("#metrics"),
  heroTitle: document.querySelector("#heroTitle"),
  heroText: document.querySelector("#heroText"),
  heroProgress: document.querySelector("#heroProgress"),
  heroProgressMeta: document.querySelector("#heroProgressMeta"),
  accounts: document.querySelector("#accounts"),
  accountDetail: document.querySelector("#accountDetail"),
  analyticsSummary: document.querySelector("#analyticsSummary"),
  chart: document.querySelector("#chart"),
  monthDetails: document.querySelector("#monthDetails"),
  forecastTotal: document.querySelector("#forecastTotal"),
  forecastText: document.querySelector("#forecastText"),
  aiTitle: document.querySelector("#aiTitle"),
  aiText: document.querySelector("#aiText"),
  aiActions: document.querySelector("#aiActions"),
  offersPanel: document.querySelector("#offersPanel"),
  offers: document.querySelector("#offers"),
  toggleOffers: document.querySelector("#toggleOffers"),
  achievementsCount: document.querySelector("#achievementsCount"),
  achievementProgress: document.querySelector("#achievementProgress"),
  achievements: document.querySelector("#achievements"),
  products: document.querySelector("#products"),
  themeToggle: document.querySelector("#themeToggle"),
  logoutButton: document.querySelector("#logoutButton"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value || 0));
}

function accountWord(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "счет";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "счета";
  return "счетов";
}

function splitMonth(label) {
  const [month, year] = label.split(" ");
  return { month, year };
}

function friendlyError(error, fallback = "Произошла непредвиденная ошибка. Попробуйте обновить страницу.") {
  return error instanceof Error && error.message ? error.message : fallback;
}

function handleUnexpectedError(error) {
  console.error(error);
  const message = friendlyError(error);
  if (el.appView.hidden) {
    showProfileSelection(message);
    return;
  }
  setStatus(message, true);
}

// Единая обертка над API: добавляет JSON-заголовки и нормализует ошибки.
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (error) {
    throw new Error("Не удалось подключиться к серверу. Проверьте, что проект запущен, и попробуйте еще раз.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Сервер временно недоступен. Попробуйте еще раз.");
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error("Сервер вернул некорректные данные. Попробуйте обновить страницу.");
  }
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("error", isError);
  el.status.hidden = false;
  el.dashboard.hidden = true;
}

function showProfileSelection(message = "") {
  el.loginView.hidden = false;
  el.appView.hidden = true;
  el.profileError.hidden = !message;
  el.profileError.textContent = message;
  renderProfiles();
}

function showApp() {
  el.loginView.hidden = true;
  el.appView.hidden = false;
}

// Стартовый экран показывает все аккаунты для моментального входа.
function renderProfiles() {
  const query = el.profileSearch.value.trim().toLowerCase();
  const users = state.users.filter((user) =>
    [user.id, user.name].some((value) => String(value).toLowerCase().includes(query))
  );

  el.profileList.innerHTML = users
    .map(
      (user) => `
        <button class="profile-option" type="button" data-user-id="${user.id}">
          <span>
            <strong>${escapeHtml(user.name)}</strong>
            <small>ID ${escapeHtml(user.id)} · ${user.accounts} ${accountWord(user.accounts)}</small>
          </span>
          <span class="profile-stats">
            <b>${user.accounts} ${accountWord(user.accounts)}</b>
            <small>${formatNumber(user.totalBalance)} ₽</small>
          </span>
        </button>
      `
    )
    .join("");

  if (!users.length) {
    el.profileList.innerHTML = `<div class="empty-state">Клиенты не найдены</div>`;
  }
}

function metric(label, value, hint) {
  return `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}

// Карточки счетов раскрываются только по кнопке "Подробнее".
function renderAccounts() {
  const data = state.dashboard;

  el.accounts.innerHTML = data.accounts
    .map(
      (account) => `
        <article class="account-card ${account.id === state.selectedAccountId ? "active" : ""}">
          <span class="account-topline">
            <strong>${escapeHtml(account.programName)}</strong>
          </span>
          <span class="account-balance">${formatNumber(account.balance)} ₽</span>
          <span class="account-bonus">
            <small>Кешбэк и бонусы</small>
            <strong>${formatNumber(account.rewardTotal)} ${escapeHtml(account.currencyLabel)}</strong>
          </span>
          <button class="account-more" type="button" data-account-id="${account.id}">Подробнее</button>
        </article>
      `
    )
    .join("");

  renderAccountDetail();
}

function renderAccountDetail() {
  const account = state.dashboard.accounts.find((item) => item.id === state.selectedAccountId);
  if (!account) {
    el.accountDetail.hidden = true;
    el.accountDetail.innerHTML = "";
    return;
  }

  el.accountDetail.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="eyebrow">Подробная информация о счете</p>
        <h3>${escapeHtml(account.programName)}</h3>
      </div>
      <div class="detail-actions">
        <span class="badge account-currency-badge">${escapeHtml(account.currencyLabel)}</span>
        <button id="collapseAccount" class="ghost-button" type="button">Свернуть</button>
      </div>
    </div>
    <div class="detail-grid">
      <span><strong>${formatNumber(account.rewardTotal)}</strong><small>получено всего</small></span>
      <span><strong>${formatNumber(account.monthlyAverage)}</strong><small>в среднем за месяц</small></span>
      <span><strong>${formatNumber(account.transactions)}</strong><small>выплат</small></span>
      <span><strong>${escapeHtml(account.lastPayoutDate)}</strong><small>последняя выплата</small></span>
    </div>
    <p>${escapeHtml(account.category.description)}</p>
    <div class="payout-list">
      ${account.recentPayouts
        .map(
          (payout) => `
            <div>
              <span>${escapeHtml(payout.dateLabel)}</span>
              <strong>${formatNumber(payout.amount)} ${escapeHtml(payout.currencyLabel)}</strong>
              <small>${escapeHtml(payout.categoryName)}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
  el.accountDetail.hidden = false;
}

// Аналитика строит сводку и интерактивный график выплат по месяцам.
function renderChart() {
  const monthly = state.dashboard.monthly.slice(-12);
  const max = Math.max(...monthly.map((item) => item.total), 1);
  const total = monthly.reduce((sum, item) => sum + item.total, 0);
  const average = monthly.length ? Math.round(total / monthly.length) : 0;
  const best = monthly.reduce((leader, item) => (item.total > leader.total ? item : leader), { total: 0, label: "-" });
  el.chart.style.setProperty("--month-count", monthly.length || 1);
  el.analyticsSummary.innerHTML = [
    ["За период", formatNumber(total)],
    ["В среднем", formatNumber(average)],
    ["Лучший месяц", best.label],
  ]
    .map(
      ([label, value]) => `
        <span>
          <small>${escapeHtml(label)}</small>
          <strong>${escapeHtml(value)}</strong>
        </span>
      `
    )
    .join("");

  el.chart.innerHTML = monthly
    .map((item) => {
      const height = Math.max(16, Math.round((item.total / max) * 92));
      const label = splitMonth(item.label);
      const active = item.month === state.selectedMonth;
      return `
        <button class="bar-wrap ${active ? "active" : ""}" type="button" data-month="${item.month}">
          <span class="bar" style="height:${height}%">${active ? `<span class="bar-value">${formatNumber(item.total)}</span>` : ""}</span>
          <span class="month-label">${escapeHtml(label.month)}<small>${escapeHtml(label.year)}</small></span>
        </button>
      `;
    })
    .join("");

  renderMonthDetails();
}

function renderMonthDetails() {
  const month = state.dashboard.monthly.find((item) => item.month === state.selectedMonth);
  if (!month) {
    el.monthDetails.innerHTML = "";
    return;
  }

  el.monthDetails.innerHTML = `
    <div class="detail-head compact">
      <div>
        <p class="eyebrow">${escapeHtml(month.label)}</p>
        <h3>Даты получения кешбэка</h3>
      </div>
      <strong>${formatNumber(month.total)}</strong>
    </div>
    <div class="payout-list month-payouts">
      ${month.payouts
        .map(
          (payout) => `
            <div>
              <span>${escapeHtml(payout.dateLabel)}</span>
              <strong>${formatNumber(payout.amount)} ${escapeHtml(payout.currencyLabel)}</strong>
              <small>${escapeHtml(payout.programName)} · ${escapeHtml(payout.categoryName)}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

// Партнеры берутся из CSV через API; до раскрытия показываем 8 доступных.
function renderOffers() {
  const availableOffers = state.dashboard.offers.all.filter((offer) => offer.available);
  const offers = state.expandedOffers ? availableOffers : state.dashboard.offers.featured.filter((offer) => offer.available);
  el.offersPanel.classList.toggle("expanded", state.expandedOffers);
  el.toggleOffers.textContent = state.expandedOffers ? "Свернуть" : "Показать все";
  el.offers.innerHTML = offers
    .map(
      (offer) => `
        <article class="offer ${offer.available ? "" : "locked"}" style="--offer-color:${offer.color}">
          <div class="offer-logo">
            <img src="${escapeHtml(offer.logoUrl)}" alt="" loading="lazy" onerror="this.remove()" />
          </div>
          <div>
            <strong>${escapeHtml(offer.partnerName)}</strong>
            <span>${escapeHtml(offer.description)}</span>
          </div>
          <b>${offer.cashbackPercent}%</b>
        </article>
      `
    )
    .join("");
}

// Достижения отображают серверные проценты и общий средний прогресс.
function renderAchievements() {
  const { achievements } = state.dashboard;
  el.achievementsCount.textContent = `${achievements.completed}/${achievements.total}`;
  el.heroProgress.textContent = `${achievements.progress}%`;
  el.heroProgressMeta.textContent = `Средний прогресс ${achievements.progress}%, выполнено ${achievements.completed} из ${achievements.total}`;
  el.heroProgress.closest(".hero-meter").style.setProperty("--hero-progress", `${achievements.progress}%`);
  el.achievementProgress.style.width = `${achievements.progress}%`;
  el.achievements.innerHTML = achievements.items
    .map(
      (item) => `
        <article class="achievement ${item.completed ? "completed" : ""}">
          <div class="achievement-copy">
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.description)}</p>
          </div>
          <span class="achievement-status">${item.completed ? "Выполнено" : `${item.progress}%`}</span>
          <div class="mini-progress"><span style="width:${item.progress}%"></span></div>
          <small class="achievement-progress-label">${formatNumber(item.current)} / ${formatNumber(item.target)}</small>
        </article>
      `
    )
    .join("");
}

// Экосистема отображает три подробные карточки продуктов.
function renderProducts() {
  el.products.innerHTML = state.dashboard.products
    .map(
      (product) => `
        <article class="product product-detailed">
          <div class="product-card-head">
            <span>${escapeHtml(product.short)}</span>
            <strong>${escapeHtml(product.name)}</strong>
          </div>
          <p>${escapeHtml(product.details)}</p>
          <div class="product-facts">
            <span>Потенциал выгоды ${product.fit}%</span>
            <span>+${formatNumber(product.expectedBenefit)} в месяц</span>
          </div>
          <ul class="product-benefits">
            ${(product.benefits || []).map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("")}
          </ul>
          <a class="product-link" href="${escapeHtml(product.link)}" target="_blank" rel="noreferrer">${escapeHtml(product.cta)}</a>
        </article>
      `
    )
    .join("");
}

// Главный рендер связывает все блоки личного кабинета после загрузки API.
function renderDashboard(data) {
  state.dashboard = data;
  state.selectedMonth = null;
  state.selectedAccountId = null;
  state.expandedOffers = false;

  const totalReward = data.totals.reduce((sum, item) => sum + item.amount, 0);

  el.profileLabel.textContent = "Ваш профиль";
  el.userName.textContent = data.user.name;
  el.userMeta.textContent = `${data.user.email} · ${data.accounts.length} ${accountWord(data.accounts.length)}`;
  el.heroTitle.textContent = `${formatNumber(totalReward)} бонусных единиц`;
  el.heroText.textContent = `Уже выплачено за ${data.summary.monthsWithRewards} месяцев. Прогноз на следующий месяц: ${formatNumber(data.forecast.nextMonthTotal)}.`;

  el.metrics.innerHTML = [
    metric("Выплачено всего", formatNumber(totalReward), "руб, мили и браво"),
    metric("Операций", formatNumber(data.summary.totalTransactions), "история лояльности"),
    metric("Программы", formatNumber(data.summary.activePrograms), data.accounts.map((item) => item.programName).join(", ")),
    metric("Баланс в Т", `${formatNumber(data.summary.totalBalance)} ₽`, "суммарный остаток"),
  ].join("");

  el.forecastTotal.textContent = formatNumber(data.forecast.threeMonthTotal);
  el.forecastText.textContent = "Прогноз учитывает последние выплаты и динамику активности внутри экосистемы.";

  el.aiTitle.textContent = data.aiInsight.title;
  el.aiText.textContent = data.aiInsight.text;
  el.aiActions.innerHTML = data.aiInsight.actions.map((action) => `<button type="button">${escapeHtml(action)}</button>`).join("");

  renderAccounts();
  renderChart();
  renderOffers();
  renderAchievements();
  renderProducts();

  el.status.hidden = true;
  el.dashboard.hidden = false;
}

async function loadDashboard(userId) {
  showApp();
  setStatus("Собираем ваш личный раздел...");
  try {
    const data = await api(`/api/users/${userId}/dashboard`);
    state.userId = String(userId);
    renderDashboard(data);
  } catch (error) {
    state.userId = null;
    showProfileSelection(friendlyError(error));
  }
}

async function loadProfiles() {
  try {
    const [users, health] = await Promise.all([api("/api/users"), api("/api/health")]);
    state.users = users;
    el.visualUsers.textContent = formatNumber(health.users);
    el.visualPrograms.textContent = formatNumber(health.programs);
    el.visualOffers.textContent = `${formatNumber(health.offers)} партнеров`;
    showProfileSelection();
  } catch (error) {
    showProfileSelection(friendlyError(error, "Не удалось загрузить список клиентов. Проверьте подключение к серверу."));
  }
}

// Обработчики ниже переключают раскрытые блоки без перезагрузки страницы.
el.profileSearch.addEventListener("input", renderProfiles);

el.profileList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-user-id]");
  if (!card) return;
  loadDashboard(card.dataset.userId);
});

el.accounts.addEventListener("click", (event) => {
  const button = event.target.closest("[data-account-id]");
  if (!button) return;
  const isSameAccount = state.selectedAccountId === button.dataset.accountId;
  state.selectedAccountId = isSameAccount ? null : button.dataset.accountId;
  renderAccounts();
  if (!isSameAccount) {
    el.accountDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

el.accountDetail.addEventListener("click", (event) => {
  if (!event.target.closest("#collapseAccount")) return;
  state.selectedAccountId = null;
  renderAccounts();
});

el.chart.addEventListener("click", (event) => {
  const item = event.target.closest("[data-month]");
  if (!item) return;
  state.selectedMonth = state.selectedMonth === item.dataset.month ? null : item.dataset.month;
  renderChart();
});

el.toggleOffers.addEventListener("click", () => {
  state.expandedOffers = !state.expandedOffers;
  renderOffers();
});

el.logoutButton.addEventListener("click", () => {
  state.userId = null;
  state.dashboard = null;
  showProfileSelection();
});

el.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", state.theme);
  document.documentElement.dataset.theme = state.theme;
});

document.documentElement.dataset.theme = state.theme;
window.addEventListener("error", (event) => {
  handleUnexpectedError(event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  handleUnexpectedError(event.reason);
});
loadProfiles();
