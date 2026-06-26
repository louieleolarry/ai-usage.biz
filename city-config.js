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

if (cityConfig) {
  document.documentElement.dataset.city = cityConfig.slug;
}

document.querySelectorAll("[data-city-nav]").forEach((slot) => {
  if (!cityConfig) {
    const fallbackLink = document.createElement("a");
    fallbackLink.href = "/business";
    fallbackLink.textContent = "Business";
    fallbackLink.setAttribute("data-city", "all");
    slot.replaceWith(fallbackLink);
    return;
  }

  const link = document.createElement("a");
  link.href = "/business";
  link.textContent = cityConfig.label;
  link.setAttribute("data-city", cityConfig.slug);
  slot.replaceWith(link);
});
