const fs = require('fs');
const path = require('path');

const packageFile = path.resolve(__dirname, '..', 'ios', 'App', 'CapApp-SPM', 'Package.swift');
if (!fs.existsSync(packageFile)) process.exit(0);

const source = fs.readFileSync(packageFile, 'utf8');
const normalized = source.replace(
  /path: "([^"]+)"/g,
  (_, pluginPath) => `path: "${pluginPath.replace(/\\/g, '/')}"`
);
if (normalized !== source) {
  fs.writeFileSync(packageFile, normalized);
  console.log('Normalized Capacitor Swift package paths for macOS builds.');
}
