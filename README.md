# Dead Man Switch Bot - Setup Guide

[🇻🇳 Vietnamese Version](README.vi.md)

> **About Dead Man Switch Bot**
>
> Life is unpredictable. The Dead Man Switch Bot is built with a singular purpose: **to ensure that your final messages and critical information (accounts, passwords, emergency funds...) are safely delivered to your trusted beneficiaries if you become unresponsive.**
>
> **Why use this Bot instead of a third-party service?**
> *   **100% Privacy & Security**: This is a **Do-It-Yourself (Self-hosted)** solution. You are the sole owner of the source code, data, and Google Sheet. No third party (including the author) has access to your sensitive information.
> *   **Zero Trust Required**: Your data resides entirely within your own Google account. There are no intermediary servers, eliminating the risk of data breaches from service providers.
> *   **Free Forever**: Leveraging Google's free infrastructure (Apps Script, Sheets) and Telegram, there are no maintenance costs.
>
> Take 15 minutes to set this up. It might be the most important 15 minutes you spend to secure the future for your loved ones.

This system ensures your legacy information is delivered to your beneficiaries if you stop responding to the bot.

## 1. Telegram Bot Setup
1.  Chat with **@BotFather** on Telegram.
    <p align="center">
      <img src="images/telegram_search_botfather.png" width="50%">
    </p>
2.  Send `/newbot` and follow instructions to get your **Bot Token**. (Save this token to use in the next step. Keep it safe and do not share it with anyone.)
    <p align="center">
      <img src="images/telegram_newbot_token.png" width="50%">
    </p>
3.  Search for your new bot and click **Start**.
    <p align="center">
      <img src="images/telegram_start_bot.png" width="50%">
    </p>


4.  Get your **Chat ID** (you can use @userinfobot or look at logs later).

    <p align="center">
      <img src="images/telegram_userinfobot.png" width="50%">
    </p>

## 2. Google Sheet Setup
1.  Create a new, empty Google Sheet.
2.  The script will automatically create the necessary sheets and columns for you in the next step.

    <p align="center">
      <img src="images/create_new_sheet.jpeg" width="50%">
    </p>

## 3. Deploy Script
1.  Open **Extensions > Apps Script**.
2.  Copy the code from `src/Code.en.gs` in this folder into the script editor.
3.  **Run Setup**:
    *   Reload your Google Sheet.
    *   You should see a new menu **"Dead Man Bot"** appear in the toolbar (after a few seconds).
    *   Click **Dead Man Bot > Setup Sheet**.
    *   The script will automatically create the "Config" and "Beneficiaries" sheets and formatting for you.
    
    <p align="center">
      <img src="images/sheet_menu.png" width="50%">
    </p>

    *   Configure the necessary parameters in the "Config" sheet. From the steps already completed. (refer to the step 5)

    <p align="center">
      <img src="images/config_sheet_init.png" width="50%">
    </p>

4.  **Deploy > New Deployment** > Select **Web App**.
    *   Execute as: **Me**.
    *   Who has access: **Anyone**.
    
    <p align="center">
      <img src="images/deploy_webapp.jpeg" width="50%">
    </p>

5.  Copy the **Web App URL**.
6.  Run the `setWebhook()` function (replace `YOUR_WEB_APP_URL` in the code temporarily or via prompt if you know how, simpler: hardcode it just for setup).

    <p align="center">
      <img src="images/run_setwebhook.png" width="50%">
    </p>

## 4. Trigger Setup (Mandatory)
For the bot to run automatically, you must set up a Trigger as follows:

1.  In Apps Script, click **Triggers** (Alarm clock icon on the left).
2.  Click **+ Add Trigger** (bottom right).
3.  Configure as follows:
    *   Choose which function to run: `mainJob`
    *   Select event source: **Time-driven**
    *   Select type of time based trigger: **Hour timer**
    *   Select hour interval: **Every hour**
4.  Click **Save**.

<p align="center">
  <img src="images/trigger_setup.jpeg" width="50%">
</p>

> [!NOTE]
> You must select **Every hour** even if you configure a monthly check. The script will automatically check if today is the scheduled day. If you choose a differnet timer, the bot may not run at your configured hour.

### Trigger Optimization (Advanced)
If you are using **Monthly/Weekly Checks** (long timeouts) and want to save script execution quota, you can choose:
*   Select type of time based trigger: **Day timer**
*   Select time of day: **9am to 10am** (Or the time matching your `CHECK_TIME_HOUR`)

**Note:** This only works if your `TIMEOUT_HOURS` is in Days (d) or Weeks (w). If you start using short timeouts (e.g., 30m), this setting will cause delayed notifications.

## 5. Usage & Configuration
In the "Config" Sheet, you can customize:

| Key | Description |
| :--- | :--- |
| **TELEGRAM_BOT_TOKEN** | Get from step 1.2 |
| **USER_CHAT_ID** | Get from step 1.4 |
| **CHECK_DAY** | Day of the month to check (1-31). Leave empty to check daily. |
| **CHECK_TIME_HOUR** | Check time hour (0-23) |
| **TIMEOUT_HOURS** | Time to wait for a response (e.g., 24, 9h, 30m, 1w) |
| **MAX_RETRIES** | Max reminders before sending email |
| **STATUS** | (Automatic) Current status (ALIVE/PENDING/DEAD) |
| **TEST_MODE** | Test mode (TRUE/FALSE) |
| **LAST_PING** | (Automatic) Last check time |
| **RETRIES** | (Automatic) Current retry count |

If configured as shown below, I want the bot to send a monthly check-in message on the 12th of each month at around 9:00 AM. If there is no response, the bot should send up to three reminders, each 24 hours apart. If there is still no response after that, the bot should send a notification email.
<p align="center">
  <img src="images/config_sheet_demo.png" width="50%">
</p>

### Configuration Examples

#### 1. Monthly Check, Weekly Reminder
*   **CHECK_DAY**: `1` (Check on the 1st of every month)
*   **CHECK_TIME_HOUR**: `9` (at 9 AM)
*   **TIMEOUT_HOURS**: `1w` (Wait 7 days for a reply before the next reminder)
*   **MAX_RETRIES**: `3` (Remind 3 times = 3 weeks total pending time)
*   **Trigger Configuration**:
    *   Select type of time based trigger: **Hour timer**
    *   Select hour interval: **Every hour**

#### 2. Daily Check
*   **CHECK_DAY**: (Empty)
*   **TIMEOUT_HOURS**: `24`
*   **Trigger Configuration**:
    *   Select type of time based trigger: **Hour timer**
    *   Select hour interval: **Every hour**

#### 3. Test Mode (Fast Debugging)
Purpose: Verify that the bot is running, sending messages, and sending emails correctly without waiting for weeks.

*   **Sheet Configuration**:
    *   **TEST_MODE**: `TRUE` (Bypasses hour check, runs logic immediately)
    *   **CHECK_DAY**: (Empty)
    *   **TIMEOUT_HOURS**: `2m` (Wait 2 minutes for reply)
    *   **MAX_RETRIES**: `3` (After 3 reminders x 2 mins = 6 mins, email will be triggered)
*   **Trigger Configuration**:
    *   Select type of time based trigger: **Minute timer**
    *   Select minute interval: **Every minute**

*   **⚠️ IMPORTANT**:
    *   Change the beneficiary email in `Beneficiaries` sheet to your own secondary email for testing. Do not alarm your actual beneficiaries!
    *   After testing, set `TEST_MODE` back to `FALSE`, revert Trigger to `Hour timer`, and reset your timeout settings.

## 6. Donation
If you find this project helpful, please consider buying me a coffee! ☕

<p align="center">
  <a href="https://buymeacoffee.com/stevehuynh" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" >
  </a>
</p>

*   **Bank Transfer (Vietnam)**: `QR Code`
<p align="center">
  <img src="images/vietcombank.png" width="20%">
</p>

*   **PayPal**: `foureye2004@gmail.com`
