// background_script.js :
// background script load when browser load to memory

// set switcher badgetText with proxy type
function startupProxyType(proxyType) {
  switch (proxyType) {
    case "none":
      setBadgeText("N");
      break;

    case "system":
      setBadgeText("S");
      break;

    case "manual":
      setBadgeText("M");
      break;

    // Without these the badge kept a stale letter when Firefox was in an
    // auto-detect / PAC mode that Switcher itself never sets.
    case "autoDetect":
    case "autoConfig":
      setBadgeText("A");
      break;
  }
}

// get proxy setting then call startupProxyType
browser.proxy.settings.get({}).then(function (proxyInfo) {
  // set proxy type
  startupProxyType(proxyInfo.value.proxyType);
});

// Keep the badge truthful when the proxy is changed outside Switcher -- from
// Firefox's own Settings > Network Settings, or by another add-on. Without
// this the badge only ever updated when Switcher made the change itself.
if (browser.proxy.settings.onChange) {
  browser.proxy.settings.onChange.addListener(function (detail) {
    if (detail && detail.value) {
      startupProxyType(detail.value.proxyType);
    }
  });
}
