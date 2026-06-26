const filterButtons = [...document.querySelectorAll("[data-filter]")];
const plazaCards = [...document.querySelectorAll(".plaza-card")];
const activeCity = document.documentElement.dataset.city || "all";

const trackEvent = (eventName, parameters = {}) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    ...parameters,
  });

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, parameters);
  }
};

const applyDirectoryFilter = (filter) => {
  plazaCards.forEach((card) => {
    const tags = (card.dataset.tags || "").split(" ");
    const cities = (card.dataset.city || "").split(" ");
    const cityMatch = activeCity === "all" || cities.includes(activeCity);
    const categoryMatch = filter === "all" || tags.includes(filter);
    card.hidden = !(cityMatch && categoryMatch);
  });
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    applyDirectoryFilter(filter);

    trackEvent("directory_filter_click", {
      city: activeCity,
      filter,
    });
  });
});

applyDirectoryFilter("all");
