const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const icons = {
  learning: 'assets/bonus-homework-96.png',
  life: 'assets/bonus-life-96.png',
  cooperation: 'assets/bonus-bond-96.png'
};
const entries = Object.entries(icons).map(([key, file]) => {
  const data = fs.readFileSync(path.join(root, file)).toString('base64');
  return `    ${key}: 'data:image/png;base64,${data}'`;
});
const source = `<script>\n  window.SUKUMON_BONUS_ICONS = Object.freeze({\n${entries.join(',\n')}\n  });\n</script>\n`;

fs.writeFileSync(path.join(root, 'IconAssets.html'), source);
