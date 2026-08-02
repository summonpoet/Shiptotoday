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
const xcodeProject = fs.readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const storyboard = fs.readFileSync('ios/App/App/Base.lproj/Main.storyboard', 'utf8');
const bridgeViewController = fs.readFileSync('ios/App/App/BridgeViewController.swift', 'utf8');
const liveActivityPlugin = fs.readFileSync('ios/App/App/FocusLiveActivityPlugin.swift', 'utf8');
const liveActivityWidget = fs.readFileSync('ios/App/ShipToTodayLiveActivity/FocusLiveActivity.swift', 'utf8');
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
  assert.match(platform, /if \(!isCapacitor\) \{\s*document\.addEventListener\('visibilitychange'/);
  assert.match(platform, /if \(isCapacitor \|\| !global\.Worker\)/);
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
  assert.match(app, /function resumeForegroundSession\(forceTimerScreen = false\)/);
  assert.match(app, /const event = advanceTimerTo\(Date\.now\(\)\);/);
  assert.match(app, /if \(!event && task && !task\.isPaused\) \{\s*drawTimer\(\);\s*startTicker\(\);/);
  assert.match(app, /DDZPlatform\.lifecycle\.onResume\(\(\) => \{\s*resumeForegroundSession\(\);/);
  assert.match(app, /if \(task\) resumeForegroundSession\(true\);/);
  assert.match(app, /advanceTimerTo\(Date\.now\(\)\);[\s\S]*stopTicker\(\);[\s\S]*persistActiveSession\(\);[\s\S]*scheduleNextSessionEvent\(\);/);
  assert.match(app, /stopBreakTicker\(\);\s*suspendCheckinAutoSubmit\(\);/);
  assert.match(app, /screenId === 'screen-checkin'[\s\S]*resumeCheckinAutoSubmit\(\)/);
});

test('iOS focus sessions bridge every Live Activity lifecycle state', () => {
  assert.match(platform, /global\.Capacitor\?\.Plugins\?\.FocusLiveActivity/);
  assert.match(platform, /focusLiveActivity\.start\(state\)/);
  assert.match(platform, /focusLiveActivity\.update\(state\)/);
  assert.match(platform, /focusLiveActivity\.end\(/);
  assert.match(platform, /capacitorApp\.addListener\('appUrlOpen'/);
  assert.match(app, /startFocusLiveActivity\(\)/);
  assert.match(app, /updateFocusLiveActivity\(source === 'auto' \? 'Away' : 'Paused', false\)/);
  assert.match(app, /updateFocusLiveActivity\('Check-in', false\)/);
  assert.match(app, /updateFocusLiveActivity\('Break', false\)/);
  assert.match(app, /endFocusLiveActivity\(task\.id\)/);
  assert.match(app, /shiptotoday:\/\/timer/);
  assert.match(bridgeViewController, /registerPluginInstance\(FocusLiveActivityPlugin\(\)\)/);
  assert.doesNotMatch(bridgeViewController, /registerPluginType\(FocusLiveActivityPlugin\.self\)/);
});

test('Live Activity renders countdown, expanded state, lock screen and deep link', () => {
  assert.match(liveActivityPlugin, /ActivityAuthorizationInfo\(\)\.areActivitiesEnabled/);
  assert.match(liveActivityPlugin, /Activity<FocusActivityAttributes>\.activities/);
  assert.match(liveActivityPlugin, /dismissalPolicy: \.immediate/);
  assert.match(liveActivityWidget, /ActivityConfiguration\(for: FocusActivityAttributes\.self\)/);
  assert.match(liveActivityWidget, /DynamicIslandExpandedRegion\(\.bottom\)/);
  assert.match(liveActivityWidget, /compactLeading:/);
  assert.match(liveActivityWidget, /compactTrailing:/);
  assert.match(liveActivityWidget, /minimal:/);
  assert.match(liveActivityWidget, /ClampedCountdownText\(endDate: state\.timerDate\)/);
  assert.match(liveActivityWidget, /ClampedCountdownText\(endDate: date\)/);
  assert.match(liveActivityWidget, /timerInterval: Date\.distantPast\.\.\.endDate/);
  assert.match(liveActivityWidget, /countsDown: true/);
  assert.match(liveActivityWidget, /CheckInTimerText/);
  assert.match(liveActivityWidget, /frame\(width: 46, alignment: \.center\)/);
  assert.match(liveActivityWidget, /foregroundStyle\(\.blue\)/);
  assert.match(liveActivityWidget, /foregroundStyle\(\.green\)/);
  assert.match(app, /nextCheckInSeconds/);
  assert.match(app, /Math\.min\(seconds,/);
  assert.match(liveActivityPlugin, /min\(max\(0, \$0\), safeSeconds\)/);
  assert.match(liveActivityWidget, /shiptotoday:\/\/timer/);
  assert.match(liveActivityWidget, /case "Away"/);
  assert.match(liveActivityWidget, /case "Paused", "Check-in", "Break"/);
});

test('Xcode embeds a signed Live Activity widget extension', () => {
  assert.match(infoPlist, /<key>NSSupportsLiveActivities<\/key>\s*<true\/>/);
  assert.match(infoPlist, /<string>shiptotoday<\/string>/);
  assert.match(storyboard, /customClass="BridgeViewController"/);
  assert.match(xcodeProject, /ShipToTodayLiveActivityExtension\.appex in Embed App Extensions/);
  assert.match(xcodeProject, /productType = "com\.apple\.product-type\.app-extension"/);
  assert.match(xcodeProject, /PRODUCT_BUNDLE_IDENTIFIER = com\.summonpoet\.shiptotoday\.liveactivity/);
  assert.match(xcodeProject, /IPHONEOS_DEPLOYMENT_TARGET = 16\.2/);
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
