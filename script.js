
// ============================================
// TRAVEL PLANNER - MAIN JAVASCRIPT
// ============================================

const $ = id => document.getElementById(id);

function readData(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const weatherDescriptions = {
  0: "Clear sky ☀️", 1: "Mainly clear 🌤️",
  2: "Partly cloudy ⛅", 3: "Overcast ☁️",
  45: "Foggy 🌫️", 48: "Foggy 🌫️",
  51: "Light drizzle 🌦️", 53: "Drizzle 🌦️",
  55: "Heavy drizzle 🌧️", 61: "Light rain 🌧️",
  63: "Rain 🌧️", 65: "Heavy rain 🌧️",
  71: "Light snow ❄️", 73: "Snow ❄️",
  75: "Heavy snow ❄️", 80: "Rain showers 🌦️",
  81: "Rain showers 🌧️", 82: "Heavy showers ⛈️",
  95: "Thunderstorm ⛈️", 96: "Thunderstorm ⛈️",
  99: "Heavy thunderstorm ⛈️"
};

// ============================================
// THEME AND MOBILE NAVIGATION
// ============================================

function toggleTheme() {
  const dark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("travelTheme", dark ? "dark" : "light");
  updateThemeButton();
}

function updateThemeButton() {
  const button = $("themeButton");
  if (button) {
    button.textContent = document.body.classList.contains("dark-mode")
      ? "☀️ Light mode"
      : "🌙 Dark mode";
  }
}

function toggleMenu() {
  $("mainNav")?.classList.toggle("nav-open");
}

document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("travelTheme") === "dark") {
    document.body.classList.add("dark-mode");
  }
  updateThemeButton();

  displayFavorites();
  displayItinerary();
  displayPackingList();
  displayExpenses();
  updateDashboard();

  const savedBudget = readData("travelBudget", {});
  ["transport", "hotel", "food", "shopping", "other"].forEach(id => {
    if ($(id) && savedBudget[id] !== undefined) $(id).value = savedBudget[id];
  });

  if ($("budgetResult") && Object.keys(savedBudget).length) calculateBudget();

  if ($("map")) initializeMap();
});


// ============================================
// WEATHER + 7-DAY FORECAST + PACKING TIPS
// ============================================

async function getCoordinates(city) {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  );

  if (!response.ok) throw new Error("Location service unavailable");

  const data = await response.json();
  if (!data.results?.length) throw new Error(`City not found: ${city}`);

  return data.results[0];
}

function getPackingTips(code, rainChance, maxTemp) {
  const tips = [];

  if (maxTemp >= 30) tips.push("Carry light cotton clothes and sunscreen.");
  if (maxTemp <= 15) tips.push("Pack warm clothes or a jacket.");
  if (rainChance >= 40 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(code)) {
    tips.push("Carry an umbrella or raincoat.");
  }
  if ([45,48].includes(code)) tips.push("Take care while travelling in fog.");
  if (!tips.length) tips.push("Pack comfortable clothes and walking shoes.");

  return tips;
}

async function getWeather() {
  const city = $("cityInput")?.value.trim();
  const result = $("weatherResult");
  if (!result) return;

  if (!city) {
    result.textContent = "Please enter a city name.";
    return;
  }

  result.innerHTML = "⏳ Loading weather...";

  try {
    const place = await getCoordinates(city);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather service unavailable");

    const data = await response.json();
    const c = data.current;
    const d = data.daily;

    const forecast = d.time.map((date, i) => `
      <article class="weather-box">
        <strong>${new Date(date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}</strong>
        <p>${weatherDescriptions[d.weather_code[i]] || "Weather"}</p>
        <h3>${d.temperature_2m_max[i]}° / ${d.temperature_2m_min[i]}°C</h3>
        <small>Rain: ${d.precipitation_probability_max[i] ?? "N/A"}%</small>
      </article>
    `).join("");

    const tips = getPackingTips(
      c.weather_code,
      Math.max(...d.precipitation_probability_max.map(v => v ?? 0)),
      Math.max(...d.temperature_2m_max)
    );

    result.innerHTML = `
      <h2>${place.name}, ${place.country}</h2>
      <div class="current-weather">
        <div class="temperature">${c.temperature_2m}°C</div>
        <h3>${weatherDescriptions[c.weather_code] || "Current weather"}</h3>
      </div>
      <div class="weather-grid">
        <div class="weather-box"><strong>${c.apparent_temperature}°C</strong>Feels like</div>
        <div class="weather-box"><strong>${c.relative_humidity_2m}%</strong>Humidity</div>
        <div class="weather-box"><strong>${c.wind_speed_10m} km/h</strong>Wind</div>
      </div>
      <h2 class="section-title">📅 7-Day Forecast</h2>
      <div class="forecast-grid">${forecast}</div>
      <div class="tips-box">
        <h3>🎒 Weather-based packing tips</h3>
        ${tips.map(t => `<p>• ${t}</p>`).join("")}
      </div>
    `;
  } catch (error) {
    result.textContent = error.message || "Unable to fetch weather.";
  }
}


// ============================================
// CURRENCY CONVERTER
// ============================================

async function convertCurrency() {
  const amount = Number($("amount")?.value);
  const from = $("fromCurrency")?.value;
  const to = $("toCurrency")?.value;
  const result = $("currencyResult");

  if (!result) return;

  if (!Number.isFinite(amount) || amount <= 0) {
    result.textContent = "Enter a valid amount greater than zero.";
    return;
  }

  if (from === to) {
    result.innerHTML = `<h2>${amount.toFixed(2)} ${to}</h2>`;
    return;
  }

  result.textContent = "Getting latest available exchange rate...";

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/${from}/${to}`);
    if (!response.ok) throw new Error("Rate not available for this currency pair.");

    const data = await response.json();
    const converted = amount * data.rate;

    result.innerHTML = `
      <h2>Conversion Result 💱</h2>
      <p>${amount.toLocaleString()} ${from}</p>
      <div class="temperature">${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}</div>
      <p>1 ${from} = ${data.rate} ${to}</p>
      <small>Rate date: ${data.date}</small>
    `;
  } catch (error) {
    result.textContent = error.message || "Currency conversion failed.";
  }
}


// ============================================
// MAP + CITY SEARCH + DRIVING ROUTE
// ============================================

let travelMap = null;
let mapMarker = null;
let routeLayer = null;
let routeMarkers = [];

function initializeMap() {
  if (!$("map") || typeof L === "undefined") return;

  if (travelMap) travelMap.remove();

  travelMap = L.map("map").setView([20, 0], 2);

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri and its contributors",
      maxZoom: 19
    }
  ).addTo(travelMap);
}

function clearRoute() {
  if (routeLayer) travelMap.removeLayer(routeLayer);
  routeMarkers.forEach(marker => travelMap.removeLayer(marker));
  routeMarkers = [];
}

async function searchMap() {
  const city = $("mapCityInput")?.value.trim();
  const message = $("mapMessage");
  if (!city || !message) {
    if (message) message.textContent = "Enter a city name.";
    return;
  }

  message.textContent = "Searching...";

  try {
    const place = await getCoordinates(city);
    if (!travelMap) initializeMap();
    if (!travelMap) throw new Error("Map could not be loaded.");

    clearRoute();
    if (mapMarker) travelMap.removeLayer(mapMarker);

    mapMarker = L.marker([place.latitude, place.longitude])
      .addTo(travelMap)
      .bindPopup(`${place.name}, ${place.country}`)
      .openPopup();

    travelMap.setView([place.latitude, place.longitude], 12);
    message.textContent = `Found ${place.name}, ${place.country}`;
    setTimeout(() => travelMap.invalidateSize(), 150);
  } catch (error) {
    message.textContent = error.message;
  }
}

async function findRoute() {
  const start = $("routeStart")?.value.trim();
  const end = $("routeEnd")?.value.trim();
  const message = $("routeMessage");

  if (!start || !end || !message) {
    if (message) message.textContent = "Enter both starting point and destination.";
    return;
  }

  message.textContent = "Finding driving route...";

  try {
    const [origin, destination] = await Promise.all([
      getCoordinates(start),
      getCoordinates(end)
    ]);

    if (!travelMap) initializeMap();
    if (!travelMap) throw new Error("Map could not be loaded.");

    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Route service unavailable.");

    const data = await response.json();
    if (data.code !== "Ok" || !data.routes.length) throw new Error("No driving route found.");

    clearRoute();
    if (mapMarker) travelMap.removeLayer(mapMarker);

    const route = data.routes[0];

    routeLayer = L.geoJSON(route.geometry, {
      style: { color: "#2563eb", weight: 5 }
    }).addTo(travelMap);

    routeMarkers = [
      L.marker([origin.latitude, origin.longitude]).addTo(travelMap).bindPopup("Start: " + origin.name),
      L.marker([destination.latitude, destination.longitude]).addTo(travelMap).bindPopup("Destination: " + destination.name)
    ];

    travelMap.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });

    message.innerHTML = `
      <strong>${origin.name} → ${destination.name}</strong><br>
      Distance: ${(route.distance / 1000).toFixed(1)} km<br>
      Estimated driving time: ${Math.round(route.duration / 60)} minutes
      <br><small>Estimates only; actual conditions may vary.</small>
    `;
  } catch (error) {
    message.textContent = error.message || "Unable to find route.";
  }
}


// ============================================
// BUDGET CALCULATOR
// ============================================

const budgetFields = ["transport", "hotel", "food", "shopping", "other"];

function calculateBudget() {
  const budget = {};
  let total = 0;

  for (const id of budgetFields) {
    const value = Number($(id)?.value) || 0;
    if (value < 0) {
      $("budgetResult").textContent = "Expenses cannot be negative.";
      return;
    }
    budget[id] = value;
    total += value;
  }

  budget.total = total;
  saveData("travelBudget", budget);

  if ($("budgetResult")) {
    $("budgetResult").innerHTML = `
      <h2>Your Estimated Travel Budget</h2>
      ${budgetFields.map(id => `<p>${id[0].toUpperCase() + id.slice(1)}: ₹${budget[id].toLocaleString("en-IN")}</p>`).join("")}
      <hr>
      <div class="temperature">₹${total.toLocaleString("en-IN")}</div>
      <p>Estimated total expenses</p>
    `;
  }

  updateDashboard();
}


// ============================================
// EXPENSE TRACKER
// ============================================

function addExpense() {
  const name = $("expenseName")?.value.trim();
  const amount = Number($("expenseAmount")?.value);
  const category = $("expenseCategory")?.value;

  if (!name || !Number.isFinite(amount) || amount <= 0) {
    alert("Enter an expense name and a valid amount.");
    return;
  }

  const expenses = readData("travelExpenses");
  expenses.push({
    name,
    amount,
    category,
    date: new Date().toLocaleDateString("en-IN")
  });

  saveData("travelExpenses", expenses);
  $("expenseName").value = "";
  $("expenseAmount").value = "";
  displayExpenses();
}

function displayExpenses() {
  const list = $("expenseList");
  if (!list) return;

  const expenses = readData("travelExpenses");
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);

  $("expenseTotal").textContent = `Total recorded expenses: ₹${total.toLocaleString("en-IN")}`;

  list.innerHTML = expenses.length
    ? expenses.map((item, index) => `
      <div class="card expense-card">
        <div>
          <h3>${escapeHTML(item.name)}</h3>
          <p>${escapeHTML(item.category)} · ${item.date}</p>
        </div>
        <strong>₹${item.amount.toLocaleString("en-IN")}</strong>
        <button class="btn btn-small" onclick="removeExpense(${index})">Remove</button>
      </div>
    `).join("")
    : "<p>No expenses recorded yet.</p>";
}

function removeExpense(index) {
  const expenses = readData("travelExpenses");
  expenses.splice(index, 1);
  saveData("travelExpenses", expenses);
  displayExpenses();
  updateDashboard();
}

function clearExpenses() {
  if (!confirm("Clear all recorded expenses?")) return;
  saveData("travelExpenses", []);
  displayExpenses();
  updateDashboard();
}


// ============================================
// FAVOURITE DESTINATIONS
// ============================================

async function addFavorite() {
  const input = $("favoriteCity");
  const city = input?.value.trim();

  if (!city) {
    alert("Enter a destination.");
    return;
  }

  try {
    const place = await getCoordinates(city);
    const favorites = readData("travelFavorites");

    if (favorites.some(p => p.name.toLowerCase() === place.name.toLowerCase())) {
      alert("This destination is already saved.");
      return;
    }

    favorites.push({
      name: place.name,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude
    });

    saveData("travelFavorites", favorites);
    input.value = "";
    displayFavorites();
    updateDashboard();
  } catch (error) {
    alert(error.message);
  }
}

function displayFavorites() {
  const list = $("favoritesList");
  if (!list) return;

  const favorites = readData("travelFavorites");

  list.innerHTML = favorites.length
    ? favorites.map((place, index) => `
      <article class="card">
        <div class="destination-icon">📍</div>
        <h2>${escapeHTML(place.name)}</h2>
        <p>${escapeHTML(place.country)}</p>
        <button class="btn btn-small" onclick="removeFavorite(${index})">Remove</button>
      </article>
    `).join("")
    : "<p class='empty-state'>Your favourite destinations will appear here.</p>";
}

function removeFavorite(index) {
  const favorites = readData("travelFavorites");
  favorites.splice(index, 1);
  saveData("travelFavorites", favorites);
  displayFavorites();
  updateDashboard();
}


// ============================================
// ITINERARY + COUNTDOWN + PRINT
// ============================================

function addItinerary() {
  const destination = $("tripDestination")?.value.trim();
  const date = $("tripDate")?.value;
  const activity = $("tripActivity")?.value.trim();

  if (!destination || !date || !activity) {
    alert("Please complete all itinerary fields.");
    return;
  }

  const trips = readData("travelItinerary");
  trips.push({ destination, date, activity });

  trips.sort((a, b) => a.date.localeCompare(b.date));
  saveData("travelItinerary", trips);

  $("tripActivity").value = "";
  displayItinerary();
  updateDashboard();
}

function displayItinerary() {
  const list = $("itineraryList");
  if (!list) return;

  const trips = readData("travelItinerary");

  list.innerHTML = trips.length
    ? trips.map((trip, index) => `
      <article class="card">
        <h2>📍 ${escapeHTML(trip.destination)}</h2>
        <p><strong>Date:</strong> ${trip.date}</p>
        <p><strong>Activity:</strong> ${escapeHTML(trip.activity)}</p>
        <button class="btn btn-small" onclick="removeItinerary(${index})">Delete</button>
      </article>
    `).join("")
    : "<p class='empty-state'>Your itinerary will appear here after you add a trip.</p>";

  updateCountdown();
}

function removeItinerary(index) {
  const trips = readData("travelItinerary");
  trips.splice(index, 1);
  saveData("travelItinerary", trips);
  displayItinerary();
  updateDashboard();
}

function updateCountdown() {
  const output = $("tripCountdown");
  if (!output) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureTrips = readData("travelItinerary")
    .filter(trip => new Date(trip.date + "T00:00:00") >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!futureTrips.length) {
    output.textContent = "Add an upcoming trip to see your countdown.";
    return;
  }

  const next = futureTrips[0];
  const days = Math.ceil((new Date(next.date + "T00:00:00") - today) / 86400000);

  output.innerHTML = days === 0
    ? `🎉 Your trip to ${escapeHTML(next.destination)} is today!`
    : `✈️ ${days} day${days === 1 ? "" : "s"} until your trip to ${escapeHTML(next.destination)}!`;
}

function printItinerary() {
  window.print();
}


// ============================================
// PACKING CHECKLIST
// ============================================

const packingItems = [
  "Clothes", "Comfortable footwear", "Toothbrush and toothpaste",
  "Travel documents", "Identity card", "Mobile phone",
  "Phone charger", "Power bank", "Medicines",
  "Water bottle", "Wallet and cash", "Sunglasses",
  "Umbrella", "Personal hygiene items"
];

function displayPackingList() {
  const list = $("packingList");
  if (!list) return;

  const checked = readData("packingChecked");

  list.innerHTML = packingItems.map((item, index) => `
    <label class="packing-item">
      <input type="checkbox" ${checked.includes(index) ? "checked" : ""}
        onchange="togglePacking(${index}, this.checked)">
      <span>${item}</span>
    </label>
  `).join("");

  updatePackingProgress();
}

function togglePacking(index, isChecked) {
  let checked = readData("packingChecked");

  if (isChecked && !checked.includes(index)) checked.push(index);
  if (!isChecked) checked = checked.filter(i => i !== index);

  saveData("packingChecked", checked);
  updatePackingProgress();
  updateDashboard();
}

function updatePackingProgress() {
  const output = $("packingProgress");
  if (!output) return;

  const checked = readData("packingChecked");
  const percentage = Math.round(checked.length / packingItems.length * 100);

  output.innerHTML = `
    <h3>${checked.length} of ${packingItems.length} items packed</h3>
    <div class="progress-track">
      <div class="progress-fill" style="width:${percentage}%"></div>
    </div>
    <p>${percentage}% completed</p>
  `;
}

function resetPacking() {
  saveData("packingChecked", []);
  displayPackingList();
  updateDashboard();
}


// ============================================
// HOMEPAGE DASHBOARD
// ============================================

function updateDashboard() {
  const trips = readData("travelItinerary");
  const favorites = readData("travelFavorites");
  const expenses = readData("travelExpenses");
  const checked = readData("packingChecked");
  const budget = readData("travelBudget", {});

  if ($("dashboardTrips")) $("dashboardTrips").textContent = trips.length;
  if ($("dashboardFavorites")) $("dashboardFavorites").textContent = favorites.length;
  if ($("dashboardBudget")) $("dashboardBudget").textContent =
    `₹${(budget.total || 0).toLocaleString("en-IN")}`;
  if ($("dashboardExpenses")) $("dashboardExpenses").textContent =
    `₹${expenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString("en-IN")}`;
  if ($("dashboardPacking")) $("dashboardPacking").textContent =
    `${checked.length}/${packingItems.length}`;
  updateCountdown();
}


// ============================================
// SECURITY HELPER FOR USER-ENTERED TEXT
// ============================================

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// ============================================
// SMART TRIP READINESS ASSISTANT
// ============================================

async function runReadinessCheck() {
  const destination = $("readinessDestination")?.value.trim();
  const date = $("readinessDate")?.value;
  const result = $("readinessResult");

  if (!destination || !date) {
    alert("Please enter your destination and travel date.");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const travelDate = new Date(date + "T00:00:00");

  if (Number.isNaN(travelDate.getTime()) || travelDate < today) {
    alert("Please select today or a future travel date.");
    return;
  }

  result.innerHTML = `
    <div class="readiness-empty">
      <h2>🔍 Analysing your trip...</h2>
      <p>Checking your travel preparation.</p>
    </div>
  `;

  try {
    const place = await getCoordinates(destination);

    const trips = readData("travelItinerary");
    const budget = readData("travelBudget", {});
    const checked = readData("packingChecked");

    const matchingTrip = trips.some(trip =>
      trip.destination.toLowerCase() === place.name.toLowerCase() &&
      trip.date === date
    );

    const hasBudget = Number(budget.total) > 0;

    const packingPercentage = Math.round(
      (checked.length / packingItems.length) * 100
    );

    let score = 20;
    let weatherMessage = "Weather forecast is not available yet for this travel date.";
    let weatherAvailable = false;
    let weatherPoints = 0;

    const checks = [];

    // Destination
    checks.push({
      title: "Destination selected",
      points: 10,
      earned: 10,
      message: `${place.name}, ${place.country}`,
      status: "complete"
    });

    // Travel date
    checks.push({
      title: "Travel date selected",
      points: 10,
      earned: 10,
      message: travelDate.toLocaleDateString("en-IN"),
      status: "complete"
    });

    // Itinerary
    checks.push({
      title: "Trip itinerary",
      points: 20,
      earned: matchingTrip ? 20 : 0,
      message: matchingTrip
        ? "An itinerary activity exists for this destination and date."
        : "Add an itinerary activity for this destination and date.",
      status: matchingTrip ? "complete" : "pending"
    });

    // Budget
    checks.push({
      title: "Travel budget",
      points: 20,
      earned: hasBudget ? 20 : 0,
      message: hasBudget
        ? `Saved estimated budget: ₹${budget.total.toLocaleString("en-IN")}`
        : "Calculate and save your travel budget.",
      status: hasBudget ? "complete" : "pending"
    });

    // Packing
    const packingPoints = Math.round(packingPercentage * 0.3);

    checks.push({
      title: "Packing checklist",
      points: 30,
      earned: packingPoints,
      message: `${checked.length} of ${packingItems.length} items packed (${packingPercentage}%).`,
      status: packingPercentage === 100
        ? "complete"
        : packingPercentage > 0 ? "partial" : "pending"
    });

    // Weather: only use the forecast if the selected date is available.
    const weatherURL =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}` +
      `&longitude=${place.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=7`;

    const weatherResponse = await fetch(weatherURL);

    if (weatherResponse.ok) {
      const weatherData = await weatherResponse.json();
      const index = weatherData.daily.time.indexOf(date);

      if (index !== -1) {
        weatherAvailable = true;

        const code = weatherData.daily.weather_code[index];
        const maxTemp = weatherData.daily.temperature_2m_max[index];
        const minTemp = weatherData.daily.temperature_2m_min[index];
        const rain = weatherData.daily.precipitation_probability_max[index] ?? 0;

        const rainyCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];
        const isRainy = rainyCodes.includes(code);

        weatherPoints = rain >= 60 || isRainy ? 4 : 10;

        weatherMessage = `
          ${weatherDescriptions[code] || "Weather information available"}<br>
          Temperature: ${minTemp}°C – ${maxTemp}°C<br>
          Rain probability: ${rain}%
        `;

        checks.push({
          title: "Destination weather",
          points: 10,
          earned: weatherPoints,
          message: weatherMessage,
          status: weatherPoints === 10 ? "complete" : "partial"
        });
      }
    }

    score += checks.reduce((sum, item) => sum + item.earned, 0);

    const maximumScore = weatherAvailable ? 100 : 90;
    const finalScore = Math.round((score / maximumScore) * 100);

    const recommendations = [];

    if (!matchingTrip) {
      recommendations.push("Add your destination and travel date to your itinerary.");
    }

    if (!hasBudget) {
      recommendations.push("Create a travel budget before departure.");
    }

    if (packingPercentage < 100) {
      recommendations.push(
        `Complete your packing checklist. ${packingItems.length - checked.length} items remain.`
      );
    }

    if (weatherAvailable && weatherPoints < 10) {
      recommendations.push("Rain or unsettled weather may be expected. Review your plans and carry rain protection.");
    }

    if (!weatherAvailable) {
      recommendations.push("Check the destination weather again closer to your travel date.");
    }

    if (finalScore >= 90) {
      recommendations.push("Excellent preparation! Review your travel documents before leaving.");
    }

    if (!recommendations.length) {
      recommendations.push("Your main travel preparations are complete. Have a wonderful trip!");
    }

    let status = "Getting Started";
    if (finalScore >= 90) status = "Excellent Preparation!";
    else if (finalScore >= 70) status = "Almost Ready!";
    else if (finalScore >= 40) status = "Good Progress!";

    result.innerHTML = `
      <div class="readiness-report">

        <div class="readiness-score">
          <div class="score-circle" style="--score:${finalScore * 3.6}deg">
            <div class="score-inner">
              <strong>${finalScore}</strong>
              <span>/ 100</span>
            </div>
          </div>

          <h2>${status}</h2>
          <p>Trip Readiness Score</p>
          <h3>📍 ${escapeHTML(place.name)}, ${escapeHTML(place.country)}</h3>
          <p>Departure: ${travelDate.toLocaleDateString("en-IN")}</p>
        </div>

        <h2 class="section-title">Your Preparation Report</h2>

        <div class="readiness-checks">
          ${checks.map(item => `
            <article class="readiness-check">
              <div>
                <h3>${item.status === "complete" ? "✅" : item.status === "partial" ? "🟡" : "⏳"} ${escapeHTML(item.title)}</h3>
                <p>${item.message}</p>
              </div>
              <strong>${item.earned}/${item.points}</strong>
            </article>
          `).join("")}
        </div>

        <div class="readiness-tips">
          <h2>💡 Your Personal Travel Recommendations</h2>
          ${recommendations.map(tip => `<p>✨ ${escapeHTML(tip)}</p>`).join("")}
        </div>

        <p class="note">
          This score is a planning checklist, not a guarantee of travel safety or conditions.
          Weather is included only when the selected date is within the available forecast.
        </p>

      </div>
    `;

  } catch (error) {
    result.innerHTML = `
      <div class="readiness-empty">
        <h2>Unable to complete the check</h2>
        <p>${escapeHTML(error.message || "Please try again.")}</p>
      </div>
    `;
  }
}
