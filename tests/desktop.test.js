const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
const rust = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const platform = fs.readFileSync('src/platform-browser.js', 'utf8');
const html = fs.readFileSync('dingding_zones.html', 'utf8');
const windowsStyles = fs.readFileSync('src/platform-windows.css', 'utf8');
const buildWeb = fs.readFileSync('scripts/build-web.js', 'utf8');

test('Tauri desktop shell uses the shared static web build', () => {
  assert.equal(config.build.frontendDist, '../dist');
  assert.equal(config.app.withGlobalTauri, true);
  assert.equal(config.app.windows[0].width, 420);
  assert.equal(config.app.windows[0].height, 780);
  assert.match(buildWeb, /dingding_zones\.html/);
  assert.match(buildWeb, /directories = \['src', 'vendor'\]/);
});

test('desktop notification bridge is wired through the official plugin', () => {
  assert.match(cargo, /tauri-plugin-notification = "2"/);
  assert.match(rust, /NotificationExt/);
  assert.match(rust, /show_checkin_notification/);
  assert.match(platform, /__TAURI__\.core\.invoke\('show_checkin_notification'\)/);
  assert.match(platform, /runtime:isCapacitor \? 'capacitor-ios' : \(isTauri \? 'tauri' : 'browser'\)/);
});

test('Windows away detection uses system-wide mouse and keyboard activity', () => {
  assert.match(rust, /fn system_idle_ms\(\)/);
  assert.match(rust, /GetLastInputInfo/);
  assert.match(rust, /GetTickCount/);
  assert.match(platform, /invoke\('system_idle_ms'\)/);
  assert.match(platform, /nativePollId = setTimeout\(pollSystemActivity, 1000\)/);
});

test('Windows appearance stays isolated from the shared mobile-ready theme', () => {
  assert.match(html, /platform-windows\.css/);
  assert.match(html, /localWindowsPreview/);
  assert.match(html, /effort-link/);
  assert.match(windowsStyles, /:root\.tauri-desktop/);
  assert.match(windowsStyles, /Segoe UI Variable/);
  assert.match(platform, /isTauri \|\| isLocalWindowsPreview/);
  assert.doesNotMatch(windowsStyles, /(^|})\s*body\s*\{/);
});
