const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const crypto = require('crypto');

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const synchronizedFiles = [
  ['dingding_zones.html', 'web-easy/public/app/index.html'],
  ['dingding_notifications_sw.js', 'web-easy/public/app/dingding_notifications_sw.js'],
  ['src/app.js', 'web-easy/public/app/src/app.js'],
  ['src/core.js', 'web-easy/public/app/src/core.js'],
  ['src/platform-browser.js', 'web-easy/public/app/src/platform-browser.js'],
  ['src/platform-ios.css', 'web-easy/public/app/src/platform-ios.css'],
  ['src/platform-windows.css', 'web-easy/public/app/src/platform-windows.css'],
  ['src/styles.css', 'web-easy/public/app/src/styles.css'],
];

test('public web assets are generated from the shared source of truth', () => {
  for (const [source, generated] of synchronizedFiles) {
    assert.equal(digest(generated), digest(source), `${generated} is stale`);
  }
});

test('generated web app contains no Capacitor-only bridge scripts', () => {
  const html = fs.readFileSync('web-easy/public/app/index.html', 'utf8');
  assert.doesNotMatch(html, /vendor\/capacitor(?:-app|-local-notifications)?\.js/);
  assert.match(html, /src\/platform-ios\.css/);
});
