const copyButton = document.querySelector("[data-copy-survey]");
const copyStatus = document.querySelector("[data-copy-status]");
const detailToggle = document.querySelector("[data-detail-toggle]");
const detailSections = document.querySelectorAll("[data-detail-section]");
const copyResponsesButton = document.querySelector("[data-copy-responses]");
const responseCopyStatus = document.querySelector("[data-response-copy-status]");
const surveyForm = document.querySelector("[data-survey-form]");
const requiredChoiceGroups = document.querySelectorAll("[data-required-choice]");
const responseIdInput = document.querySelector("[data-response-id]");
const submitButton = document.querySelector("[data-submit-survey]");
const submitStatus = document.querySelector("[data-submit-status]");
const responseStorageKey = "aiUsageSurveyResponseId";
const responseFingerprintStorageKey = "aiUsageSurveyResponseFingerprint";

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

const setSegmentedToggleChecked = (toggle, checked) => {
  const input = toggle.querySelector(".segmented-toggle-input");

  if (!input) {
    return;
  }

  input.checked = checked;
  updateSegmentedToggleOutput(toggle);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const updateSegmentedToggleOutput = (toggle) => {
  const input = toggle.querySelector(".segmented-toggle-input");
  const output = toggle.querySelector("[data-segmented-output]");

  if (input && output) {
    output.value = input.checked
      ? input.dataset.rightValue || input.value || "Yes"
      : input.dataset.leftValue || "";
  }
};

document.querySelectorAll(".segmented-toggle-track").forEach((track) => {
  track.addEventListener("click", (event) => {
    const toggle = track.closest(".segmented-toggle");

    if (!toggle) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const input = toggle.querySelector(".segmented-toggle-input");
    setSegmentedToggleChecked(toggle, !input?.checked);
  });
});

document.querySelectorAll(".segmented-toggle").forEach((toggle) => {
  const input = toggle.querySelector(".segmented-toggle-input");

  updateSegmentedToggleOutput(toggle);
  input?.addEventListener("change", () => updateSegmentedToggleOutput(toggle));
});

const getFormSummary = () => {
  const form = document.querySelector("[data-survey-form]");

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

const getFormAnswers = () => {
  if (!surveyForm) {
    return {};
  }

  const formData = new FormData(surveyForm);
  const answers = {};

  for (const [key, value] of formData.entries()) {
    const cleanKey = String(key).trim();
    const cleanValue = String(value).trim();

    if (!cleanKey || cleanKey === "Response ID") {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(answers, cleanKey)) {
      if (!Array.isArray(answers[cleanKey])) {
        answers[cleanKey] = [answers[cleanKey]];
      }

      if (cleanValue) {
        answers[cleanKey].push(cleanValue);
      }

      continue;
    }

    answers[cleanKey] = cleanValue;
  }

  return answers;
};

const setSubmitState = ({ status = "", isError = false, isSaving = false } = {}) => {
  if (submitStatus) {
    submitStatus.textContent = status;
    submitStatus.classList.toggle("is-error", Boolean(isError));
  }

  if (submitButton) {
    submitButton.disabled = Boolean(isSaving);
    submitButton.textContent = isSaving ? "Saving..." : "Save survey";
  }
};

const buildMailtoFallback = () => {
  const subject = encodeURIComponent("AI Usage survey response");
  const body = encodeURIComponent(getFormSummary());
  return `mailto:hello@ai-usage.biz?subject=${subject}&body=${body}`;
};

const getResponseFingerprint = (answers) => [
  answers["Business name"] || "",
  answers.Website || "",
  answers.Email || "",
]
  .map((value) => String(value).trim().toLowerCase())
  .join("|");

const isChoiceGroupComplete = (group) => {
  const hasCheckedOption = Boolean(group.querySelector('input[type="checkbox"]:checked'));
  const customAnswer = group.querySelector("[data-custom-choice]");

  return hasCheckedOption || Boolean(customAnswer?.value.trim());
};

const validateRequiredChoiceGroup = (group) => {
  const isComplete = isChoiceGroupComplete(group);
  const error = group.querySelector("[data-choice-error]");
  const questionTitle = group.dataset.questionTitle || "This question";

  group.classList.toggle("is-invalid", !isComplete);

  if (error) {
    error.textContent = isComplete ? "" : `${questionTitle} needs at least one selected option or a custom answer.`;
  }

  return isComplete;
};

const validateRequiredChoices = ({ focusFirstInvalid = false } = {}) => {
  let firstInvalidGroup = null;

  requiredChoiceGroups.forEach((group) => {
    const isComplete = validateRequiredChoiceGroup(group);

    if (!isComplete && !firstInvalidGroup) {
      firstInvalidGroup = group;
    }
  });

  if (firstInvalidGroup && focusFirstInvalid) {
    firstInvalidGroup.scrollIntoView({ block: "center", behavior: "smooth" });
    firstInvalidGroup.querySelector("input, textarea")?.focus({ preventScroll: true });
  }

  return !firstInvalidGroup;
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

requiredChoiceGroups.forEach((group) => {
  group.addEventListener("change", () => validateRequiredChoiceGroup(group));
  group.addEventListener("input", () => validateRequiredChoiceGroup(group));
});

if (surveyForm) {
  surveyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateRequiredChoices({ focusFirstInvalid: true })) {
      trackEvent("survey_required_choice_error");
      return;
    }

    const answers = getFormAnswers();
    const responseFingerprint = getResponseFingerprint(answers);
    const storedFingerprint = window.localStorage.getItem(responseFingerprintStorageKey) || "";
    const storedResponseId = window.localStorage.getItem(responseStorageKey) || "";
    const responseId = responseFingerprint && responseFingerprint === storedFingerprint
      ? responseIdInput?.value || storedResponseId
      : "";
    const payload = {
      responseId,
      source: "survey",
      answers,
    };

    setSubmitState({ status: "Saving survey...", isSaving: true });

    try {
      const response = await fetch("/api/survey-responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Survey could not be saved.");
      }

      if (result.responseId) {
        window.localStorage.setItem(responseStorageKey, result.responseId);
        window.localStorage.setItem(responseFingerprintStorageKey, responseFingerprint);

        if (responseIdInput) {
          responseIdInput.value = result.responseId;
        }
      }

      setSubmitState({
        status: result.notificationStatus === "sent"
          ? "Saved. Admin notification email sent."
          : "Saved. Admin notification queued for delivery.",
      });
      trackEvent("survey_api_submit", {
        notification_status: result.notificationStatus || "unknown",
      });
    } catch (error) {
      setSubmitState({
        status: "API save failed. Your answers are still filled in; use Copy or Email us directly as a fallback.",
        isError: true,
      });
      trackEvent("survey_api_submit_error", {
        message: error.message,
      });

      const fallbackLink = document.querySelector('a[href^="mailto:hello@ai-usage.biz"]');
      fallbackLink?.setAttribute("href", buildMailtoFallback());
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Save survey";
      }
    }
  });
}
