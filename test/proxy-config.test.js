// Regression tests for Switcher's proxy configuration handling.
// Run with:  node test/proxy-config.test.js
//
// These cover the bugs where Switcher treated its own localStorage copy as the
// source of truth, which made a proxy configured in Firefox's own
// Settings > Network Settings invisible to the panel and overwrote it with an
// empty config on the first mode switch.

const fs = require("fs");
const vm = require("vm");

const path = require("path");
const SRC = path.join(__dirname, "..", "src", "scripts", "panel_functions.js");

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log("  PASS", name); }
  else { failed++; console.log("  FAIL", name, extra === undefined ? "" : "-> " + JSON.stringify(extra)); }
}

// Build a sandbox with a fake localStorage, a fake proxy.settings, no panel DOM.
function makeSandbox({ browserValue, setShouldFail, failMessage }) {
  const store = {};
  const calls = [];
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    // No panel markup: getElementById returns null everywhere, which is the
    // background-page case and exercises the null guards.
    document: { getElementById: () => null },
    browser: {
      proxy: {
        settings: {
          get: () => Promise.resolve({ value: browserValue }),
          set: ({ value }) => {
            calls.push(value);
            return setShouldFail
              ? Promise.reject(new Error(failMessage))
              : Promise.resolve();
          },
        },
      },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: SRC });
  return { sandbox, store, calls };
}

(async () => {
console.log("\n1. hasProxyHost");
{
  const { sandbox: s } = makeSandbox({ browserValue: {} });
  ok("null -> false", s.hasProxyHost(null) === false);
  ok("blank config -> false", s.hasProxyHost({ http: "", ssl: "", socks: "" }) === false);
  ok("http set -> true", s.hasProxyHost({ http: "127.0.0.1:8080" }) === true);
  ok("socks only -> true", s.hasProxyHost({ socks: "10.0.0.1:1080" }) === true);
}

console.log("\n2. resolveManualConfig adopts Firefox's live proxy (THE bug)");
{
  // Firefox has a manual proxy; Switcher has never stored anything.
  const { sandbox: s, store } = makeSandbox({
    browserValue: { proxyType: "manual", http: "192.168.1.50:3128", ssl: "192.168.1.50:3128", socks: "", socksVersion: 5, passthrough: "localhost" },
  });
  const resolved = s.resolveManualConfig({ proxyType: "manual", http: "192.168.1.50:3128", ssl: "192.168.1.50:3128", socks: "", socksVersion: 5, passthrough: "localhost" });
  ok("adopts http from browser", resolved.http === "192.168.1.50:3128", resolved);
  ok("adopts ssl from browser", resolved.ssl === "192.168.1.50:3128", resolved);
  ok("adopts socksVersion", resolved.socksVersion === 5, resolved);
  ok("adopts passthrough", resolved.passthrough === "localhost", resolved);
  ok("proxyType forced to manual", resolved.proxyType === "manual", resolved);
  ok("persisted to storage", JSON.parse(store.SwitcherManualProxyConfig).http === "192.168.1.50:3128");
  ok("did NOT produce a blank config", resolved.http !== "", resolved);
}

console.log("\n3. resolveManualConfig prefers Switcher's own stored config");
{
  const { sandbox: s, store } = makeSandbox({ browserValue: { proxyType: "none", http: "", ssl: "", socks: "" } });
  s.writeStoredConfig({ proxyType: "manual", http: "10.1.1.1:9999", ssl: "", socks: "", socksVersion: 4, passthrough: "" });
  const resolved = s.resolveManualConfig({ proxyType: "none", http: "", ssl: "", socks: "" });
  ok("keeps stored host", resolved.http === "10.1.1.1:9999", resolved);
}

console.log("\n4. corrupt storage does not throw");
{
  const { sandbox: s, store } = makeSandbox({ browserValue: {} });
  store.SwitcherManualProxyConfig = "{not json";
  let threw = false;
  let r;
  try { r = s.readStoredConfig(); } catch (e) { threw = true; }
  ok("readStoredConfig survives bad JSON", !threw && r === null);
}

console.log("\n5. applyProxySetting surfaces failure instead of lying");
{
  const { sandbox: s, calls } = makeSandbox({
    browserValue: { proxyType: "none" },
    setShouldFail: true,
    failMessage: "proxy.settings requires private browsing permission.",
  });
  const result = await s.applyProxySetting({ proxyType: "manual", http: "1.2.3.4:8080" });
  ok("returns false on rejection", result === false, result);
  ok("set() was attempted", calls.length === 1, calls);
}

console.log("\n6. applyProxySetting reports success");
{
  const { sandbox: s, calls } = makeSandbox({ browserValue: { proxyType: "none" } });
  const result = await s.applyProxySetting({ proxyType: "none" });
  ok("returns true", result === true, result);
  ok("passed value through", calls[0].proxyType === "none", calls);
}

console.log("\n7. resolveManualConfig preserves fields that would otherwise be reset");
{
  // ExtensionPreferencesManager.setPrefs() RESETS any pref whose key the
  // setCallback omits, so dropping proxyDNS silently unticks "Proxy DNS when
  // using SOCKS v5".
  const { sandbox: s } = makeSandbox({ browserValue: {} });
  const live = {
    proxyType: "manual",
    http: "",
    ssl: "",
    socks: "172.16.2.47:1080",
    socksVersion: 5,
    passthrough: "localhost, 127.0.0.1",
    proxyDNS: true,
    httpProxyAll: false,
    autoConfigUrl: "",
    autoLogin: false,
    respectBeConservative: true,
  };
  const r = s.resolveManualConfig(live);
  ok("keeps socks host", r.socks === "172.16.2.47:1080", r);
  ok("keeps socksVersion 5", r.socksVersion === 5, r);
  ok("keeps proxyDNS=true", r.proxyDNS === true, r);
  ok("keeps httpProxyAll=false", r.httpProxyAll === false, r);
  ok("keeps respectBeConservative", r.respectBeConservative === true, r);
  ok("keeps passthrough", r.passthrough === "localhost, 127.0.0.1", r);
  ok("socks-only config counts as a proxy", s.hasProxyHost(r) === true, r);
}

console.log("\n8. pickActiveProxy labels the protocol");
{
  const { sandbox: s } = makeSandbox({ browserValue: {} });
  let a = s.pickActiveProxy({ http: "10.0.0.1:3128" });
  ok("http -> HTTP", a.protocol === "HTTP" && a.value === "10.0.0.1:3128", a);

  a = s.pickActiveProxy({ http: "", ssl: "10.0.0.2:3129" });
  ok("ssl only -> HTTPS", a.protocol === "HTTPS" && a.value === "10.0.0.2:3129", a);

  a = s.pickActiveProxy({ http: "", ssl: "", socks: "172.16.2.47:1080", socksVersion: 5 });
  ok("socks v5 -> SOCKS5", a.protocol === "SOCKS5" && a.value === "172.16.2.47:1080", a);

  a = s.pickActiveProxy({ socks: "1.2.3.4:1080", socksVersion: 4 });
  ok("socks v4 -> SOCKS4", a.protocol === "SOCKS4", a);

  a = s.pickActiveProxy({ http: "", ssl: "", socks: "" });
  ok("nothing set -> empty value", a.value === "", a);

  a = s.pickActiveProxy(null);
  ok("null safe", a.value === "" && a.protocol === "HTTP", a);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
})();
