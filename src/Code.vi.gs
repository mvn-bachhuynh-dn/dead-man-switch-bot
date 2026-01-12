  // ==========================================
  // CONFIGURATION VIA SCRIPT PROPERTIES OR SHEET
  // ==========================================
  // We will use Sheet for easier user editing
  const SHEET_CONFIG = "Config";
  const SHEET_BENEFICIARIES = "Beneficiaries";

  function getSheet() {
    const props = PropertiesService.getScriptProperties();
    let sheetId = props.getProperty("SHEET_ID");
    
    // 1. Try to open by ID if existing
    if (sheetId) {
      try {
        return SpreadsheetApp.openById(sheetId);
      } catch (e) {
        Logger.log("Invalid SHEET_ID in properties, trying active sheet...");
      }
    }

    // 2. Fallback: Try Active Spreadsheet (Bound Script)
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      if (ss) {
        // Save for future use (e.g. WebHook)
        props.setProperty("SHEET_ID", ss.getId());
        return ss;
      }
    } catch (e) {
      // Ignore
    }

    throw new Error("Could not find Spreadsheet. Please run 'Setup Sheet' from the menu first, or set SHEET_ID in Script Properties.");
  }

  function getConfig() {
    const ss = getSheet();
    const sh = ss.getSheetByName(SHEET_CONFIG);
    if (!sh) throw new Error(`Sheet '${SHEET_CONFIG}' not found.`);
    
    const data = sh.getDataRange().getValues();
    const config = {};
    for (let i = 1; i < data.length; i++) {
      config[data[i][0]] = data[i][1];
    }
    return config;
  }

  function setConfig(key, value) {
    const ss = getSheet();
    const sh = ss.getSheetByName(SHEET_CONFIG);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sh.getRange(i + 1, 2).setValue(value);
        return;
      }
    }
  }

  // ==========================================
  // CORE LOGIC
  // ==========================================

  // ==========================================
  // CORE LOGIC & HELPERS
  // ==========================================

  function mainJob() {
    const config = getConfig();
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDate();
    
    // Parse CHECK_TIME_HOUR (supports '9', '9h')
    const checkHourStr = String(config['CHECK_TIME_HOUR']).toLowerCase().replace('h', '').trim();
    const checkHour = Number(checkHourStr); // e.g., 9
    const checkDayStr = String(config['CHECK_DAY'] || "").trim();
    const checkDay = checkDayStr ? Number(checkDayStr) : null; // If empty, run daily
    const status = config['STATUS'];
    const telegramId = config['USER_CHAT_ID'];
    const botToken = config['TELEGRAM_BOT_TOKEN'];
    
    // TEST MODE LOGIC (Only affects start time check)
    const testMode = String(config['TEST_MODE']).toUpperCase() === 'TRUE';

    Logger.log(`Running mainJob. Status: ${status}, Day: ${currentDay}, Hour: ${currentHour}, TestMode: ${testMode}`);

    // 1. CHECK ALIVE TIME
    // Normal mode: Check hour AND (check day match OR no check day configured). Test mode: Always run if ALIVE.
    const isDayMatch = (checkDay === null) || (currentDay === checkDay);
    const isTimeToCheck = (isDayMatch && (currentHour === checkHour)) || testMode;
    
    if (isTimeToCheck && status === 'ALIVE') {
      // It's time to check!
      sendTelegram(botToken, telegramId, "🧟 Bạn còn sống không? Reply 'Alive' hoặc bấm nút bên dưới.", {
        inline_keyboard: [[{ text: "💪 I'm Alive", callback_data: "alive" }]]
      });
      setConfig('STATUS', 'PENDING');
      setConfig('LAST_PING', now);
      setConfig('RETRIES', 0); // Reset retries
      return;
    }

    // 2. CHECK TIMEOUT IF PENDING
    if (status === 'PENDING') {
      const lastPing = new Date(config['LAST_PING']);
      
      // Parse timeout to milliseconds
      const timeoutInput = config['TIMEOUT_HOURS']; // Can be '24', '9h', '30m'
      const timeoutMs = parseDurationToMs(timeoutInput);
      
      const maxRetries = Number(config['MAX_RETRIES']);
      const currentRetries = Number(config['RETRIES'] || 0);

      const diffMs = now - lastPing;
      
      Logger.log(`Checking timeout. Diff: ${(diffMs/60000).toFixed(1)}m. Timeout: ${(timeoutMs/60000).toFixed(1)}m`);

      if (diffMs >= timeoutMs) {
        // Timeout reached!
        if (currentRetries < maxRetries) {
          // Retry
          sendTelegram(botToken, telegramId, `⚠️ CẢNH BÁO: Không thấy bạn trả lời! Đây là lần nhắc số ${currentRetries + 1}/${maxRetries}. Bạn còn đó không?`);
          setConfig('RETRIES', currentRetries + 1);
          setConfig('LAST_PING', now); // Reset timer for next retry
        } else {
          // DEAD
          setConfig('STATUS', 'DEAD');
          sendTelegram(botToken, telegramId, "💀 Đã quá hạn phản hồi. Hệ thống kích hoạt chế độ thừa kế.");
          triggerLegacyProtocol();
        }
      }
    }
  }

  // Helper to parse duration strings like "9h", "30m", "1w", "2d" or "24" (default hours)
  function parseDurationToMs(input) {
    if (!input) return 24 * 60 * 60 * 1000; // Default 24h
    
    const str = String(input).trim().toLowerCase();
    
    // Regex to match "9.5", "30", "30m", "5h", "1d", "2w"
    const match = str.match(/^([\d\.]+)\s*([wdmh]?)$/);
    
    if (!match) {
      Logger.log(`Warning: Invalid duration format '${input}'. Defaulting to 24h.`);
      return 24 * 60 * 60 * 1000;
    }
    
    const val = Number(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'w': return val * 7 * 24 * 60 * 60 * 1000;
      case 'd': return val * 24 * 60 * 60 * 1000;
      case 'm': return val * 60 * 1000;
      case 'h': 
      default:  return val * 60 * 60 * 1000;
    }
  }

  function triggerLegacyProtocol() {
    const ss = getSheet();
    const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
    const data = sh.getDataRange().getValues();
    
    // Row 1 is header
    for (let i = 1; i < data.length; i++) {
      const email = data[i][0];
      const subject = data[i][1];
      const body = data[i][2];
      
      if (email && body) {
        try {
          MailApp.sendEmail({
            to: email,
            subject: subject,
            htmlBody: body.replace(/\n/g, '<br>')
          });
          Logger.log(`Sent email to ${email}`);
        } catch (e) {
          Logger.log(`Failed to send to ${email}: ${e}`);
        }
      }
    }
  }

  // ==========================================
  // STATE MANAGEMENT & HELPERS
  // ==========================================

  function setUserState(chatId, state, data = {}) {
    const cache = CacheService.getScriptCache();
    const value = JSON.stringify({ state: state, data: data });
    cache.put(chatId, value, 600); // 10 minutes expiry
  }

  function getUserState(chatId) {
    const cache = CacheService.getScriptCache();
    const value = cache.get(chatId);
    return value ? JSON.parse(value) : null;
  }

  function clearUserState(chatId) {
    CacheService.getScriptCache().remove(chatId);
  }

  function getBeneficiaries() {
    const ss = getSheet();
    const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
    if (sh.getLastRow() <= 1) return [];
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
    return data.map((row, index) => ({
      id: index + 1,
      row: index + 2, // Sheet row (1-based)
      email: row[0],
      subject: row[1],
      body: row[2]
    }));
  }

  function addBeneficiary(email, subject, body) {
    const ss = getSheet();
    const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
    sh.appendRow([email, subject, body]);
  }

  function deleteBeneficiary(row) {
    const ss = getSheet();
    const sh = ss.getSheetByName(SHEET_BENEFICIARIES);
    sh.deleteRow(row);
  }

  // ==========================================
  // TELEGRAM HANDLERS (UPDATED)
  // ==========================================

  function doPost(e) {
    try {
      const update = JSON.parse(e.postData.contents);
      const config = getConfig();
      const botToken = config['TELEGRAM_BOT_TOKEN'];
      const authorizedChatId = String(config['USER_CHAT_ID']).trim();

      // 1. Handle Callback Query (Buttons)
      if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = String(cb.message.chat.id);
        
        if (chatId !== authorizedChatId) return HtmlService.createHtmlOutput("OK");

        handleCallback(botToken, chatId, cb);
        return HtmlService.createHtmlOutput("OK");
      }
      
      // 2. Handle Message (Text)
      if (update.message) {
        const msg = update.message;
        const text = msg.text;
        const chatId = String(msg.chat.id);
        
        if (chatId !== authorizedChatId) return HtmlService.createHtmlOutput("OK");

        // Check state first
        const userState = getUserState(chatId);
        if (userState && text && !text.startsWith('/')) {
          handleInput(botToken, chatId, text, userState);
          return HtmlService.createHtmlOutput("OK");
        }

        // Handle Commands
        if (text) {
          handleCommand(botToken, chatId, text);
        }
      }
      return HtmlService.createHtmlOutput("OK");
    } catch(err) {
      Logger.log(err);
      return HtmlService.createHtmlOutput("Error");
    }
  }

  function handleCommand(token, chatId, text) {
    // Always confirm alive on interaction
    confirmAlive(chatId, token);
    clearUserState(chatId);

    if (text === '/start' || text === '/menu') {
      showMainMenu(token, chatId);
    } else {
      showMainMenu(token, chatId);
    }
  }

  function showMainMenu(token, chatId) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: "⚙️ Cấu hình Bot", callback_data: "menu_config" },
          { text: "👥 Người thụ hưởng", callback_data: "menu_ben" }
        ],
        [{ text: "❌ Thoát", callback_data: "close" }]
      ]
    };
    sendTelegram(token, chatId, "👋 Chào chủ nhân! Bạn muốn làm gì hôm nay?", keyboard);
  }

  function handleCallback(token, chatId, cb) {
    const data = cb.data;
    
    // Confirm alive on click
    confirmAlive(chatId, token);
    
    // Answer callback immediately to stop loading animation
    UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery?callback_query_id=${cb.id}`);

    if (data === "alive") {
      sendTelegram(token, chatId, "✅ Đã xác nhận bạn còn sống!");
      return;
    }
    
    if (data === "close") {
      // Delete the menu message (optional, or just ignore)
      return; 
    }

    // --- CONFIG MENU ---
    if (data === "menu_config") {
      showConfigMenu(token, chatId);
      return;
    }
    if (data.startsWith("cfg_edit_")) {
      const field = data.replace("cfg_edit_", "");
      
      // Toggle Test Mode immediately
      if (field === "TEST_MODE") {
        const current = getConfig()['TEST_MODE'];
        const newVal = (String(current).toUpperCase() === 'TRUE') ? 'FALSE' : 'TRUE';
        setConfig('TEST_MODE', newVal);
        sendTelegram(token, chatId, `Đã chuyển Test Mode thành: ${newVal}`);
        showConfigMenu(token, chatId);
        return;
      }

      // For others, ask input
      setUserState(chatId, "WAITING_CONFIG_VALUE", { field: field });
      let prompt = `Nhập giá trị mới cho ${field}:`;
      if (field === "CHECK_DAY") prompt += "\n(1-31, hoặc gửi '0' để xóa)";
      if (field === "TIMEOUT_HOURS") prompt += "\n(VD: 24h, 30m, 1w)";
      sendTelegram(token, chatId, prompt);
      return;
    }

    // --- BENEFICIARY MENU ---
    if (data === "menu_ben") {
      showBeneficiaryMenu(token, chatId);
      return;
    }
    if (data === "ben_add") {
      setUserState(chatId, "WAITING_BEN_EMAIL");
      sendTelegram(token, chatId, "📧 Nhập EMAIL người thụ hưởng:");
      return;
    }
    if (data.startsWith("ben_del_")) {
      const row = Number(data.replace("ben_del_", ""));
      deleteBeneficiary(row);
      sendTelegram(token, chatId, "🗑️ Đã xóa người thụ hưởng.");
      showBeneficiaryMenu(token, chatId);
      return;
    }
  }

  function handleInput(token, chatId, text, userState) {
    const state = userState.state;
    const data = userState.data;

    // --- CONFIG INPUT ---
    if (state === "WAITING_CONFIG_VALUE") {
      const field = data.field;
      let val = text.trim();
      if (field === "CHECK_DAY" && val === '0') val = "";
      
      setConfig(field, val);
      sendTelegram(token, chatId, `✅ Đã cập nhật ${field} = ${val}`);
      clearUserState(chatId);
      showConfigMenu(token, chatId);
      return;
    }

    // --- ADD BEN FLOW ---
    if (state === "WAITING_BEN_EMAIL") {
      // Save email, move to next
      setUserState(chatId, "WAITING_BEN_SUBJECT", { email: text });
      sendTelegram(token, chatId, "📝 Nhập TIÊU ĐỀ email:");
      return;
    }
    if (state === "WAITING_BEN_SUBJECT") {
      // Save subject, move to next
      const context = data;
      context.subject = text;
      setUserState(chatId, "WAITING_BEN_BODY", context);
      sendTelegram(token, chatId, "💬 Nhập NỘI DUNG lời nhắn:");
      return;
    }
    if (state === "WAITING_BEN_BODY") {
      const context = data;
      const body = text;
      addBeneficiary(context.email, context.subject, body);
      sendTelegram(token, chatId, `✅ Đã thêm người thụ hưởng:\n${context.email}`);
      clearUserState(chatId);
      showBeneficiaryMenu(token, chatId);
      return;
    }
  }

  function showConfigMenu(token, chatId) {
    const config = getConfig();
    const msg = [
      "<b>⚙️ CẤU HÌNH HIỆN TẠI:</b>",
      `1. Timeout: ${config['TIMEOUT_HOURS']}`,
      `2. Check Hour: ${config['CHECK_TIME_HOUR']}`,
      `3. Check Day: ${config['CHECK_DAY'] || 'Hàng ngày'}`,
      `4. Max Retries: ${config['MAX_RETRIES']}`,
      `5. Test Mode: ${config['TEST_MODE']}`
    ].join("\n");

    const keyboard = {
      inline_keyboard: [
        [
          { text: "⏳ Sửa Timeout", callback_data: "cfg_edit_TIMEOUT_HOURS" },
          { text: "🕒 Sửa Giờ Check", callback_data: "cfg_edit_CHECK_TIME_HOUR" }
        ],
        [
          { text: "📅 Sửa Ngày Check", callback_data: "cfg_edit_CHECK_DAY" },
          { text: "🔄 Sửa Retries", callback_data: "cfg_edit_MAX_RETRIES" }
        ],
        [
          { text: "🧪 Bật/Tắt Test Mode", callback_data: "cfg_edit_TEST_MODE" }
        ],
        [{ text: "🔙 Quay lại", callback_data: "menu" }]
      ]
    };
    sendTelegram(token, chatId, msg, keyboard);
  }

  function showBeneficiaryMenu(token, chatId) {
    const list = getBeneficiaries();
    let msg = "<b>👥 DANH SÁCH NGƯỜI THỤ HƯỞNG:</b>\n\n";
    
    if (list.length === 0) {
      msg += "(Trống)";
    } else {
      list.forEach(b => {
        msg += `#${b.id}: <b>${b.email}</b>\nTiêu đề: ${b.subject}\n------------------\n`;
      });
    }

    // Create delete buttons for each item
    const deleteButtons = list.map(b => {
      return { text: `🗑️ Xóa #${b.id}`, callback_data: `ben_del_${b.row}` };
    });
    
    // Chunk buttons (2 per row)
    const keyboardRows = [];
    keyboardRows.push([{ text: "➕ Thêm mới", callback_data: "ben_add" }]);
    
    for (let i = 0; i < deleteButtons.length; i += 2) {
      keyboardRows.push(deleteButtons.slice(i, i + 2));
    }
    
    keyboardRows.push([{ text: "🔙 Quay lại", callback_data: "menu" }]);

    sendTelegram(token, chatId, msg, { inline_keyboard: keyboardRows });
  }

  function confirmAlive(chatId, botToken) {
    // Only update status if it was pending or we want to be sure
    // But strictly, we update status to ALIVE
    const config = getConfig();
    if (config['STATUS'] !== 'ALIVE') {
      setConfig('STATUS', 'ALIVE');
      setConfig('LAST_PING', ""); 
      setConfig('RETRIES', 0);
    }
  }

  function sendTelegram(token, chatId, text, markup = null) {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    if (markup) payload.reply_markup = markup;
    
    try {
      UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload)
      });
    } catch (e) {
      Logger.log("Telegram Error: " + e);
    }
  }

  // ==========================================
  // MENU & SETUP
  // ==========================================

  function onOpen() {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('Dead Man Bot')
        .addItem('Setup Sheet', 'setupSheet')
        .addToUi();
  }

  function setupSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log("Please run this bound to a spreadsheet.");
      return;
    }
    
    // Set ID for script to use later if needed, though active sheet is enough for bound scripts
    PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
    
    // 1. CONFIG SHEET
    let shConfig = ss.getSheetByName(SHEET_CONFIG);
    if (!shConfig) {
      shConfig = ss.insertSheet(SHEET_CONFIG);
      // Header
      const headerRange = shConfig.getRange(1, 1, 1, 2);
      headerRange.setValues([["Key", "Value"]]);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#efefef");
      shConfig.setFrozenRows(1);
      
      // Default Values
      const defaults = [
        ["TELEGRAM_BOT_TOKEN", ""],
        ["USER_CHAT_ID", ""],
        ["CHECK_DAY", "1"],
        ["CHECK_TIME_HOUR", "9"],
        ["TIMEOUT_HOURS", "24"],
        ["MAX_RETRIES", "3"],
        ["STATUS", "ALIVE"],
        ["TEST_MODE", "FALSE"],
        ['DEBUG_MODE', 'FALSE'],
        ["LAST_PING", ""],
        ["RETRIES", "0"]
      ];
      shConfig.getRange(2, 1, defaults.length, 2).setValues(defaults);
      
      // Auto-resize
      shConfig.autoResizeColumns(1, 2);
      ss.toast("Created Config sheet", "Setup");
    } else {
      // Sheet exists, check if empty or needs repair
      if (shConfig.getLastRow() <= 1) {
        // Repair: File Default Values
        const defaults = [
          ["TELEGRAM_BOT_TOKEN", ""],
          ["USER_CHAT_ID", ""],
          ["CHECK_DAY", "1"],
          ["CHECK_TIME_HOUR", "9"],
          ["TIMEOUT_HOURS", "24"],
          ["MAX_RETRIES", "3"],
          ["STATUS", "ALIVE"],
          ["TEST_MODE", "FALSE"],
          ['DEBUG_MODE', 'FALSE'],
          ["LAST_PING", ""],
          ["RETRIES", "0"]
        ];
        shConfig.getRange(2, 1, defaults.length, 2).setValues(defaults);
        ss.toast("Repaired empty Config sheet", "Setup");
      } else {
        ss.toast("Config sheet already exists.", "Setup");
      }
    }
    
    // 2. BENEFICIARIES SHEET
    let shBen = ss.getSheetByName(SHEET_BENEFICIARIES);
    if (!shBen) {
      shBen = ss.insertSheet(SHEET_BENEFICIARIES);
      // Header
      const headerRange = shBen.getRange(1, 1, 1, 3);
      headerRange.setValues([["Email", "Subject", "Content"]]);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#efefef");
      shBen.setFrozenRows(1);
      
      // Example Row
      shBen.appendRow(["example@email.com", "Important Info", "Here is my secret..."]);
      
      // Auto-resize
      shBen.autoResizeColumns(1, 3);
    }
    
    // 3. CLEANUP
    // Remove default "Sheet1" if it exists and is empty/default
    const sheet1 = ss.getSheetByName("Sheet1");
    if (sheet1 && ss.getSheets().length > 1) {
      try {
        ss.deleteSheet(sheet1);
      } catch(e) {
        // Ignore if can't delete
      }
    }

    ss.toast("Setup complete! Please fill in your Config sheet.", "Dead Man Bot");
  }

  function doGet(e) {
    return serveWebApp(e);
  }

  function serveWebApp(e) {
    const template = HtmlService.createTemplateFromFile('webapp');
    
    // Vietnamese Labels
    const labels = {
      tab_config: "Cấu hình",
      tab_ben: "Người thụ hưởng",
      timeout: "Thời gian chờ (VD: 24, 9h, 30m, 1w)",
      check_hour: "Giờ kiểm tra (0-23)",
      check_day: "Ngày kiểm tra (1-31, trống là hàng ngày)",
      max_retries: "Số lần nhắc lại tối đa",
      test_mode: "Chế độ Test",
      btn_add: "+ Thêm người thụ hưởng",
      modal_title: "Thêm người nhận",
      subject: "Tiêu đề Email",
      message: "Nội dung lời nhắn",
      btn_cancel: "Hủy",
      btn_save: "Lưu",
      save_config: "LƯU CẤU HÌNH",
      save_success: "Đã lưu cấu hình thành công!",
      empty_list: "Danh sách trống",
      btn_delete: "Xóa",
      confirm_delete: "Bạn có chắc chắn muốn xóa không?",
      validation_error: "Vui lòng nhập đầy đủ thông tin!"
    };
    
    template.labels = labels;
    template.configData = getConfig();
    
    return template.evaluate()
        .setTitle("Dead Man Switch Bot")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // API Handler for Web App
  function doPostApi(data) {
    Logger.log("API Call: " + JSON.stringify(data));
    const config = getConfig(); // This tests sheet access
    
    if (data.action === 'saveConfig') {
      if (data.TIMEOUT_HOURS) setConfig('TIMEOUT_HOURS', data.TIMEOUT_HOURS);
      // Use checks to ensure we don't overwrite with undefined if logic changes
      if (data.CHECK_TIME_HOUR !== undefined) setConfig('CHECK_TIME_HOUR', data.CHECK_TIME_HOUR);
      if (data.CHECK_DAY !== undefined) setConfig('CHECK_DAY', data.CHECK_DAY);
      if (data.MAX_RETRIES) setConfig('MAX_RETRIES', data.MAX_RETRIES);
      if (data.TEST_MODE) setConfig('TEST_MODE', data.TEST_MODE);
      if (data.DEBUG_MODE) setConfig('DEBUG_MODE', data.DEBUG_MODE);
      return "Success";
    }
    
    if (data.action === 'getBeneficiaries') {
      return getBeneficiaries();
    }
    
    if (data.action === 'addBeneficiary') {
      addBeneficiary(data.email, data.subject, data.body);
      return "Success";
    }
    
    if (data.action === 'deleteBeneficiary') {
      deleteBeneficiary(Number(data.row)); // Ensure number
      return "Success";
    }
  }

  function setWebhook() {
    // Run this function manually after deployment
    const config = getConfig();
    const token = config['TELEGRAM_BOT_TOKEN'];
    // replace with your web app url
    const url = "YOUR_WEB_APP_URL_HERE"; 
    
    const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${url}`);
    Logger.log("Webhook: " + response.getContentText());
    
    setBotCommands(token, url);
  }

  function setBotCommands(token, webAppUrl) {
    // 1. Set Commands
    const commands = [
      { command: "menu", description: "Bảng điều khiển chính" },
      { command: "help", description: "Hướng dẫn sử dụng" },
      { command: "start", description: "Khởi động bot" }
    ];
    
    UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ commands: commands })
    });
    
    // 2. Set Chat Menu Button (To open Web App)
    // Only if HTTPS url is provided
    if (webAppUrl && webAppUrl.startsWith("https")) {
       const menuPayload = {
         menu_button: {
           type: "web_app",
           text: "Cấu hình Bot",
           web_app: { url: webAppUrl }
         }
       };
       UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(menuPayload)
       });
       Logger.log("Menu Button Set to Web App");
    }
  }

// Helper to generate human-readable config explanation
function getConfigExplanation(config) {
  const timeout = config.TIMEOUT_HOURS;
  const hour = config.CHECK_TIME_HOUR;
  const day = config.CHECK_DAY;
  const retries = config.MAX_RETRIES;
  const testMode = config.TEST_MODE;
  
  const isMinutes = String(timeout).toLowerCase().endsWith('m');
  const isTest = (testMode === 'TRUE');

  if (isTest) {
      let msg = `⚠️ CHE DO TEST DANG BAT\n`;
      msg += `Bot se kiem tra lien tuc (can Trigger moi phut).\n`;
      
      if (!isMinutes) {
          msg += `⚠️ Luu y: Ban dang de Timeout la ${timeout} (Gio). Trong che do Test, nen dung don vi phut (vi du: 5m) de kiem tra nhanh hon.\n`;
      } else {
          msg += `Timeout: ${timeout} (Phut) - On.\n`;
      }
      
      msg += `-> Neu ban khong phan hoi sau ${retries} lan nhac (cach nhau ${timeout}), bot se gui bao dong.\n`;
      msg += `Yeu cau quan trong:\n`;
      msg += `1. Cai dat Trigger tren Apps Script la: Moi phut (Every Minute).\n`;
      msg += `2. Xoa sach danh sach nguoi thu huong that.`;
      return msg;
  }
  
  // Normal Mode
  let msg = "";
  if (day && String(day).trim() !== "") {
      msg += `📅 Lich trinh: Kiem tra vao ngay ${day} hang thang, luc ${hour}h.\n`;
  } else {
      msg += `📅 Lich trinh: Kiem tra hang ngay, luc ${hour}h.\n`;
  }
  
  if (isMinutes) {
      msg += `⚠️ Canh bao: Ban dang de Timeout la ${timeout} (Phut). O che do thuong (Trigger moi gio), don vi phut co the khong chinh xac. Nen de theo gio (VD: 24, 48).\n`;
  }
  
  msg += `🔔 Quy trinh: Neu khong thay ban online, bot se nhac ${retries} lan (cach nhau ${timeout}).\n`;
  msg += `✅ Yeu cau: Cai dat Trigger tren Apps Script la: Moi gio (Every Hour).\n`;
  msg += `Hay kiem tra ky thong tin nguoi thu huong.`;
  
  return msg;
}
