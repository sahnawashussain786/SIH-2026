const sharp = require('sharp');
const path = require('path');

const files = ['technical-approach', 'pipeline', 'feasibility', 'impact'];

(async () => {
  for (const f of files) {
    const svgPath = path.join(__dirname, 'visuals', `${f}.svg`);
    const pngPath = path.join(__dirname, 'visuals', `${f}.png`);
    await sharp(svgPath, { density: 150 })
      .resize({ width: 2400 })
      .png()
      .toFile(pngPath);
    console.log('rendered', `${f}.png`);
  }
})();
