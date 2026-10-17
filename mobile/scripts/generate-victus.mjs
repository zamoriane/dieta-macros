// Deterministic vector artwork derived from the brand's open circle / human mark.
// Shared SVGs for web and PNG assets for native widgets; no remote generation at build time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'package.json'));
const sharp = require('sharp');
const faces = {
  sleepy: '<path d="M47 44q4 5 8 0m10 0q4 5 8 0"/><path d="M57 57q3-2 6 0"/>',
  grumpy: '<path d="M47 38l9 4m9 0 9-4"/><circle cx="52" cy="46" r="1.8" fill="#006162"/><circle cx="69" cy="46" r="1.8" fill="#006162"/><path d="M56 57q5-4 10 0"/>',
  encouraging: '<path d="M47 45q4-6 8 0m10 0q4-6 8 0M54 54q7 9 14 0"/>',
  happy: '<path d="M47 44q4-6 8 0m10 0q4-6 8 0"/><path d="M52 53q9 16 18 0z" fill="#006162"/>',
};
for (const [name, face] of Object.entries(faces)) {
  const arms = name === 'sleepy' ? 'M55 78Q37 80 33 100M67 78q18 2 21 22' : name === 'grumpy' ? 'M55 78Q27 65 29 88M67 78q27-13 25 10' : name === 'happy' ? 'M55 78Q30 66 28 48M67 78q25-12 27-30' : 'M55 78Q32 85 27 72M67 78q25-12 27-30';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140"><rect x="2" y="2" width="116" height="136" rx="38" fill="#073B40" stroke="#FFFFFF" stroke-width="3"/><path d="M74 12A55 55 0 1 0 111 58" fill="none" stroke="#46E0C1" stroke-width="9" stroke-linecap="round"/><circle cx="60" cy="46" r="23" fill="white"/><g stroke="white" stroke-width="10" stroke-linecap="round" fill="none"><path d="M60 75Q82 97 53 120"/><path d="${arms}"/></g><g stroke="#006162" stroke-width="2.7" stroke-linecap="round" fill="none">${face}</g></svg>`;
  const web = path.join(root, 'public/victus'); fs.mkdirSync(web, { recursive: true }); fs.writeFileSync(path.join(web, name + '.svg'), svg);
  const images = path.join(root, 'mobile/widgets/ios/Assets.xcassets', name + '.imageset'); fs.mkdirSync(images, { recursive: true });
  const png = await sharp(Buffer.from(svg)).resize(240, 280).png().toBuffer();
  fs.writeFileSync(path.join(images, name + '.png'), png);
  fs.writeFileSync(path.join(images, 'Contents.json'), JSON.stringify({ images: [{ filename: name + '.png', idiom: 'universal' }], info: { author: 'xcode', version: 1 } }));
  const android = path.join(root, 'mobile/plugins/victus/android/src/main/res/drawable-nodpi'); fs.mkdirSync(android, { recursive: true }); fs.writeFileSync(path.join(android, 'victus_' + name + '.png'), png);
}
