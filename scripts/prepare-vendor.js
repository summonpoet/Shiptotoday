const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageRoot = path.resolve(path.dirname(require.resolve('chart.js/auto')), '..');
const source = path.join(packageRoot, 'dist', 'chart.umd.js');
const vendorDir = path.join(root, 'vendor');
fs.mkdirSync(vendorDir, { recursive:true });
fs.copyFileSync(source, path.join(vendorDir, 'chart.umd.js'));
const interRoot = path.dirname(require.resolve('@fontsource/inter/package.json'));
for (const weight of ['400', '500', '600']) {
  fs.copyFileSync(
    path.join(interRoot, 'files', `inter-latin-${weight}-normal.woff2`),
    path.join(vendorDir, `inter-latin-${weight}-normal.woff2`)
  );
}
console.log('Prepared Chart.js and Inter vendor assets.');
