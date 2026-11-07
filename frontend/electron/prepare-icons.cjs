'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function prepareIcons() {
  const projectRoot = path.join(__dirname, '..');
  const source = path.join(projectRoot, 'public', 'icons', 'icon-512.png');
  const outputDirectory = path.join(projectRoot, 'build');
  const destination = path.join(outputDirectory, 'icon.ico');
  const { default: pngToIco } = await import('png-to-ico');

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(destination, await pngToIco(source));
  console.log(`Windows icon generated at ${destination}`);
}

prepareIcons().catch(error => {
  console.error('Unable to prepare the Windows application icon:', error);
  process.exitCode = 1;
});
