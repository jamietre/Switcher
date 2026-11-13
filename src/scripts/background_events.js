// Switcher swith command : ALT + CTRL + S
// Switch command :
// - switch  command define in manifetst.json
// - it toggle proxy setting between system proxy and manual proxy
browser.commands.onCommand.addListener(function (command) {
  if (command === "switch") {
    browser.proxy.settings.get({}).then(function (proxyInfo) {
      switch (proxyInfo.value.proxyType) {
        case "none": {
          setBadgeText("S");

          let stored = readStoredConfig();
          let systemProxySetting = stored
            ? { proxyType: "system", passthrough: stored.passthrough }
            : { proxyType: "system" };

          applyProxySetting(systemProxySetting);
          break;
        }

        case "system": {
          // Resolve against Firefox's live config: this used to write an empty
          // {http:"",ssl:"",socks:""} whenever Switcher had no stored config,
          // silently erasing a proxy set up in Firefox's own Settings page.
          let manualProxySetting = resolveManualConfig(proxyInfo.value);

          if (!hasProxyHost(manualProxySetting)) {
            // Nothing to switch on -- stay put rather than "enabling" a
            // manual mode with no proxy server in it.
            console.warn(
              "Switcher: no manual proxy configured, staying in system mode.",
            );
            break;
          }

          setBadgeText("M");
          writeStoredConfig(manualProxySetting);
          applyProxySetting(manualProxySetting);
          break;
        }

        case "manual": {
          setBadgeText("N");

          // Preserve the proxy we are switching away from.
          if (!hasProxyHost(readStoredConfig())) {
            resolveManualConfig(proxyInfo.value);
          }

          applyProxySetting({ proxyType: "none" });
          break;
        }

        default:
          break;
      }
    });
  }
});

//Suggest Switcher ADD-ONS home page in omnibox
browser.omnibox.onInputStarted.addListener(function () {
  browser.omnibox.setDefaultSuggestion({
    description: "Go to Switcher ADD-ONS page",
  });
});

//Go to Switcher ADD-ONS home page on firefox ADD-ONS
browser.omnibox.onInputEntered.addListener(function () {
  browser.tabs.update({
    // This fork is not on AMO; point at its repository instead.
    url: "https://github.com/jamietre/Switcher",
  });
});
