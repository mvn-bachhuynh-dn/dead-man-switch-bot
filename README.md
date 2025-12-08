# Dead Man Switch Bot - Setup Guide

This system ensures your legacy information is delivered to your beneficiaries if you stop responding to the bot.

## 1. Telegram Bot Setup
1.  Chat with **@BotFather** on Telegram.
2.  Send `/newbot` and follow instructions to get your **Bot Token**.
3.  Search for your new bot and click **Start**.
4.  Get your **Chat ID** (you can use @userinfobot or look at logs later).

## 2. Google Sheet Setup
1.  Create a new Google Sheet.
2.  **Sheet 1 Name**: `Config`
    *   A1: `Key` | B1: `Value`
    *   A2: `TELEGRAM_BOT_TOKEN` | B2: *Paste Token Here*
    *   A3: `USER_CHAT_ID` | B3: *Paste Chat ID Here*
    *   A4: `CHECK_TIME_HOUR` | B4: `9` (9 AM)
    *   A5: `TIMEOUT_HOURS` | B5: `24` (Wait 24h for reply)
    *   A6: `MAX_RETRIES` | B6: `3` (Retry 3 times before declaring dead)
    *   A7: `STATUS` | B7: `ALIVE` (Don't touch)
    *   A8: `LAST_PING` | B8: (Leave empty)
3.  **Sheet 2 Name**: `Beneficiaries`
    *   A1: `Email` | B1: `Subject` | C1: `Content`
    *   A2: `wife@example.com` | `Secret Bank Info` | `My password is...`

## 3. Deploy Script
1.  Open **Extensions > Apps Script**.
2.  Copy the code from `src/Code.gs` in this folder into the script editor.
3.  **Run** the `setup()` function once to initialize permissions.
4.  **Deploy > New Deployment** > Select **Web App**.
    *   Execute as: **Me**.
    *   Who has access: **Anyone**.
5.  Copy the **Web App URL**.
6.  Run the `setWebhook()` function (replace `YOUR_WEB_APP_URL` in the code temporarily or via prompt if you know how, simpler: hardcode it just for setup).

## 4. Automation
1.  In Apps Script, click **Triggers** (Alarm clock icon).
2.  Add Trigger:
    *   Function: `mainJob`
    *   Event Source: **Time-driven**
    *   Type: **Hour timer** -> **Every hour**.

## 5. Usage
*   The bot will check every hour.
*   If `Current Hour == CHECK_TIME_HOUR`, it sends "Bạn còn sống không? 🧟".
*   You reply "Alive" or click the button.
*   If you don't reply after `TIMEOUT_HOURS` * `MAX_RETRIES`, emails are sent.
