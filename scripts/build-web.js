const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const files = [
  'dingding_zones.html',
  'dingding_notifications_sw.js',
];
const directories = ['src', 'vendor'];

fs.rmSync(dist, {recursive:true, force:true});
fs.mkdirSync(dist, {recursive:true});

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}
for (const directory of directories) {
  fs.cpSync(path.join(root, directory), path.join(dist, directory), {recursive:true});
}

fs.copyFileSync(
  path.join(dist, 'dingding_zones.html'),
  path.join(dist, 'index.html')
);

console.log('Prepared desktop web assets in dist/.');
