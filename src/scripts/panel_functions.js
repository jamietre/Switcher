// --- Switcher storage / browser-state helpers ---------------------------
//
// Firefox's own proxy configuration (Settings > Network Settings, i.e. the
// network.proxy.* prefs) is the source of truth. Switcher used to treat its
// localStorage copy as authoritative, which meant a proxy configured in
// Firefox itself was invisible to the panel and got overwritten with blanks
// the first time the user switched modes.

const SWITCHER_STORAGE_KEY = "SwitcherManualProxyConfig";

function readStoredConfig() {
  let raw = localStorage.getItem(SWITCHER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Switcher: stored config is not valid JSON, ignoring", error);
    return null;
  }
}

function writeStoredConfig(config) {
  localStorage.setItem(SWITCHER_STORAGE_KEY, JSON.stringify(config));
}

// True when a config actually names a proxy server for any protocol.
function hasProxyHost(config) {
  return Boolean(config && (config.http || config.ssl || config.socks));
}

// Build a manual-mode config to hand to Firefox. Prefers Switcher's stored
// config, but falls back to whatever Firefox already has so that switching
// back on restores an externally configured proxy instead of erasing it.
function resolveManualConfig(browserValue) {
  let stored = readStoredConfig();
  if (hasProxyHost(stored)) {
    stored.proxyType = "manual";
    return stored;
  }

  let adopted = {
    proxyType: "manual",
    http: (browserValue && browserValue.http) || "",
    ssl: (browserValue && browserValue.ssl) || "",
    socks: (browserValue && browserValue.socks) || "",
    socksVersion: (browserValue && browserValue.socksVersion) || 4,
    passthrough: (browserValue && browserValue.passthrough) || "",
  };
  writeStoredConfig(adopted);
  return adopted;
}

// proxy.settings.set() rejects unless the add-on is allowed to run in private
// windows (Firefox throws "proxy.settings requires private browsing
// permission."). Every call used to ignore that rejection, so a failed switch
// left the badge showing a mode the browser had never entered.
function applyProxySetting(value) {
  return browser.proxy.settings.set({ value: value }).then(
    function () {
      clearSwitcherError();
      return true;
    },
    function (error) {
      let message = String((error && error.message) || error);
      console.error("Switcher: could not apply proxy settings:", message);

      if (/private browsing/i.test(message)) {
        showSwitcherError(
          "Switcher needs \u201cRun in Private Windows\u201d enabled in " +
            "about:addons before it can change the proxy.",
        );
      } else if (/Policies manager/i.test(message)) {
        showSwitcherError("Proxy settings are locked by an enterprise policy.");
      } else {
        showSwitcherError("Could not change the proxy: " + message);
      }

      // Re-sync the UI with what the browser really has.
      refreshFromBrowser();
      return false;
    },
  );
}

// Panel-only; the background page has no such element, hence the null guard.
function showSwitcherError(message) {
  let target = document.getElementById("switcher-error");
  if (!target) {
    return;
  }
  target.textContent = message;
  target.classList.remove("hide-element");
}

function clearSwitcherError() {
  let target = document.getElementById("switcher-error");
  if (!target) {
    return;
  }
  target.textContent = "";
  target.classList.add("hide-element");
}

// Re-read Firefox's live settings and repaint whatever UI is present.
function refreshFromBrowser() {
  return browser.proxy.settings.get({}).then(function (proxyInfo) {
    let hasPanel =
      typeof document !== "undefined" &&
      document.getElementById("noproxy-id") !== null;

    if (hasPanel) {
      setupSwitcher(proxyInfo.value);
    } else if (typeof startupProxyType === "function") {
      // Background page only.
      startupProxyType(proxyInfo.value.proxyType);
    }
    return proxyInfo.value;
  });
}

//Fire when user clicked on noproxy button
function setNoProxySetting() {
  let noProxySetting = {
    proxyType: "none",
  };

  // Remember the current proxy before turning it off, so switching back on
  // can restore it even if Switcher never configured it in the first place.
  browser.proxy.settings.get({}).then(function (proxyInfo) {
    if (!hasProxyHost(readStoredConfig())) {
      resolveManualConfig(proxyInfo.value);
    }
    applyProxySetting(noProxySetting);
  });

  // disable active green pint on system proxy / manual proxy button
  currectActiveButton("noproxy-id");

  // call setBadgeText function from browse_actions.js
  setBadgeText("N");

  //
  setSwitcherIconSatus("noproxy");

  //
  setSwitcherButtonIsSet("noproxy");

  //panel shortcut handeling
  deactiveShortcutActive("noproxy-shortcut");

  // hide lable that show current http proxy
  hideCurrentHttpProxyThatIsSet();
}

//Fire when user clicked on systemproxy button
function setSystemProxySetting() {
  let systemProxySetting;

  // Checking LocalStorage Config is exist or not
  let isSwitcherLocalStorageExist = localStorage.getItem(
    "SwitcherManualProxyConfig",
  );

  if (isSwitcherLocalStorageExist) {
    let getProxySetting = JSON.parse(
      localStorage.getItem("SwitcherManualProxyConfig"),
    );
    systemProxySetting = {
      proxyType: "system",
      passthrough: getProxySetting.passthrough,
    };
  } else {
    systemProxySetting = {
      proxyType: "system",
    };
  }

  applyProxySetting(systemProxySetting);

  // disable active green point on no proxy / manual proxy button
  currectActiveButton("systemproxy-id");

  // call setBadgeText function from browserAction.js
  setBadgeText("S");

  setSwitcherIconSatus("systemproxy");

  setSwitcherButtonIsSet("systemproxy");

  //panel shortcut handeling
  deactiveShortcutActive("systemproxy-shortcut");

  // hide lable that show current http proxy
  hideCurrentHttpProxyThatIsSet();
}

//Fire when user clicked on manualproxy button
function setManualProxySetting() {
  // disable active green point on no proxy / system proxy button
  currectActiveButton("manualproxy-id");

  // call setBadgeText function from browse_actions.js
  setBadgeText("M");

  // change status Icon to manual icon
  setSwitcherIconSatus("manualproxy");

  // updating no proxy / system proxy  / manual proxy text
  setSwitcherButtonIsSet("manualproxy");

  // Resolve the manual config against Firefox's live settings, so a proxy that
  // was configured in Firefox's own Settings page is adopted rather than
  // clobbered with an empty config.
  browser.proxy.settings.get({}).then(function (proxyInfo) {
    let manualProxySetting = resolveManualConfig(proxyInfo.value);

    if (!hasProxyHost(manualProxySetting)) {
      // Nothing to switch to yet -- open the form so the user can enter one.
      manualProxyFormHandler();
      showCurrentHttpProxyThatIsSet("");
      return;
    }

    applyProxySetting(manualProxySetting).then(function (ok) {
      if (ok) {
        writeStoredConfig(manualProxySetting);
        // show current http proxy that is set as http
        showCurrentHttpProxyThatIsSet(
          manualProxySetting.http ||
            manualProxySetting.ssl ||
            manualProxySetting.socks,
        );
      }
    });
  });

  //panel shortcut handeling
  deactiveShortcutActive("manualproxy-shortcut");
}

// Fire when user clicked on manualproxy config button
// this function handel manualproxy form inputs
function manualProxyFormHandler() {
  // Check Form is collapsed or not
  let isElementCollapsed = document.getElementsByClassName(
    "manualproxy-config-form-elements",
  )[0].classList.length;

  if (isElementCollapsed > 1) {
    document
      .getElementsByClassName("manualproxy-config-form-elements")[0]
      .classList.remove("hide-element");

    document
      .getElementById("manualproxy-config-button-id")
      .classList.add("manualproxy-config-button-active");
  } else {
    document
      .getElementsByClassName("manualproxy-config-form-elements")[0]
      .classList.add("hide-element");

    document
      .getElementById("manualproxy-config-button-id")
      .classList.remove("manualproxy-config-button-active");
  }

  // Open the form against the best config we have. If Switcher has nothing
  // stored, adopt Firefox's live settings first, so a proxy configured in
  // Firefox's own Settings > Network Settings shows up pre-filled here
  // instead of the form opening blank.
  let stored = readStoredConfig();
  if (hasProxyHost(stored)) {
    fillManualProxyForm(stored);
    return;
  }

  browser.proxy.settings.get({}).then(function (proxyInfo) {
    fillManualProxyForm(resolveManualConfig(proxyInfo.value));
  });
}

// Populate the manual-proxy form fields from a config object.
function fillManualProxyForm(getLocalStorageObject) {
  {
    let getAllInputField = document.querySelectorAll("input[type='text']");

    let getHttpUrlValue;
    Object(getAllInputField).forEach(function (item) {
      switch (item.id) {
        case "http-proxy-url":
          item.value = getLocalStorageObject.http;
          break;
        case "https-proxy-url":
          item.value = getLocalStorageObject.ssl;
          break;
        case "socks-proxy-url":
          item.value = getLocalStorageObject.socks;
          break;
        case "noproxy-proxy-urls":
          item.value = getLocalStorageObject.passthrough;
          break;
      }
    });

    // checking if http == https then checkbox should be checked
    if (
      getLocalStorageObject.http == getLocalStorageObject.ssl &&
      getLocalStorageObject.http != "" &&
      getLocalStorageObject.ssl != ""
    ) {
      let getHttpForHttpsCheckbox = document.getElementById(
        "set-http-url-for-https",
      );
      getHttpForHttpsCheckbox.checked = true;
    }

    // checking radio box selection through socksVersion item in LocalStorage object
    let getSocksVersionRadio = document.querySelectorAll("input[type='radio']");
    Object(getSocksVersionRadio).forEach(function (item) {
      item.checked = false;

      if (getLocalStorageObject.socksVersion == 4 && item.id == "version4") {
        item.checked = true;
      } else if (
        getLocalStorageObject.socksVersion == 5 &&
        item.id == "version5"
      ) {
        item.checked = true;
      }
    });

    // when LocalStorage is exist call the setManualProxyFormEvents
    // to setup all input field events
    setManualProxyFormEvents();
  }
}

//Fire 3th and checked current proxy type and update popup button list current proxy used
// Accepts the full ProxyConfig value from browser.proxy.settings.get() so the
// panel can report the proxy Firefox is really using, whoever configured it.
function setupSwitcher(browserValue) {
  let proxyType =
    browserValue && typeof browserValue === "object"
      ? browserValue.proxyType
      : browserValue;

  // Get Os Name through navigator.userAgent API
  let osName = "unknown";

  osName = userAgentParser(navigator.userAgent);

  setOsIcon(osName);

  //Setup switcher version
  let version = browser.runtime.getManifest().version;
  document.getElementById("switcher-version").textContent =
    "version : " + version;

  //Setup swithcer for current proxy mode
  if (proxyType == "none") {
    currectActiveButton("noproxy-id");
    // call setBadgeText function from browserAction.js
    setBadgeText("N");

    //
    setSwitcherIconSatus("noproxy");

    //
    setSwitcherButtonIsSet("noproxy");

    //panel shortcut handeling
    deactiveShortcutActive("noproxy-shortcut");
    //
  } else if (proxyType == "system") {
    //
    currectActiveButton("systemproxy-id");
    // call setBadgeText function from browserAction.js
    setBadgeText("S");

    //
    setSwitcherIconSatus("systemproxy");

    //
    setSwitcherButtonIsSet("systemproxy");

    //panel shortcut handeling
    deactiveShortcutActive("systemproxy-shortcut");

    //
  } else if (proxyType == "manual") {
    //
    currectActiveButton("manualproxy-id");

    // call setBadgeText function from browser_action.js
    setBadgeText("M");

    setSwitcherIconSatus("manualproxy");

    setSwitcherButtonIsSet("manualproxy");

    //panel shortcut handeling
    deactiveShortcutActive("manualproxy-shortcut");

    // Show the proxy Firefox is actually using. Reading it from the live
    // settings rather than localStorage means a proxy set up in Firefox's own
    // Settings page is displayed too.
    if (browserValue && typeof browserValue === "object") {
      // Keep Switcher's stored copy in step with the browser.
      if (!hasProxyHost(readStoredConfig())) {
        resolveManualConfig(browserValue);
      }
      showCurrentHttpProxyThatIsSet(
        browserValue.http || browserValue.ssl || browserValue.socks,
      );
    } else {
      let stored = readStoredConfig();
      showCurrentHttpProxyThatIsSet(stored && stored.http);
    }
  } else if (proxyType == "autoDetect" || proxyType == "autoConfig") {
    // Previously these two modes fell through unhandled, leaving the badge
    // showing whatever it said before. "A" already existed in setBadgeText().
    setBadgeText("A");
    setSwitcherIconSatus("systemproxy");
    hideCurrentHttpProxyThatIsSet();
  }
}

// Checking a api in browser is exsist or not
function isApiExist(api) {
  return api !== undefined;
}

// To Identyfy user system and select proper icon for system Proxy
function userAgentParser(ua) {
  if (/windows|win32|win64/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "mac";
  if (/linux/i.test(ua)) return "linux";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/openbsd/i.test(ua)) return "openbsd";
  if (/freebsd/i.test(ua)) return "freebsd";

  return "unknown";
}

// select curret active button and add green point light on it
function currectActiveButton(targetId) {
  let getListOfButtons = document.querySelectorAll(".switcher-button");
  Object(getListOfButtons).forEach(function (item) {
    if (targetId == item.id) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

function findCurrentActiveButton() {
  let getListOfButtons = document.querySelectorAll(".switcher-button");
  let proxyType;
  Object(getListOfButtons).forEach(function (item) {
    if (item.classList.contains("active")) {
      switch (item.id) {
        case "noproxy-id":
          proxyType = "none";
          break;
        case "systemproxy-id":
          proxyType = "system";
          break;
        case "manualproxy-id":
          proxyType = "manual";
          break;
      }
    }
  });

  return proxyType;
}

// Management shortcut text on button - deactive curret sellected button
function deactiveShortcutActive(targetId) {
  let getListOfShortcutActive = document.querySelectorAll(".shortcut-switch");
  Object(getListOfShortcutActive).forEach(function (item) {
    if (targetId == item.id) {
      item.classList.remove("shortcut-active");
    } else {
      item.classList.add("shortcut-active");
    }
  });
}

// Manage main icon of the Switcher
function setSwitcherIconSatus(iconId) {
  let switcherIcon = document.getElementsByClassName("Switcher-icon-status");
  let swticherIconShadow = document.getElementsByClassName("icon");
  if (iconId == "noproxy") {
    switcherIcon[0].src = "../images/icons/set_noproxy.png";
    // swticherIconShadow[0].classList.add("red-shadow");
    // swticherIconShadow[0].classList.remove("green-shadow");
    // swticherIconShadow[0].classList.remove("blue-shadow");
  }

  if (iconId == "systemproxy") {
    switcherIcon[0].src = "../images/icons/set_systemproxy.png";
    // swticherIconShadow[0].classList.add("green-shadow");
    // swticherIconShadow[0].classList.remove("red-shadow");
    // swticherIconShadow[0].classList.remove("blue-shadow");
  }

  if (iconId == "manualproxy") {
    switcherIcon[0].src = "../images/icons/set_manualproxy.png";
    // swticherIconShadow[0].classList.add("blue-shadow");
    // swticherIconShadow[0].classList.remove("red-shadow");
    // swticherIconShadow[0].classList.remove("green-shadow");
  }
}

// Manage button text that which button was selected
function setSwitcherButtonIsSet(targetId) {
  let buttonName;
  document.querySelectorAll(".switcher-button>span").forEach((item) => {
    if (/-text/i.test(item.className)) {
      let targetIdRegexPattern = new RegExp(`${targetId}`, "i");
      if (targetIdRegexPattern.test(item.className)) {
        buttonName = item.getAttributeNode("data-name").value;
        item.innerText = "";
        item.innerText = buttonName + " Mode is Set";
      } else {
        if (/Set/i.test(item.innerText)) {
          buttonName = item.getAttributeNode("data-name").value;
          item.innerText = "";
          item.innerText = "Switch To " + buttonName;
        }
      }
    }
  });
}

function showCurrentHttpProxyThatIsSet(httpValue) {
  // No proxy configured yet -> keep the label hidden and blank, so a stale or
  // placeholder value can never be mistaken for a live setting.
  if (!httpValue) {
    document.getElementById("manualproxy-show-current-http-proxy").innerText =
      "";
    hideCurrentHttpProxyThatIsSet();
    return;
  }

  // Show current manual proxy that set as http
  document
    .getElementById("manualproxy-current-http-setting")
    .classList.remove("hide-element");

  httpValue = httpValue.replaceAll("http://", "");
  httpValue = httpValue.replaceAll("https://", "");
  httpValue = httpValue.replaceAll("://", "");

  const label = document.getElementById("manualproxy-show-current-http-proxy");

  // Long values used to be dropped entirely, which left the panel showing
  // nothing while a proxy really was set. Truncate for display instead and
  // keep the full value in the tooltip.
  label.innerText =
    httpValue.length <= 22 ? httpValue : httpValue.slice(0, 21) + "\u2026";
  label.title = httpValue;
}

function hideCurrentHttpProxyThatIsSet() {
  let getElement = document.getElementById("manualproxy-current-http-setting");
  let isHideElemenExist = false;
  getElement.classList.forEach((item) => {
    if (item == "hide-element") {
      isHideElemenExist = true;
    }
  });

  if (!isHideElemenExist) {
    getElement.classList.add("hide-element");
  }
}

function isCheckBoxChecked(id) {
  const getCheckBox = document.getElementById(id);
  if (getCheckBox.checked) {
    return true;
  }
  return false;
}
