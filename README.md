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

1. Authentication → Sign-in method：啟用 **Anonymous** 與 **Google**。
2. Authentication → Settings → Authorized domains：加入本機 `localhost`／測試需要的網域，以及 GitHub Pages 的 `你的帳號.github.io`。只填網域，不含儲存庫路徑。
3. 確認已建立 Cloud Firestore，選用合適區域與正式模式。
4. **先備份現有 Firestore 規則及索引。** 專案中 `firestore.rules` 是英文系統的完整隔離測試規則；直接覆蓋共用 Firebase 的規則會使未列出的舊應用失去存取權。正式環境應將英文 match 區塊及相關 functions 合併到既有規則，保留原應用的明確規則。
5. 檢查既有規則是否有寬鬆的 `/{document=**}` 授權；Firestore 以符合規則的 **OR** 決定權限，不能靠新增拒絕規則抵消舊的廣泛允許。舊授權必須限制到其原本 namespace，避免覆蓋英文隔離。
6. 將合併後檔案存為 `firestore.merged.rules`、`firestore.merged.indexes.json`，並保留其他應用現有索引。複製 `firebase.production.example.json` 為 `firebase.production.json`，確認後執行：

```sh
firebase deploy --config firebase.production.json --only firestore --project chinese-learning-47f4d
```

預設 `firebase.json` 供本機 Emulator 驗證；不要直接用它覆蓋共用專案的正式權限。

索引涵蓋題庫的 `level + sequence` 查詢；學習事件依 `createdAt` 以單欄索引分頁讀取。大型快照與原始來源已設定索引排除。此版本沒有 Storage 音檔與付費 AI／語音服務。

## 開通管理員

1. 先開啟管理頁並用指定 Google 帳號登入一次。尚未授權時會顯示權限不足並登出；帳號 UID 可從 Firebase Console → Authentication 取得。
2. 在可信任的電腦／伺服器建立獨立管理工具目錄，安裝 `firebase-admin@13.2.0`，將 `tools/grant-admin.mjs` 放到該目錄。
3. 以 Application Default Credentials 或 `GOOGLE_APPLICATION_CREDENTIALS` 指向**儲存庫之外**的服務帳號金鑰；不可上傳 GitHub、不可放入網頁。
4. 執行 `node grant-admin.mjs GOOGLE_USER_UID`。腳本保留既有 claims，加入 `admin: true`。
5. 重新登入管理頁。Firebase Auth 使用獨立命名 app 與 session persistence，不取代學習頁的匿名帳號。

管理員能新增／編輯／停用題庫、發布不可變課程；一般學習者不能直接以 SDK 改題庫。永久刪除在 UI 與規則層都禁止，因此不會破壞歷史引用。

## 匯入真正題庫與開始學習

1. 管理頁可下載六工作表的空白 Excel。工作表名稱為 `level1`～`level6`，忽略大小寫及前後空白。
2. 上傳 `.xlsx`、UTF-8 `.csv`、`.json` 或貼上 JSON 陣列。
3. 選擇工作表、等級與欄位對應。名稱無法辨識時必須手選，不會自動猜等級。
4. 驗證涵蓋所有列；預覽顯示前 100 列，錯誤列出工作表、列號、欄位與原因。修正錯誤後重讀檔案。
5. 選擇略過既有／更新既有／僅新增，確認後每 100 筆交易寫入。失敗項目可下載再重試。
6. 相同 `Level + 序號` 產生穩定 ID。首次來源保留於 `originalSource`；後续修訂在主要欄位中維護。不同 Level 的同字不合併。已有單字的 Level 與序號不可改，若來源重排必須保留 ID，不可把另一個字覆寫到已存在序號。
7. 匯入、審核後按 **發布固定題庫版本**。這一步才會建立 Level 2～6 的課程快照；單純新增字詞不會悄悄改變課程。
8. **發布後再建立學習者**，即可從當天取得第一組新字。若學習者是在尚無版本時建立，其設定顯示 `none`；請保留其舊紀錄並新建學習者來開始課程。

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

五種練習包含英文選中文、中文選英文、例句填空、拼字、自行回想。拼字只忽略大小寫和兩端空白，其他可接受答案須在 `acceptedAnswers` 明確列出。例句沒有原詞形時，填空改為中文提示拼字。選項不足時提示改用拼字或回想，不編造干擾答案；正式詞義與選項的語義品質仍需教師審核。

收藏中的 Level 1 永遠只能查閱。每次練習先看過內容，再開始回想／測驗；客觀答錯不能直接標記記得。每 10 題可休息，未完成的正式任務會保留。

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
tools/serve.mjs / grant-admin.mjs
tests/*
.github/workflows/pages.yml
```

Firebase Web SDK **11.6.1**（app/auth/firestore）取自 gstatic 官方發布，內部 app 模組 URL 改為同目錄相對路徑，版本一致。SheetJS CE **0.20.3** 取自 [官方獨立瀏覽器發布](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)，供 XLSX／CSV 讀取與空白範本輸出，已保留授權。無付費 API。依賴來源與雜湊見 `vendor/DEPENDENCIES.md`。

Firebase 設計依據：[交易與離線限制](https://firebase.google.com/docs/firestore/manage-data/transactions)、[離線快取](https://firebase.google.com/docs/firestore/manage-data/enable-offline)、[匿名登入](https://firebase.google.com/docs/auth/web/anonymous-auth)。
