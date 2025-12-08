// ==========================================
// CONFIGURATION VIA SCRIPT PROPERTIES OR SHEET
// ==========================================
// We will use Sheet for easier user editing
const SHEET_CONFIG = "Config";
const SHEET_BENEFICIARIES = "Beneficiaries";

function getSheet() {
  // Assumes script is bound to sheet or we put Sheet ID here. 
  // For 'Vibe coding', let's assume User pastes this into a Sheet-bound script or puts ID here.
  // Better: Standalone script that creates its own sheet if missing? 
  // No, user instructions say "1 google sheet". 
  // Let's assume this script is attached to the Sheet ID defined below or Active.
  // We'll require user to put Sheet ID in Property or hardcode.
  
  // PROMPT FOR USER: PLEASE ENTER YOUR SHEET ID HERE
  const SHEET_ID = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!SHEET_ID) throw new Error("Please set SHEET_ID in Script Properties or hardcode it.");
  return SpreadsheetApp.openById(SHEET_ID);
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
  
  const checkHour = Number(config['CHECK_TIME_HOUR']); // e.g., 9
  const status = config['STATUS'];
  const telegramId = config['USER_CHAT_ID'];
  const botToken = config['TELEGRAM_BOT_TOKEN'];

  Logger.log(`Running mainJob. Status: ${status}, Hour: ${currentHour}`);

  // 1. CHECK ALIVE TIME
  if (currentHour === checkHour && status === 'ALIVE') {
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
    const timeoutHours = Number(config['TIMEOUT_HOURS']);
    const maxRetries = Number(config['MAX_RETRIES']);
    const currentRetries = Number(config['RETRIES'] || 0);

    const diffMs = now - lastPing;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours >= timeoutHours) {
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
// SETUP HELPERS
// ==========================================
function setup() {
  // Helper to create sheets if they don't exist
  // Requires ACTIVE spreadsheet or ID
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("Please run this bound to a spreadsheet or set SHEET_ID.");
    return;
  }
  
  // Set ID for script to use later
  PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
  
  let shConfig = ss.getSheetByName(SHEET_CONFIG);
  if (!shConfig) {
    shConfig = ss.insertSheet(SHEET_CONFIG);
    shConfig.appendRow(["Key", "Value"]);
    shConfig.appendRow(["TELEGRAM_BOT_TOKEN", ""]);
    shConfig.appendRow(["USER_CHAT_ID", ""]);
    shConfig.appendRow(["CHECK_TIME_HOUR", "9"]);
    shConfig.appendRow(["TIMEOUT_HOURS", "24"]);
    shConfig.appendRow(["MAX_RETRIES", "3"]);
    shConfig.appendRow(["STATUS", "ALIVE"]);
    shConfig.appendRow(["LAST_PING", ""]);
    shConfig.appendRow(["RETRIES", "0"]);
  }
  
  let shBen = ss.getSheetByName(SHEET_BENEFICIARIES);
  if (!shBen) {
    shBen = ss.insertSheet(SHEET_BENEFICIARIES);
    shBen.appendRow(["Email", "Subject", "Content"]);
  }
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
