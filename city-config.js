const cityByHost = {
  "ai-usage.biz": {
    label: "Business",
    slug: "all",
  },
  "www.ai-usage.biz": {
    label: "Business",
    slug: "all",
  },
  "rsm.ai-usage.biz": {
    label: "RSM",
    slug: "rsm",
  },
  "mission-viejo.ai-usage.biz": {
    label: "MV",
    slug: "mission-viejo",
  },
  "lake-forest.ai-usage.biz": {
    label: "LF",
    slug: "lake-forest",
  },
  "san-clemente.ai-usage.biz": {
    label: "SC",
    slug: "san-clemente",
  },
  "laguna-hills.ai-usage.biz": {
    label: "LH",
    slug: "laguna-hills",
  },
  "dana-point.ai-usage.biz": {
    label: "DP",
    slug: "dana-point",
  },
  "laguna-woods.ai-usage.biz": {
    label: "LW",
    slug: "laguna-woods",
  },
  "sjc.ai-usage.biz": {
    label: "SJC",
    slug: "san-juan-capistrano",
  },
  "laguna-beach.ai-usage.biz": {
    label: "LB",
    slug: "laguna-beach",
  },
  "ladera.ai-usage.biz": {
    label: "LR",
    slug: "ladera-ranch",
  },
  "foothill.ai-usage.biz": {
    label: "FR",
    slug: "foothill-ranch",
  },
  "rmv.ai-usage.biz": {
    label: "RMV",
    slug: "rancho-mission-viejo",
  },
  "rancho-cucamonga.ai-usage.biz": {
    label: "RC",
    slug: "rancho-cucamonga",
  },
};

const cityConfig = cityByHost[window.location.hostname.toLowerCase()];
const currentPath = window.location.pathname.replace(/\/$/, "");
const isBusinessPath = currentPath === "/business" || currentPath === "/business.html";
const isHomePath = currentPath === "" || currentPath === "/index.html";

if (cityConfig) {
  document.documentElement.dataset.city = cityConfig.slug;
}

document.querySelectorAll("[data-city-nav]").forEach((slot) => {
  if (!cityConfig) {
    const fallbackLink = document.createElement("a");
    fallbackLink.href = "/business";
    fallbackLink.textContent = "Business";
    fallbackLink.setAttribute("data-city", "all");
    if (isBusinessPath) {
      fallbackLink.setAttribute("aria-current", "page");
    }
    slot.replaceWith(fallbackLink);
    return;
  }

  const link = document.createElement("a");
  link.href = "/business";
  link.textContent = cityConfig.label;
  link.setAttribute("data-city", cityConfig.slug);
  if (isBusinessPath) {
    link.setAttribute("aria-current", "page");
  }
  slot.replaceWith(link);
});

const navLinks = Array.from(document.querySelectorAll('nav a[href]'));

function setActiveNavLink() {
  navLinks.forEach((link) => link.removeAttribute("aria-current"));

  const hash = window.location.hash;
  const hashLink = hash && isHomePath
    ? navLinks.find((link) => link.getAttribute("href") === `/${hash}`)
    : null;

  if (hashLink) {
    hashLink.setAttribute("aria-current", "location");
    return;
  }

  const activeLink = navLinks.find((link) => {
    const href = link.getAttribute("href");
    return (
      (isHomePath && href === "/") ||
      (isBusinessPath && href === "/business") ||
      (currentPath === "/survey" && href === "/survey") ||
      (currentPath === "/survey.html" && href === "/survey") ||
      (currentPath === "/autonomous-business-bot" && href === "/autonomous-business-bot") ||
      (currentPath === "/autonomous-business-bot.html" && href === "/autonomous-business-bot")
    );
  });

  if (activeLink) {
    activeLink.setAttribute("aria-current", "page");
  }
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    window.requestAnimationFrame(setActiveNavLink);
  });
});

window.addEventListener("hashchange", setActiveNavLink);
setActiveNavLink();
