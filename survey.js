const copyButton = document.querySelector("[data-copy-survey]");
const copyStatus = document.querySelector("[data-copy-status]");
const detailToggle = document.querySelector("[data-detail-toggle]");
const detailSections = document.querySelectorAll("[data-detail-section]");
const copyResponsesButton = document.querySelector("[data-copy-responses]");
const responseCopyStatus = document.querySelector("[data-response-copy-status]");
const surveyForm = document.querySelector("[data-survey-form]");
const requiredChoiceGroups = document.querySelectorAll("[data-required-choice]");
const otherChoiceToggles = document.querySelectorAll("[data-other-toggle]");
const responseIdInput = document.querySelector("[data-response-id]");
const submitButtons = document.querySelectorAll("[data-submit-survey]");
const submitStatus = document.querySelector("[data-submit-status]");
const doNotSolicitButton = document.querySelector("[data-do-not-solicit]");
const geoFindButton = document.querySelector("[data-geo-find]");
const geoMapElement = document.querySelector("[data-geo-map]");
const geoStatus = document.querySelector("[data-geo-status]");
const geoResults = document.querySelector("[data-geo-results]");
const geoSourceLabel = document.querySelector("[data-geo-source-label]");
const geoCoordinateLabel = document.querySelector("[data-geo-coordinate-label]");
const geoRadiusLabel = document.querySelector("[data-geo-radius-label]");
const geoConfirmedCard = document.querySelector("[data-geo-confirmed-card]");
const geoConfirmedName = document.querySelector("[data-geo-confirmed-name]");
const geoConfirmedAddress = document.querySelector("[data-geo-confirmed-address]");
const businessNameInput = document.querySelector('[name="Business name"]');
const websiteInput = document.querySelector('[name="Website"]');
const geoFields = {
  placeId: document.querySelector("[data-geo-place-id]"),
  mapsUrl: document.querySelector("[data-geo-maps-url]"),
  address: document.querySelector("[data-geo-address]"),
  latitude: document.querySelector("[data-geo-latitude]"),
  longitude: document.querySelector("[data-geo-longitude]"),
  accuracy: document.querySelector("[data-geo-accuracy]"),
  distance: document.querySelector("[data-geo-distance]"),
  source: document.querySelector("[data-geo-source]"),
  label: document.querySelector("[data-geo-label]"),
  confirmed: document.querySelector("[data-geo-confirmed]"),
};
const responseStorageKey = "aiUsageSurveyResponseId";
const responseFingerprintStorageKey = "aiUsageSurveyResponseFingerprint";
const defaultGeoCenter = {
  lat: 33.6006,
  lng: -117.6803,
  label: "Mission Viejo general area",
  source: "default",
  accuracy: 9000,
};
let googleMapsLoadPromise = null;
const geoState = {
  map: null,
  placesLibrary: null,
  centerMarker: null,
  accuracyCircle: null,
  placeMarkers: [],
  latestLocation: null,
  mapsReady: false,
};

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

const setGeoStatus = (message, { isError = false } = {}) => {
  if (!geoStatus) {
    return;
  }

  geoStatus.textContent = message;
  geoStatus.classList.toggle("is-error", Boolean(isError));
};

const setGeoMeta = ({ source = "", label = "", accuracy = 0 } = {}) => {
  if (geoSourceLabel) {
    geoSourceLabel.textContent = source === "browser" ? "Precise device location" : label || "General estimate";
  }

  if (geoCoordinateLabel) {
    const hasPreciseCoordinates = source === "browser" && Number.isFinite(Number(geoState.latestLocation?.lat)) && Number.isFinite(Number(geoState.latestLocation?.lng));
    geoCoordinateLabel.hidden = !hasPreciseCoordinates;
    geoCoordinateLabel.textContent = hasPreciseCoordinates
      ? `${Number(geoState.latestLocation.lat).toFixed(5)}, ${Number(geoState.latestLocation.lng).toFixed(5)}`
      : "";
  }

  if (geoRadiusLabel) {
    geoRadiusLabel.textContent = accuracy
      ? `Search radius about ${Math.round(accuracy)}m`
      : "Search radius pending";
  }

  setInputValue(geoFields.source, source);
  setInputValue(geoFields.label, label);
  setInputValue(geoFields.accuracy, accuracy ? String(Math.round(accuracy)) : "");
};

const metersBetween = (from, to) => {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;

  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const clampSearchRadius = (accuracy) => {
  if (!accuracy) {
    return 1200;
  }

  return Math.max(125, Math.min(Math.round(accuracy * 1.6), 3500));
};

const getPlaceName = (place) => {
  if (!place?.displayName) {
    return "Unnamed business";
  }

  return typeof place.displayName === "string" ? place.displayName : place.displayName.text || "Unnamed business";
};

const getPlaceLatLng = (place) => {
  const location = place?.location;

  if (!location) {
    return null;
  }

  const lat = typeof location.lat === "function" ? location.lat() : location.lat;
  const lng = typeof location.lng === "function" ? location.lng() : location.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
};

const setInputValue = (input, value) => {
  if (!input) {
    return;
  }

  input.value = value || "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location lookup."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 15000,
    });
  });

const loadGoogleMaps = (apiKey) => {
  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsLoadPromise) {
    return googleMapsLoadPromise;
  }

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const callbackName = `initAiUsageMaps${Date.now()}`;
    const script = document.createElement("script");

    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };

    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      delete window[callbackName];
      googleMapsLoadPromise = null;
      reject(new Error("Google Maps could not be loaded."));
    };
    document.head.append(script);
  });

  return googleMapsLoadPromise;
};

const readMapsConfig = async () => {
  const response = await fetch("/api/maps/config", {
    headers: {
      Accept: "application/json",
    },
  });
  const config = await response.json().catch(() => ({}));

  if (!response.ok || !config.ok) {
    throw new Error(config.error || "Maps config could not be loaded.");
  }

  return config;
};

const getApproximateIpLocation = async () => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch("https://ipapi.co/json/", {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    const payload = await response.json().catch(() => ({}));
    const lat = Number(payload.latitude);
    const lng = Number(payload.longitude);

    if (!response.ok || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("Approximate location unavailable.");
    }

    return {
      lat,
      lng,
      label: [payload.city, payload.region].filter(Boolean).join(", ") || "General IP area",
      source: "ip",
      accuracy: 2500,
    };
  } finally {
    window.clearTimeout(timeout);
  }
};

const getInitialGeoLocation = async () => {
  try {
    setGeoStatus("Loading a general area map from network location.");
    return await getApproximateIpLocation();
  } catch {
    return defaultGeoCenter;
  }
};

const getMapStyles = () => [
  {
    featureType: "poi.business",
    elementType: "labels",
    stylers: [{ visibility: "on" }],
  },
  {
    featureType: "transit",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

const clearPlaceMarkers = () => {
  geoState.placeMarkers.forEach((marker) => marker.setMap(null));
  geoState.placeMarkers = [];
};

const makeMarkerLabel = (text) => {
  const label = document.createElement("div");
  label.className = "geo-marker-label";
  label.textContent = text;
  return label;
};

const updateMapLocation = (location) => {
  if (!geoState.map || !window.google?.maps) {
    return;
  }

  const center = { lat: location.lat, lng: location.lng };
  const radius = clampSearchRadius(location.accuracy);
  geoState.latestLocation = location;
  setGeoMeta({ ...location, accuracy: radius });

  geoState.map.setCenter(center);
  geoState.map.setZoom(location.source === "browser" ? 18 : location.source === "ip" ? 14 : 12);

  if (!geoState.centerMarker) {
    geoState.centerMarker = new google.maps.Marker({
      map: geoState.map,
      position: center,
      title: "Estimated current area",
      label: "You",
      zIndex: 100,
    });
  } else {
    geoState.centerMarker.setPosition(center);
  }

  if (!geoState.accuracyCircle) {
    geoState.accuracyCircle = new google.maps.Circle({
      map: geoState.map,
      center,
      radius,
      strokeColor: "#236a4b",
      strokeOpacity: 0.55,
      strokeWeight: 2,
      fillColor: "#236a4b",
      fillOpacity: 0.1,
      zIndex: 20,
    });
  } else {
    geoState.accuracyCircle.setCenter(center);
    geoState.accuracyCircle.setRadius(radius);
  }

  if (location.source !== "browser") {
    const bounds = geoState.accuracyCircle.getBounds();
    if (bounds) {
      geoState.map.fitBounds(bounds, 40);
    }
  }
};

const initGeoMap = async (apiKey) => {
  if (!geoMapElement) {
    return;
  }

  await loadGoogleMaps(apiKey);
  geoState.placesLibrary = await google.maps.importLibrary("places");
  geoState.map = new google.maps.Map(geoMapElement, {
    center: defaultGeoCenter,
    zoom: 12,
    disableDefaultUI: true,
    gestureHandling: "cooperative",
    zoomControl: true,
    styles: getMapStyles(),
  });
  geoState.mapsReady = true;
};

const searchNearbyBusinesses = async (location) => {
  if (!geoState.placesLibrary?.Place) {
    return [];
  }

  const radius = clampSearchRadius(location.accuracy);
  const searchRequest = {
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "googleMapsURI",
      "location",
      "businessStatus",
      "types",
      "websiteURI",
    ],
    locationRestriction: {
      center: { lat: location.lat, lng: location.lng },
      radius,
    },
    maxResultCount: 8,
    rankPreference: geoState.placesLibrary.SearchNearbyRankPreference.DISTANCE,
  };

  const { places } = await geoState.placesLibrary.Place.searchNearby(searchRequest);

  return (places || [])
    .filter((place) => getPlaceName(place) && getPlaceLatLng(place))
    .sort((left, right) => {
      const leftDistance = metersBetween(location, getPlaceLatLng(left));
      const rightDistance = metersBetween(location, getPlaceLatLng(right));
      return leftDistance - rightDistance;
    });
};

const searchShoppingCenters = async (location) => {
  if (!geoState.placesLibrary?.Place?.searchByText) {
    return [];
  }

  const { places } = await geoState.placesLibrary.Place.searchByText({
    textQuery: "shopping center near me",
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "googleMapsURI",
      "location",
      "businessStatus",
      "types",
      "websiteURI",
    ],
    includedType: "shopping_mall",
    locationBias: {
      center: { lat: location.lat, lng: location.lng },
      radius: clampSearchRadius(location.accuracy),
    },
    maxResultCount: 4,
  });

  return (places || []).filter((place) => getPlaceName(place) && getPlaceLatLng(place));
};

const drawPlaceMarkers = (places, location) => {
  if (!geoState.map || !window.google?.maps) {
    return;
  }

  clearPlaceMarkers();

  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: location.lat, lng: location.lng });

  places.slice(0, 6).forEach((place, index) => {
    const position = getPlaceLatLng(place);
    bounds.extend(position);
    geoState.placeMarkers.push(new google.maps.Marker({
      map: geoState.map,
      position,
      title: getPlaceName(place),
      label: String(index + 1),
      zIndex: 80 - index,
    }));
  });

  if (places.length) {
    geoState.map.fitBounds(bounds, 48);
  }
};

const confirmGeoPlace = (place) => {
  const placeLatLng = getPlaceLatLng(place);
  const userLatLng = geoState.latestLocation;
  const distanceMeters = placeLatLng && userLatLng ? metersBetween(userLatLng, placeLatLng) : "";
  const name = getPlaceName(place);
  const address = place.formattedAddress || "";

  if (userLatLng) {
    setInputValue(geoFields.source, userLatLng.source || "");
    setInputValue(geoFields.label, userLatLng.label || "");
    setInputValue(geoFields.accuracy, userLatLng.accuracy ? String(Math.round(userLatLng.accuracy)) : "");
  }

  setInputValue(businessNameInput, name);
  setInputValue(websiteInput, place.websiteURI || websiteInput?.value || "");
  setInputValue(geoFields.placeId, place.id || "");
  setInputValue(geoFields.mapsUrl, place.googleMapsURI || "");
  setInputValue(geoFields.address, address);
  setInputValue(geoFields.latitude, placeLatLng ? String(placeLatLng.lat) : "");
  setInputValue(geoFields.longitude, placeLatLng ? String(placeLatLng.lng) : "");
  setInputValue(geoFields.distance, distanceMeters ? String(distanceMeters) : "");
  setInputValue(geoFields.confirmed, "Yes");

  if (geoConfirmedCard) {
    geoConfirmedCard.hidden = false;
  }

  if (geoConfirmedName) {
    geoConfirmedName.textContent = name;
  }

  if (geoConfirmedAddress) {
    geoConfirmedAddress.textContent = address || "Address not returned by Google Maps.";
  }

  setGeoStatus(distanceMeters ? `Confirmed ${name}, about ${distanceMeters}m from this device.` : `Confirmed ${name}.`);
  trackEvent("survey_geo_business_confirm", {
    place_id: place.id || "",
    distance_meters: distanceMeters || "",
  });
};

const renderGeoResults = (places) => {
  if (!geoResults) {
    return;
  }

  geoResults.innerHTML = "";

  const renderPlaceResult = (place, index) => {
    const result = document.createElement("div");
    const content = document.createElement("div");
    const name = document.createElement("span");
    const meta = document.createElement("span");
    const button = document.createElement("button");
    const placeLatLng = getPlaceLatLng(place);
    const userLatLng = geoState.latestLocation;
    const distanceMeters = placeLatLng && userLatLng ? metersBetween(userLatLng, placeLatLng) : null;

    result.className = index === 0 ? "geo-result is-suggested" : "geo-result";
    name.className = "geo-result-name";
    name.textContent = `${index === 0 ? "Best guess: " : ""}${getPlaceName(place)}`;
    meta.className = "geo-result-meta";
    meta.textContent = [
      place.formattedAddress || "Address unavailable",
      distanceMeters === null ? "" : `${distanceMeters}m away`,
    ].filter(Boolean).join(" | ");
    button.className = "button secondary";
    button.type = "button";
    button.textContent = index === 0 ? "Confirm closest" : "Confirm";
    button.addEventListener("click", () => confirmGeoPlace(place));

    content.append(name, meta);
    result.append(content, button);
    return result;
  };

  const [bestGuess, ...otherPlaces] = places;

  if (!bestGuess) {
    return;
  }

  geoResults.append(renderPlaceResult(bestGuess, 0));

  if (!otherPlaces.length) {
    return;
  }

  const drawer = document.createElement("div");
  const collapseToggle = document.createElement("button");
  const moreToggle = document.createElement("button");
  const drawerContent = document.createElement("div");
  let visibleCount = 1;

  drawer.className = "geo-more";
  collapseToggle.className = "geo-more-toggle";
  collapseToggle.type = "button";
  collapseToggle.hidden = true;
  collapseToggle.innerHTML = '<span>Show fewer results</span><span class="geo-more-chevron is-up" aria-hidden="true"></span>';
  moreToggle.className = "geo-more-toggle";
  moreToggle.type = "button";
  moreToggle.innerHTML = `<span>Show more (${places.length - visibleCount})</span><span class="geo-more-chevron" aria-hidden="true"></span>`;
  drawerContent.className = "geo-more-content";

  const renderVisiblePlaces = () => {
    drawerContent.innerHTML = "";

    places.slice(1, visibleCount).forEach((place, index) => {
      drawerContent.append(renderPlaceResult(place, index + 1));
    });

    const remainingCount = places.length - visibleCount;
    collapseToggle.hidden = visibleCount === 1;
    drawerContent.hidden = visibleCount === 1;
    moreToggle.hidden = remainingCount <= 0;
    moreToggle.querySelector("span")?.replaceChildren(document.createTextNode(`Show more (${remainingCount})`));
  };

  collapseToggle.addEventListener("click", () => {
    visibleCount = 1;
    renderVisiblePlaces();
  });

  moreToggle.addEventListener("click", () => {
    visibleCount = visibleCount === 1
      ? Math.min(5, places.length)
      : Math.min(visibleCount + 5, places.length);
    renderVisiblePlaces();
  });

  renderVisiblePlaces();
  drawer.append(collapseToggle, drawerContent, moreToggle);
  geoResults.append(drawer);
};

const updateGeoCandidates = async (location, { includeShoppingCenters = false } = {}) => {
  updateMapLocation(location);
  setGeoStatus(location.source === "browser"
    ? "Precise location found. Searching businesses around this device."
    : "Showing best guesses from a general area. Use precise location when you are at the storefront.");

  try {
    const places = await searchNearbyBusinesses(location);
    const shoppingCenters = includeShoppingCenters ? await searchShoppingCenters(location).catch(() => []) : [];
    const combinedPlaces = [...places, ...shoppingCenters]
      .filter((place, index, list) => list.findIndex((candidate) => candidate.id === place.id) === index);

    if (!combinedPlaces.length) {
      clearPlaceMarkers();
      renderGeoResults([]);
      setGeoStatus("No nearby businesses were returned yet. Try precise location or enter the business manually.", { isError: true });
      return;
    }

    drawPlaceMarkers(combinedPlaces, location);
    renderGeoResults(combinedPlaces);
    setGeoStatus(location.source === "browser"
      ? "Pick the business you are standing in front of before starting the survey."
      : "These are general-area guesses. Confirm only if this is the right business, or refine with precise location.");
    trackEvent("survey_geo_business_search", {
      result_count: combinedPlaces.length,
      source: location.source,
      accuracy_meters: Math.round(location.accuracy || 0),
    });
  } catch (error) {
    setGeoStatus(error.message || "Business lookup failed. Enter the business name manually.", { isError: true });
    trackEvent("survey_geo_business_error", {
      message: error.message || "unknown",
      source: location.source,
    });
  }
};

const bootGeoIdentifier = async () => {
  if (!geoMapElement) {
    return;
  }

  if (geoFindButton) {
    geoFindButton.disabled = true;
    geoFindButton.textContent = "Loading map...";
  }

  try {
    const config = await readMapsConfig();

    if (!config.googleMapsEnabled || !config.googleMapsBrowserKey) {
      setGeoStatus("Google Maps is not configured yet. Enter the business name manually for now.", { isError: true });
      return;
    }

    await initGeoMap(config.googleMapsBrowserKey);
    const initialLocation = await getInitialGeoLocation();
    await updateGeoCandidates(initialLocation, { includeShoppingCenters: initialLocation.source !== "browser" });
  } catch (error) {
    setGeoStatus(error.message || "Map could not be loaded. Enter the business name manually.", { isError: true });
    trackEvent("survey_geo_business_error", {
      message: error.message || "unknown",
    });
  } finally {
    if (geoFindButton) {
      geoFindButton.disabled = false;
      geoFindButton.textContent = "Use precise location";
    }
  }
};

const findNearbyBusinesses = async () => {
  if (!geoFindButton) {
    return;
  }

  geoFindButton.disabled = true;
  geoFindButton.textContent = "Refining...";
  setGeoStatus("Requesting precise browser location.");

  try {
    const position = await getCurrentPosition();
    const preciseLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      label: "Precise device location",
      source: "browser",
      accuracy: position.coords.accuracy || 80,
    };
    await updateGeoCandidates(preciseLocation);
  } catch (error) {
    const permissionDenied = error.code === 1;
    const timedOut = error.code === 3;
    setGeoStatus(
      permissionDenied
        ? "Precise location is blocked. On iPhone, check Settings > Privacy & Security > Location Services > Safari Websites, then set location to While Using and enable Precise Location. The general-area map is still usable."
        : timedOut
          ? "Precise location timed out. Try again outside an in-app browser, or keep using the general-area map."
          : error.message || "Precise location failed. The general-area map is still usable.",
      { isError: true }
    );
    trackEvent("survey_geo_precise_location_error", {
      message: error.message || "unknown",
    });
  } finally {
    geoFindButton.disabled = false;
    geoFindButton.textContent = "Use precise location";
  }
};

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

  submitButtons.forEach((button) => {
    button.disabled = Boolean(isSaving);
    button.textContent = isSaving ? "Saving..." : button.dataset.defaultLabel || "Submit";
  });

  if (doNotSolicitButton) {
    doNotSolicitButton.disabled = Boolean(isSaving);
  }
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
  const otherToggle = group.querySelector("[data-other-toggle]");

  if (otherToggle?.checked && !customAnswer?.value.trim()) {
    return false;
  }

  return hasCheckedOption;
};

const validateRequiredChoiceGroup = (group) => {
  const isComplete = isChoiceGroupComplete(group);
  const error = group.querySelector("[data-choice-error]");
  const questionTitle = group.dataset.questionTitle || "This question";
  const otherNeedsAnswer = Boolean(
    group.querySelector("[data-other-toggle]:checked")
      && !group.querySelector("[data-custom-choice]")?.value.trim()
  );

  group.classList.toggle("is-invalid", !isComplete);

  if (error) {
    error.textContent = isComplete
      ? ""
      : otherNeedsAnswer
        ? `${questionTitle} needs an answer for Other.`
        : `${questionTitle} needs at least one selected option.`;
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

const hasBusinessIdentity = (answers) => Boolean(
  String(answers["Business name"] || "").trim()
    || String(answers.Website || "").trim()
    || String(answers.Email || "").trim()
    || String(answers["Google Place ID"] || "").trim()
);

const clearRequiredChoiceValidation = () => {
  requiredChoiceGroups.forEach((group) => {
    group.classList.remove("is-invalid");
    const error = group.querySelector("[data-choice-error]");

    if (error) {
      error.textContent = "";
    }
  });
};

const setOtherChoiceDrawer = (toggle, { focus = false, clear = false } = {}) => {
  const drawerId = toggle.getAttribute("aria-controls");
  const drawer = drawerId ? document.getElementById(drawerId) : null;
  const textarea = drawer?.querySelector("[data-custom-choice]");
  const isOpen = Boolean(toggle.checked);

  toggle.setAttribute("aria-expanded", String(isOpen));
  drawer?.setAttribute("aria-hidden", String(!isOpen));
  drawer?.classList.toggle("is-open", isOpen);

  if (textarea) {
    textarea.disabled = !isOpen;

    if (!isOpen && clear) {
      textarea.value = "";
    }

    if (isOpen && focus) {
      textarea.focus();
    }
  }
};

const clearSubmittedSurvey = () => {
  if (!surveyForm) {
    return;
  }

  surveyForm.reset();
  window.localStorage.removeItem(responseStorageKey);
  window.localStorage.removeItem(responseFingerprintStorageKey);

  if (responseIdInput) {
    responseIdInput.value = "";
  }

  document.querySelectorAll(".segmented-toggle").forEach((toggle) => {
    updateSegmentedToggleOutput(toggle);
  });

  otherChoiceToggles.forEach((toggle) => setOtherChoiceDrawer(toggle));

  setDetailMode();
  clearRequiredChoiceValidation();

  if (geoConfirmedCard) {
    geoConfirmedCard.hidden = true;
  }

  if (geoConfirmedName) {
    geoConfirmedName.textContent = "";
  }

  if (geoConfirmedAddress) {
    geoConfirmedAddress.textContent = "";
  }

  if (responseCopyStatus) {
    responseCopyStatus.textContent = "";
  }
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

if (geoFindButton) {
  geoFindButton.addEventListener("click", findNearbyBusinesses);
}

bootGeoIdentifier();

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

if (doNotSolicitButton) {
  doNotSolicitButton.addEventListener("click", async () => {
    const answers = {
      ...getFormAnswers(),
      "Follow-up permission": "Do not solicit",
    };

    if (!hasBusinessIdentity(answers)) {
      setSubmitState({
        status: "Confirm or enter the business before marking do not solicit.",
        isError: true,
      });
      businessNameInput?.focus();
      return;
    }

    setSubmitState({ status: "Marking business do not solicit...", isSaving: true });

    try {
      const response = await fetch("/api/businesses/do-not-solicit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "do-not-solicit",
          reason: "Declined survey",
          answers,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status !== 200 || !result.ok) {
        throw new Error(result.error || "Business could not be marked do not solicit.");
      }

      clearSubmittedSurvey();
      setSubmitState({
        status: "Marked do not solicit. Skip this business on future visits.",
      });
      trackEvent("survey_do_not_solicit", {
        business_id: result.businessId || "",
        sheet_sync_status: result.sheetSyncStatus || "unknown",
      });
    } catch (error) {
      setSubmitState({
        status: `Do not solicit save failed: ${error.message || "Unknown error"}.`,
        isError: true,
      });
      trackEvent("survey_do_not_solicit_error", {
        message: error.message,
      });
    }
  });
}

requiredChoiceGroups.forEach((group) => {
  group.addEventListener("change", () => validateRequiredChoiceGroup(group));
  group.addEventListener("input", () => validateRequiredChoiceGroup(group));
});

otherChoiceToggles.forEach((toggle) => {
  setOtherChoiceDrawer(toggle);
  toggle.addEventListener("change", () => {
    setOtherChoiceDrawer(toggle, {
      focus: toggle.checked,
      clear: !toggle.checked,
    });
  });
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

      if (response.status !== 200 || !result.ok) {
        throw new Error(result.error || "Survey could not be saved.");
      }

      if (result.responseId) {
        clearSubmittedSurvey();
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
        status: `API save failed: ${error.message || "Unknown error"}. Your answers are still filled in; use Copy as a fallback.`,
        isError: true,
      });
      trackEvent("survey_api_submit_error", {
        message: error.message,
      });
    } finally {
      submitButtons.forEach((button) => {
        button.disabled = false;
        button.textContent = button.dataset.defaultLabel || "Submit";
      });
    }
  });
}
