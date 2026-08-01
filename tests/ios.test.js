const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const platform = fs.readFileSync('src/platform-browser.js', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const build = fs.readFileSync('scripts/build-ios-web.js', 'utf8');
const iosStyles = fs.readFileSync('src/platform-ios.css', 'utf8');
const infoPlist = fs.readFileSync('ios/App/App/Info.plist', 'utf8');
const codemagic = fs.readFileSync('codemagic.yaml', 'utf8');

test('Capacitor iOS shell uses a separate shared-code build', () => {
  assert.equal(config.appName, 'Ship to Today');
  assert.equal(config.appId, 'com.summonpoet.shiptotoday');
  assert.equal(config.webDir, 'dist-ios');
  assert.match(config.appId, /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/);
  assert.match(packageJson.scripts['ios:sync'], /cap sync ios/);
  assert.match(build, /capacitor-local-notifications\.js/);
  assert.match(build, /data-native-shell="ios"/);
});

test('iOS adapter uses native lifecycle and scheduled local notifications', () => {
  assert.match(platform, /global\.Capacitor\.isNativePlatform\(\)/);
  assert.match(platform, /localNotifications\.requestPermissions\(\)/);
  assert.match(platform, /localNotifications\.schedule\(\{/);
  assert.match(platform, /capacitorApp\.addListener\('appStateChange'/);
  assert.match(platform, /localNotificationActionPerformed/);
  assert.match(platform, /idleAt:\(\) => suspended \? Infinity/);
  assert.match(config.plugins.LocalNotifications.presentationOptions.join(','), /sound,banner,list/);
});

test('active focus sessions persist and recover after process suspension', () => {
  assert.match(app, /ACTIVE_SESSION_KEY = 'ddz_active_session_v1'/);
  assert.match(app, /function persistActiveSession\(\)/);
  assert.match(app, /function restoreActiveSession\(\)/);
  assert.match(app, /advanceTimerTo\(Date\.now\(\)\)/);
  assert.match(app, /DDZPlatform\.lifecycle\.onPause/);
  assert.match(app, /scheduleNextSessionEvent/);
});

test('iOS visuals account for safe areas and native touch targets', () => {
  assert.match(iosStyles, /env\(safe-area-inset-top\)/);
  assert.match(iosStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(iosStyles, /min-height: 44px/);
});

test('iPad declares every orientation required for multitasking uploads', () => {
  assert.match(infoPlist, /UIInterfaceOrientationLandscapeLeft/);
  assert.match(infoPlist, /UIInterfaceOrientationLandscapeRight/);
});

test('iOS declares that the app does not use non-exempt encryption', () => {
  assert.match(infoPlist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
});

test('Codemagic includes an isolated signed TestFlight workflow', () => {
  assert.match(codemagic, /ios-testflight:/);
  assert.match(codemagic, /app_store_connect: ship-to-today-testflight/);
  assert.match(codemagic, /distribution_type: app_store/);
  assert.match(codemagic, /bundle_identifier: com\.summonpoet\.shiptotoday/);
  assert.match(codemagic, /testFlightInternalTestingOnly/);
  assert.match(codemagic, /agvtool new-version -all "\$BUILD_NUMBER"/);
  assert.doesNotMatch(codemagic, /CM_BUILD_NUMBER/);
  assert.match(codemagic, /xcode-project build-ipa/);
  assert.match(codemagic, /auth: integration/);
});
