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

function mainJob() {
  const config = getConfig();
  const now = new Date();
  const currentHour = now.getHours();
  
  // Parse CHECK_TIME_HOUR (supports '9', '9h')
  const checkHourStr = String(config['CHECK_TIME_HOUR']).toLowerCase().replace('h', '').trim();
  const checkHour = Number(checkHourStr); // e.g., 9
  const status = config['STATUS'];
  const telegramId = config['USER_CHAT_ID'];
  const botToken = config['TELEGRAM_BOT_TOKEN'];
  
  // TEST MODE LOGIC (Only affects start time check)
  const testMode = String(config['TEST_MODE']).toUpperCase() === 'TRUE';

  Logger.log(`Running mainJob. Status: ${status}, Hour: ${currentHour}, TestMode: ${testMode}`);

  // 1. CHECK ALIVE TIME
  // Normal mode: Check hour. Test mode: Always run if ALIVE.
  const isTimeToCheck = (currentHour === checkHour) || testMode;
  
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

// Helper to parse duration strings like "9h", "30m", or "24" (default hours)
function parseDurationToMs(input) {
  if (!input) return 24 * 60 * 60 * 1000; // Default 24h
  const str = String(input).trim().toLowerCase();
  
  if (str.endsWith('m')) {
    return Number(str.replace('m', '')) * 60 * 1000;
  }
  if (str.endsWith('h')) {
    return Number(str.replace('h', '')) * 60 * 60 * 1000;
  }
  
  // Default to hours if just a number
  const val = Number(str);
  if (!isNaN(val)) {
    return val * 60 * 60 * 1000; 
  }
  
  return 24 * 60 * 60 * 1000; // Fallback
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
// TELEGRAM HANDLERS
// ==========================================

function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    const config = getConfig();
    const botToken = config['TELEGRAM_BOT_TOKEN'];
    
    // Handle Callback Query (Button click)
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data;
      const chatId = cb.message.chat.id;
      
      if (data === 'alive') {
        confirmAlive(chatId, botToken);
        // Answer callback to remove loading state on button
        UrlFetchApp.fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery?callback_query_id=${cb.id}`);
      }
      return HtmlService.createHtmlOutput("OK");
    }
    
    // Handle Message
    if (update.message) {
      const msg = update.message;
      const text = msg.text;
      const chatId = msg.chat.id;
      
      // Simple logic: Any message from user confirms they are alive
      if (text) {
         confirmAlive(chatId, botToken);
      }
    }
    return HtmlService.createHtmlOutput("OK");
  } catch(err) {
    Logger.log(err);
    return HtmlService.createHtmlOutput("Error");
  }
}

function confirmAlive(chatId, botToken) {
  setConfig('STATUS', 'ALIVE');
  setConfig('LAST_PING', ""); // Clear ping time
  setConfig('RETRIES', 0);
  sendTelegram(botToken, chatId, "✅ Đã xác nhận bạn còn sống! Hẹn gặp lại vào lần check tới. Chúc một ngày tốt lành!");
}

function sendTelegram(token, chatId, text, markup = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (markup) payload.reply_markup = markup;
  
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });
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
    shConfig.getRange(2, 1, 8, 2).setValues([
      ["TELEGRAM_BOT_TOKEN", ""],
      ["USER_CHAT_ID", ""],
      ["CHECK_TIME_HOUR", "9"],
      ["TIMEOUT_HOURS", "24"],
      ["MAX_RETRIES", "3"],
      ["STATUS", "ALIVE"],
      ["TEST_MODE", "FALSE"],
      ["LAST_PING", ""],
      ["RETRIES", "0"]
    ]);
    
    // Auto-resize
    shConfig.autoResizeColumns(1, 2);
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

function setWebhook() {
  // Run this function manually after deployment
  const config = getConfig();
  const token = config['TELEGRAM_BOT_TOKEN'];
  // replace with your web app url
  const url = "YOUR_WEB_APP_URL_HERE"; 
  
  const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${url}`);
  Logger.log(response.getContentText());
}
