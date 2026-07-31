const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicRoot = path.resolve(root, 'web-easy', 'public');
const destination = path.resolve(publicRoot, 'app');

if (!destination.startsWith(publicRoot + path.sep)) {
  throw new Error('Refusing to sync outside web-easy/public.');
}

fs.rmSync(destination, {recursive:true, force:true});
fs.mkdirSync(destination, {recursive:true});

fs.copyFileSync(
  path.join(root, 'dingding_zones.html'),
  path.join(destination, 'index.html')
);
fs.copyFileSync(
  path.join(root, 'dingding_notifications_sw.js'),
  path.join(destination, 'dingding_notifications_sw.js')
);
fs.cpSync(path.join(root, 'src'), path.join(destination, 'src'), {recursive:true});
fs.cpSync(path.join(root, 'vendor'), path.join(destination, 'vendor'), {recursive:true});

console.log('Synced shared DingDing Zones source to web-easy/public/app/.');
