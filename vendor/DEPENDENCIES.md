# 固定版本依賴

- xlsx-0.20.3.full.min.js：SHA-256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`
- firebase-11.6.1/firebase-app.js：SHA-256 `787ff0507703600b182ca380c061fab287bba397faf6a8341fc9ceb09c337d6e`
- firebase-11.6.1/firebase-auth.js：SHA-256 `e0f625199ef3c6c25d8f138bbe49ecd6e6f379b1cd53980809f885861748995b`
- firebase-11.6.1/firebase-firestore.js：SHA-256 `ff2e87a86cd3ac9aaaf1fb3886a2a3c98a10b24d7cd215b706b28b9f821aeac3`

SheetJS CE 0.20.3：來源 https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js ，Apache 2.0，完整授權见 SheetJS-LICENSE.txt。

Firebase 11.6.1：來源 https://www.gstatic.com/firebasejs/11.6.1/firebase-{app,auth,firestore}.js ，保留發布檔授權標頭；只將同版 app 模組的 gstatic 路徑改為相對路徑，便於部署至專案子目錄。雜湊為調整後交付檔案。

固定版本避免日後 CDN latest 變動；升級 SDK 時請同步更新三個模組、config.js 版本與測試。
