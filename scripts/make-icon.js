// 앱 아이콘(build/icon.png, 512x512)을 코어 모양 SVG로 그려서 저장한다.
// 실행: node_modules\electron\dist\electron.exe scripts\make-icon.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 300 300">
<defs>
  <radialGradient id="bg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#0a2a40"/><stop offset="100%" stop-color="#020910"/></radialGradient>
  <radialGradient id="cg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e6fdff"/><stop offset="35%" stop-color="#3ee0ff"/><stop offset="100%" stop-color="#0070a8" stop-opacity="0"/></radialGradient>
</defs>
<rect width="300" height="300" rx="64" fill="url(#bg)"/>
<g fill="none" stroke="#3ee0ff">
  <circle cx="150" cy="150" r="118" stroke-width="10" stroke-dasharray="150 35 40 35" opacity=".95"/>
  <circle cx="150" cy="150" r="96" stroke-width="3" stroke-dasharray="3 7" opacity=".6"/>
  <circle cx="150" cy="150" r="78" stroke="#00a8ff" stroke-width="7" stroke-dasharray="70 22"/>
</g>
<circle cx="150" cy="150" r="58" fill="url(#cg)"/>
<circle cx="150" cy="150" r="34" fill="none" stroke="#ffffff" stroke-width="3" opacity=".85"/>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const out = path.join(__dirname, "..", "build", "icon.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.resize({ width: 512, height: 512 }).toPNG());
  console.log("icon saved:", out, img.getSize());
  app.exit(0);
});
