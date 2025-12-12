# Dead Man Switch Bot - Setup Guide

[🇻🇳 Vietnamese Version](README.vi.md)

This system ensures your legacy information is delivered to your beneficiaries if you stop responding to the bot.

## 1. Telegram Bot Setup
1.  Chat with **@BotFather** on Telegram.
    ![Search BotFather](images/telegram_search_botfather.png)
2.  Send `/newbot` and follow instructions to get your **Bot Token**.
    ![Get Token](images/telegram_newbot_token.png)
3.  Search for your new bot and click **Start**.
    ![Start Bot](images/telegram_start_bot.png)


4.  Get your **Chat ID** (you can use @userinfobot or look at logs later).

    ![Get Chat ID](images/telegram_userinfobot.png)

## 2. Google Sheet Setup
1.  Create a new, empty Google Sheet.
2.  The script will automatically create the necessary sheets and columns for you in the next step.

    ![Create New Sheet](images/create_new_sheet.png)

## 3. Deploy Script
1.  Open **Extensions > Apps Script**.
2.  Copy the code from `src/Code.gs` in this folder into the script editor.
3.  **Run Setup**:
    *   Reload your Google Sheet.
    *   You should see a new menu **"Dead Man Bot"** appear in the toolbar (after a few seconds).
    *   Click **Dead Man Bot > Setup Sheet**.
    *   The script will automatically create the "Config" and "Beneficiaries" sheets and formatting for you.
    
    ![Sheet Menu](images/sheet_menu.png)

4.  **Deploy > New Deployment** > Select **Web App**.
    *   Execute as: **Me**.
    *   Who has access: **Anyone**.
    
    ![Deploy Web App](images/deploy_webapp.png)

5.  Copy the **Web App URL**.
6.  Run the `setWebhook()` function (replace `YOUR_WEB_APP_URL` in the code temporarily or via prompt if you know how, simpler: hardcode it just for setup).

    ![Run setWebhook](images/run_setwebhook.png)

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

![Trigger Setup](images/trigger_setup.png)

> [!NOTE]
> You must select **Every hour** even if you configure a monthly check. The script will automatically check if today is the scheduled day. If you choose a differnet timer, the bot may not run at your configured hour.

### Trigger Optimization (Advanced)
If you are using **Monthly/Weekly Checks** (long timeouts) and want to save script execution quota, you can choose:
*   Select type of time based trigger: **Day timer**
*   Select time of day: **9am to 10am** (Or the time matching your `CHECK_TIME_HOUR`)

**Note:** This only works if your `TIMEOUT_HOURS` is in Days (d) or Weeks (w). If you start using short timeouts (e.g., 30m), this setting will cause delayed notifications.

## 5. Usage & Configuration
In the "Config" Sheet, you can customize:

*   **CHECK_DAY**: (Optional) Enter a day (1-31) to check only on that day of the month. Leave empty to check every day.
*   **CHECK_TIME_HOUR**: The hour (0-23) to send the check.
*   **TIMEOUT_HOURS**: Time to wait for a reply. Supports:
    *   `1w` (1 week)
    *   `3d` (3 days)
    *   `9h` (9 hours)
    *   `30m` (30 minutes)
    *   Default is hours if no suffix.
*   **MAX_RETRIES**: Number of reminders to send before declaring DEAD.

![Config Sheet Example](images/config_sheet_demo.png)

### Configuration Examples

#### 1. Monthly Check, Weekly Reminder
*   **CHECK_DAY**: `1` (Check on the 1st of every month)
*   **CHECK_TIME_HOUR**: `9` (at 9 AM)
*   **TIMEOUT_HOURS**: `1w` (Wait 7 days for a reply before the next reminder)
*   **MAX_RETRIES**: `3` (Remind 3 times = 3 weeks total pending time)

#### 2. Daily Check
*   **CHECK_DAY**: (Empty)
*   **TIMEOUT_HOURS**: `24`

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

    ![Test Mode Config](images/config_sheet_test_mode.png)
*   **⚠️ IMPORTANT**:
    *   Change the beneficiary email in `Beneficiaries` sheet to your own secondary email for testing. Do not alarm your actual beneficiaries!
    *   After testing, set `TEST_MODE` back to `FALSE`, revert Trigger to `Hour timer`, and reset your timeout settings.
