const fs = require('fs');
const path = require('path');

const sharedSyncScript = path.resolve(__dirname, '..', '..', 'scripts', 'sync-public-web.js');

if (fs.existsSync(sharedSyncScript)) {
  require(sharedSyncScript);
} else {
  console.log('Shared workspace is not present; using the committed generated web assets.');
}
