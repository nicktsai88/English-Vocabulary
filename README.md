# 🌈 英文單字學習樂園

繁體中文、無建置步驟的 HTML／CSS／JavaScript ES Modules 專案，包含學習網站與獨立管理頁。正式資料使用指定的 Firebase 專案，所有資料位於 `apps/english-vocabulary-v1`。不會自動建立正式示範題庫，也不會操作其他應用的資料。

## 先在本機使用

需要 Node.js 22 以上。Windows 可雙擊 `start-local.cmd`，或在專案目錄執行：

```sh
node tools/serve.mjs
```

開啟 `http://127.0.0.1:4173/english-vocabulary/index.html?demo`。

- `?demo` 是獨立本機示範，六筆指定為 **Level 2**，不代表正式來源分級，不連線寫入 Firebase。
- 正式入口：`http://127.0.0.1:4173/english-vocabulary/index.html`。
- 管理入口：`http://127.0.0.1:4173/english-vocabulary/migration_tool.html`。
- 必須經 HTTP／HTTPS 開啟，不能直接用檔案總管開啟 HTML。localhost 只供目前電腦；iPad／iPhone 請使用部署後的 HTTPS 網址。
- 結束時在伺服器視窗按 Ctrl+C。

## Firebase Console 設定

專案設定已置於 `js/config.js`，使用 `chinese-learning-47f4d`。Web API key 是用戶端識別資訊，資料存取仍靠 Authentication 與 Security Rules。

1. Authentication → Sign-in method：只需啟用 **Anonymous（匿名登入）**；使用者不需輸入帳號或密碼。
2. Authentication → Settings → Authorized domains：加入本機 `localhost`／測試需要的網域，以及 GitHub Pages 的 `你的帳號.github.io`。只填網域，不含儲存庫路徑。
3. 確認已建立 Cloud Firestore，選用合適區域與正式模式。
4. **先備份現有 Firestore 規則及索引。** 專案中 `firestore.rules` 是英文系統的完整隔離測試規則；直接覆蓋共用 Firebase 的規則會使未列出的舊應用失去存取權。正式環境應將英文 match 區塊及相關 functions 合併到既有規則，保留原應用的明確規則。
5. 檢查既有規則是否有寬鬆的 `/{document=**}` 授權；Firestore 以符合規則的 **OR** 決定權限，不能靠新增拒絕規則抵消舊的廣泛允許。舊授權必須限制到其原本 namespace，避免覆蓋英文隔離。
6. 將合併後檔案存為 `firestore.merged.rules`、`firestore.merged.indexes.json`，並保留其他應用現有索引。複製 `firebase.production.example.json` 為 `firebase.production.json`，確認後執行：

```sh
firebase deploy --config firebase.production.json --only firestore --project chinese-learning-47f4d
```

預設 `firebase.json` 供本機 Emulator 驗證；不要直接用它覆蓋共用專案的正式權限。

目前不需要手動建立題庫複合索引。管理頁依文件 ID 分頁取得題庫，再於瀏覽器按等級與數字序號排序；學習頁只依 level 篩選，讀完分頁後排序序號。學習事件依 `createdAt` 以單欄索引分頁讀取。請保留 Firestore 預設單欄索引；大型快照與原始來源已設定索引排除。此版本沒有 Storage 音檔與付費 AI／語音服務。

若舊版顯示 `The query requires an index`，更新網站的 `js/admin.js` 與 `js/store.js` 即可改用上述讀取方式，不必更改登入設定或建立該複合索引。等待 GitHub Pages 部署完成，再用 Ctrl+Shift+R 重新載入。既有複合索引可保留，不需刪除。查詢方式參考 [Firebase 官方排序文件](https://firebase.google.com/docs/firestore/query-data/order-limit-data)。

## 家庭管理模式（不需要登入或密碼）

直接開啟 `migration_tool.html` 即可新增、編輯、匯入與發布題庫，沒有 Google 登入、管理員開通、admin claim 或密碼設定。學習頁與管理頁共用背景自動建立的 Firebase 匿名身分，返回學習頁不會登出或遺失紀錄。

此版本依家庭共用需求，允許所有背景匿名使用者修改英文題庫；**父親與小孩不區分管理權限，取得網址的其他人也可能修改題庫**。網站本身沒有驗證「只限家人」的機制。個別學習紀錄仍按匿名 UID 隔離；其他應用 namespace 不新增授權，永久刪除及已發布快照修改仍禁止。

若先前已部署原版規則，必須將新版英文規則合併部署後，免登入管理頁才能寫入。程式已更新，但本交付不會自動更改正式 Firebase 權限。

## 匯入真正題庫與開始學習

1. 管理頁可下載六工作表的空白 Excel。工作表名稱為 `level1`～`level6`，忽略大小寫及前後空白。
2. 上傳 `.xlsx`、UTF-8 `.csv`、`.json` 或貼上 JSON 陣列。
3. 選擇工作表、等級與欄位對應。名稱無法辨識時必須手選，不會自動猜等級。
4. 驗證涵蓋所有列；預覽顯示前 100 列，錯誤列出工作表、列號、欄位與原因。修正錯誤後重讀檔案。
5. 選擇略過既有／更新既有／僅新增，確認後每 100 筆交易寫入。失敗項目可下載再重試。
6. 相同 `Level + 序號` 產生穩定 ID。首次來源保留於 `originalSource`；後续修訂在主要欄位中維護。不同 Level 的同字不合併。已有單字的 Level 與序號不可改，若來源重排必須保留 ID，不可把另一個字覆寫到已存在序號。
7. 匯入、審核後按 **發布固定題庫版本**。這一步才會建立 Level 2～6 的課程快照；單純新增字詞不會悄悄改變課程。
8. **發布後再建立學習者**，即可從當天取得第一組新字。若學習者是在尚無版本時建立（`none`），首頁會提供「啟用第 1 天」；發布後選定起始日，即可保留原學習者啟用課程。需使用本版 Firestore 規則。已啟用的課程仍固定，不提供重設。

只有六筆來源示範，沒有編造 6,000 筆正式內容。搭配詞補充為 `ai-assisted/pending`，請人工審核。正式分級依來源工作表。CSV 匯出只含主要欄位；保留片語及原始來源請匯出 JSON。

## 排程、日期與版本

- 學習者預設 `Asia/Taipei`，建立後固定時區，以免歷史日期重新解釋。資料層亦接受有效的 IANA 時區。
- 每個課程版本將啟用的 Level 2～6 依 Level、數字序號排序，每 15 個切成一天，Level 1 完全排除。
- 每位學習者的起始日＋版本決定全部日曆配額；未學完的新字保留原日期，不占用今天額度。
- **此版本採整期鎖定**：既有學習者的未來配額也固定使用原課程。新版供新建立的學習者使用，尚未提供既有學習者的中途轉版介面。這是明確的版本策略，沒有靜默重排。
- 每次正式答題保存原訂日期、實際日期、時區、快照與唯一事件 ID。交易核對同 ID 與單字同日正式階段，避免重送造成重複推進。
- 首次完成後以基準日累計 `1、2、4、7、15、30` 天安排；不熟隔天再試，忘記重設基準日並加入本次稍後重練。重練不寫第二次正式階段。
- 逾期一次僅前進一階，下次到期日是「基準日＋下一階段」與「實際日＋1」較晚者。第 30 天通過即完成本輪。
- 連續天數由事件時間線重建，檢查每日應有的新字及到期複習。無任務日跳過；過去未完成日中斷；今日未完成仍保留截至前一任務日的連續天數。補學不回填過去的完成日。
- 學習頁的「今日完成」是原訂任務完成情況；即使複習評為不熟或忘記，也算該次任務已作答。

## 同步、離線、備份

Firestore 是正式資料來源；語音選擇保存在此裝置、此學習者之下。題庫按等級分頁讀取，翻卡使用任務快照。只監聽目前學習者的每日計畫與單字進度；切換時解除監聽及停止語音。

離線答案先用 IndexedDB 交易保存，避免分頁同時寫入互相覆蓋。連線後提交 Firestore 交易核對，成功才移除佇列。雲端確認前不增加雲端完成數；顯示「等待同步／離線／同步失敗」，可在設定重試。Firestore 交易不在離線執行。

離線只能繼續已載入的題目，不能取得未快取課程。此版未加 Service Worker，不保證關閉瀏覽器後可以完全離線重新啟動網站；本機答題佇列仍會保留。IndexedDB 不可用時無法安全保存答案，畫面會提示；Firestore 持久快取不可用則降級保留線上功能。

設定頁可下載完整 JSON（目前學習者、計畫、進度、事件）。匯出前必須完成待同步答案。還原先驗證資料，要求新的名稱，分批寫入新 profile，完成前不顯示半成品；不覆蓋原學習者。正式還原要求相同 Firebase namespace 的原始課程版本仍存在。

同名不代表同一人，沒有公開使用者名單。清除瀏覽器資料可能失去原匿名身分；請定期備份。安全跨裝置配對尚未提供；如需增加，必須使用有期限、單次、限次數的可信任後端流程。

## 英文女聲與練習

使用 Web Speech API，已知聲音名稱只用於推薦，不宣稱 API 提供性別欄位。沒有推薦女聲時標明實際備用英文聲音。可試聽、一般 0.9、慢速 0.7、重播、停止及整卡依序朗讀；自然音高。切卡／切人／離開頁面会取消舊佇列與回呼。

快速學習：每天最多 15 個新字的中文、詞性、英文例句、例句翻譯、片語與搭配用法全部在同一頁展開；例句中的目標字使用加粗、放大的紅字。桌面三欄、小螢幕單欄，可捲動閱讀。朗讀與收藏保留。

閱讀完成後只做例句四選一，沿用原例句挖空，提供標準答案與三個拼字相近的真實單字（詞性相同時優先）。中文詞義提示用來限定題意；選項會排除相同字、明列可接受答案與完全相同中文詞義。自動選項仍須內容審核，無法保證語義相近詞在每個上下文都唯一。目標字以完整字界比對，支援大小寫、斜線變體及 acceptedAnswers；若題庫沒有可匹配的例句，清楚提示改用中文四選一，不編造例句。

答對直接下一題；答錯立即列入錯題練習，顯示原例句與正解，按一次重練直到答對才計入任務完成。保留首次答錯結果安排複習，不會因當下重練就標記熟練。移除熟悉度評分與每 10 題休息畫面。作答先保存於本機，再背景同步，切題不等待網路；未完成錯題可在同瀏覽器接續。首次閱讀仍顯示当天全部新字，測驗只考尚未完成項目。到期複習以相同方式接在新字後面；數量多時可能超過 20 分鐘，20 分鐘是學習目標而非硬性截止。Level 1 只供查閱。

## GitHub 與 GitHub Pages

1. 建立空 GitHub repository，把**本資料夾內容**放在 repository 根目錄（`index.html` 直接位於根目錄）。不要上傳 `node_modules`、工作用檔案或管理金鑰。
2. 用 Git commit／push 至 `main`。本交付未代替你建立 GitHub repository 或發佈公開網址。
3. Repository → Settings → Pages → Source 選 **GitHub Actions**。
4. `.github/workflows/pages.yml` 會跑核心測試，再只打包網站、範例與 vendor 目錄部署。
5. 正式網址為 `https://你的帳號.github.io/儲存庫名稱/`；所有網站資源都使用相對路徑。
6. Firebase Authorized domains 加入 Pages 網域。GitHub Pages 只部署靜態網站；Firebase 規則與索引請依前述獨立流程部署。

## 測試

不需安裝套件即可執行核心測試：

```sh
node --test tests/core.test.mjs tests/store.test.mjs tests/speech.test.mjs
```

Emulator 測試需要 Java 21 與開發套件：

```sh
npm install
npm run test:rules
```

只使用 `demo-english-vocabulary` 與本機 Firestore，不會寫入正式 Firebase。瀏覽器測試先啟動本機伺服器，再執行 `npm run test:browser`。預設需要 Playwright Chromium（`npx playwright install chromium`）；Windows 也可設定 `BROWSER_CHANNEL=msedge` 使用已安裝 Edge。管理頁及離線提交測試使用模擬後端，不能取代真正的 Firebase 規則測試。

實際執行結果、覆蓋範圍與仍需驗證項目見 `TEST-RESULTS.md`。

## 檔案與依賴

```text
index.html / migration_tool.html
css/style.css
js/config.js / firebase.js / store.js / outbox.js
js/core.js / app.js / speech.js / ui.js / admin.js / importer.js
vendor/firebase-11.6.1/* / xlsx-0.20.3.full.min.js
firestore.rules / firestore.indexes.json
firebase.json / firebase.production.example.json
examples/demo.json / six-words.csv / 欄位說明.md
tools/serve.mjs
tests/*
.github/workflows/pages.yml
```

Firebase Web SDK **11.6.1**（app/auth/firestore）取自 gstatic 官方發布，內部 app 模組 URL 改為同目錄相對路徑，版本一致。SheetJS CE **0.20.3** 取自 [官方獨立瀏覽器發布](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)，供 XLSX／CSV 讀取與空白範本輸出，已保留授權。無付費 API。依賴來源與雜湊見 `vendor/DEPENDENCIES.md`。

Firebase 設計依據：[交易與離線限制](https://firebase.google.com/docs/firestore/manage-data/transactions)、[離線快取](https://firebase.google.com/docs/firestore/manage-data/enable-offline)、[匿名登入](https://firebase.google.com/docs/auth/web/anonymous-auth)。
