const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-ios');

const files = [
  'dingding_zones.html',
  'dingding_notifications_sw.js',
];
const directories = ['src', 'vendor'];

fs.rmSync(output, {recursive:true, force:true});
fs.mkdirSync(output, {recursive:true});

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
for (const directory of directories) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), {recursive:true});
}

const capacitorScripts = [
  ['@capacitor/core/dist/capacitor.js', 'capacitor.js'],
  ['@capacitor/app/dist/plugin.js', 'capacitor-app.js'],
  ['@capacitor/local-notifications/dist/plugin.js', 'capacitor-local-notifications.js'],
];
for (const [source, filename] of capacitorScripts) {
  fs.copyFileSync(
    require.resolve(source),
    path.join(output, 'vendor', filename)
  );
}

const sourceHtml = fs.readFileSync(path.join(output, 'dingding_zones.html'), 'utf8');
const nativeBridge = [
  '  <script src="./vendor/capacitor.js"></script>',
  '  <script src="./vendor/capacitor-app.js"></script>',
  '  <script src="./vendor/capacitor-local-notifications.js"></script>',
].join('\n');
const iosHtml = sourceHtml
  .replace(
    '  <script src="./vendor/chart.umd.js"></script>',
    `  <script src="./vendor/chart.umd.js"></script>\n${nativeBridge}`
  )
  .replace(
    '<html lang="zh-CN">',
    '<html lang="zh-CN" data-native-shell="ios">'
  );

fs.writeFileSync(path.join(output, 'index.html'), iosHtml);
console.log('Prepared Capacitor iOS web assets in dist-ios/.');
