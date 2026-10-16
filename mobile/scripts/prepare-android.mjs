import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (!fs.existsSync('android')) execFileSync(npx, ['cap', 'add', 'android'], { stdio: 'inherit', shell: process.platform === 'win32' });
execFileSync(npx, ['cap', 'sync', 'android'], { stdio: 'inherit', shell: process.platform === 'win32' });
const manifest = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(manifest, 'utf8');
if (!xml.includes('android:scheme="takingcare"')) {
  xml = xml.replace('</activity>', `<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="takingcare" android:host="agua" />
  </intent-filter></activity>`);
  fs.writeFileSync(manifest, xml);
}
console.log('Android ready: Victus provider supplied by local Capacitor plugin.');
