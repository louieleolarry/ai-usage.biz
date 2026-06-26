const copyButton = document.querySelector("[data-copy-survey]");
const copyStatus = document.querySelector("[data-copy-status]");
const detailToggle = document.querySelector("[data-detail-toggle]");
const detailSections = document.querySelectorAll("[data-detail-section]");
const copyResponsesButton = document.querySelector("[data-copy-responses]");
const responseCopyStatus = document.querySelector("[data-response-copy-status]");
const surveyForm = document.querySelector(".survey-form");

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

const streetScript = `AI Usage / Rancho Web Designs street script

Opening:
Hi, I am Brad with Rancho Web Designs. I am asking local business owners three quick questions about the work that eats up their time: marketing, research, scheduling, buying, follow-up, websites, or anything else that slows the business down.

Short version:
Can I have a minute of your time to ask three quick questions that could save you hours and hours?

The three questions:
1. How do you currently use AI for your business, if at all?
2. What is the biggest pain point in your business right now?
3. What should be possible with AI for your business right now that is not in place?

Follow-up ask:
Would it be useful if I sent you a short one-page snapshot with one practical fix and what it would cost to implement?
`;

const setDetailMode = () => {
  const showDetail = Boolean(detailToggle?.checked);

  detailToggle?.setAttribute("aria-checked", String(showDetail));

  detailSections.forEach((section) => {
    section.hidden = !showDetail;
  });
};

const getFormSummary = () => {
  const form = document.querySelector(".survey-form");

  if (!form) {
    return "";
  }

  const formData = new FormData(form);
  const groupedValues = {};

  for (const [key, value] of formData.entries()) {
    const cleanValue = String(value).trim();

    if (!cleanValue) {
      continue;
    }

    if (!groupedValues[key]) {
      groupedValues[key] = [];
    }

    groupedValues[key].push(cleanValue);
  }

  const lines = ["AI Usage / Rancho Web Designs owner survey", ""];

  Object.entries(groupedValues).forEach(([key, values]) => {
    lines.push(`${key}: ${values.join(", ")}`);
  });

  return `${lines.join("\n")}\n`;
};

if (copyButton && copyStatus) {
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(streetScript);
      copyStatus.textContent = "Street script copied.";
      trackEvent("survey_street_script_copy");
    } catch {
      copyStatus.textContent = "Copy failed. Select the questions below and copy manually.";
    }
  });
}

if (detailToggle) {
  detailToggle.addEventListener("change", () => {
    setDetailMode();
    trackEvent("survey_detail_mode_toggle", {
      enabled: Boolean(detailToggle.checked),
    });
  });
  setDetailMode();
}

if (copyResponsesButton && responseCopyStatus) {
  copyResponsesButton.addEventListener("click", async () => {
    const summary = getFormSummary();

    if (!summary.trim()) {
      responseCopyStatus.textContent = "No filled answers to copy yet.";
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      responseCopyStatus.textContent = "Filled answers copied.";
      trackEvent("survey_responses_copy");
    } catch {
      responseCopyStatus.textContent = "Copy failed. Select the answers and copy manually.";
    }
  });
}

if (surveyForm) {
  surveyForm.addEventListener("submit", () => {
    trackEvent("survey_mailto_submit");
  });
}
