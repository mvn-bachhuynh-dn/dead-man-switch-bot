# Dead Man Switch Bot - Hướng dẫn Cài đặt

[🇺🇸 English Version](README.md)

> **Giới thiệu về Dead Man Switch Bot**
>
> Trong cuộc sống, điều không may mắn có thể xảy ra bất cứ lúc nào. Dead Man Switch Bot được xây dựng với mục đích duy nhất: **đảm bảo những lời nhắn gửi, thông tin quan trọng (tài khoản, mật khẩu, quỹ dự phòng...) của bạn sẽ được gửi an toàn đến đúng người thân yêu nhất khi bạn không còn khả năng phản hồi.**
>
> **Tại sao bạn nên dùng Bot này mà không phải dịch vụ bên thứ 3?**
> *   **100% Quyền riêng tư & Bảo mật**: Đây là giải pháp **Do-It-Yourself (Tự quản lý)**. Bạn là người duy nhất nắm giữ mã nguồn, dữ liệu và Google Sheet. Không có bên thứ ba nào (kể cả tác giả) có quyền truy cập vào thông tin nhạy cảm của bạn.
> *   **An toàn tuyệt đối**: Dữ liệu của bạn nằm trên tài khoản Google của chính bạn. Không có server trung gian, không có nguy cơ rò rỉ dữ liệu từ phía nhà cung cấp dịch vụ.
> *   **Miễn phí trọn đời**: Sử dụng hạ tầng sẵn có của Google (Apps Script, Sheets) và Telegram, hoàn toàn không tốn phí duy trì.
>
> Hãy dành 15 phút để thiết lập. Đó có thể là 15 phút quan trọng nhất để bảo vệ tương lai cho những người thân yêu của bạn.

Hệ thống này đảm bảo thông tin thừa kế của bạn sẽ được gửi đến người thụ hưởng nếu bạn ngừng phản hồi bot.

## 1. Cài đặt Telegram Bot
1.  Chat với **@BotFather** trên Telegram.
    
    <p align="center">
      <img src="images/telegram_search_botfather.png" width="50%">
    </p>
2.  Gửi lệnh `/newbot` và làm theo hướng dẫn để lấy **Bot Token**.(Lưu lại để sử dụng cho bước sau, giữ an toàn, không chia sẻ với bất kỳ ai)
    <p align="center">
      <img src="images/telegram_newbot_token.png" width="50%">
    </p>
3.  Tìm bot mới tạo của bạn và bấm **Start**.
    <p align="center">
      <img src="images/telegram_start_bot.png" width="50%">
    </p>


4.  Lấy **Chat ID** của bạn (bạn có thể dùng @userinfobot hoặc xem log sau này).

    <p align="center">
      <img src="images/telegram_userinfobot.png" width="50%">
    </p>

## 2. Cài đặt Google Sheet
1.  Tạo một Google Sheet mới, trống.
    <p align="center">
      <img src="images/create_new_sheet.jpeg" width="50%">
    </p>
2.  Script sẽ tự động tạo các sheet và cột cần thiết ở bước sau.


## 3. Triển khai Script
1.  Mở **Extensions (Tiện ích mở rộng) > Apps Script**.
    
    <p align="center">
      <img src="images/extensions_menu.jpeg" width="50%">
    </p>

2.  Copy toàn bộ code từ file `src/Code.vi.gs` trong thư mục này vào trình soạn thảo script.
3.  Tạo file HTML mới:
    *   Bấm dấu `+` > chọn **HTML**.
    *   Đặt tên là `webapp`.
    *   Copy nội dung từ file `src/webapp.html` dán vào.
4.  **Chạy Cài đặt**:
    *   Reload (F5) lại trang Google Sheet.
    *   Bạn sẽ thấy menu **"Dead Man Bot"** xuất hiện trên thanh công cụ (sau vài giây).
    *   Bấm **Dead Man Bot > Setup Sheet**.
    *   Script sẽ tự động tạo sheet "Config" và "Beneficiaries" cùng định dạng cần thiết.

    <p align="center">
      <img src="images/sheet_menu.png" width="50%">
    </p>

    *   Cấu hình các thông số cần thiết trong sheet "Config". Từ các bước đã thực hiện trước đó. (Xem bước 5 để tham khảo cấu hình)

    <p align="center">
      <img src="images/config_sheet_init.png" width="50%">
    </p>
4.  **Deploy (Triển khai)**:
    *   Bấm **Deploy > New Deployment**.
    *   Select type: **Web App**.
    *   Execute as: **Me (Tôi)**.
    *   Who has access: **Anyone (Bất kỳ ai)**.
    
    <p align="center">
      <img src="images/deploy_webapp.jpeg" width="50%">
    </p>

5.  Copy **Web App URL**.
6.  Chạy hàm `setWebhook()` (thay thế `YOUR_WEB_APP_URL` trong code bằng URL vừa copy).
    *   **Lưu ý**: Bước này sẽ kích hoạt nút "Cấu hình Bot" (Mini App) trên Telegram.
    ```javascript
      // replace with your web app url
      const url = "YOUR_WEB_APP_URL_HERE"; 
    ```
  <p align="center">
  </p>

> [!IMPORTANT]
> **Cập nhật v1.1.0**: Kể từ phiên bản này, bạn có thể cấu hình bot trực tiếp trên giao diện Telegram (Mini App) cực kỳ trực quan thay vì sửa Sheet thủ công.

## 4. Cài đặt Trigger (Bắt buộc)
Để bot tự động chạy, bạn phải cài đặt Trigger theo đúng hướng dẫn sau:

1.  Trong giao diện Apps Script, bấm vào menu **Triggers** (biểu tượng đồng hồ bên trái).
2.  Bấm **+ Add Trigger** (góc dưới bên phải).
3.  Cấu hình như sau:
    *   Choose which function to run: `mainJob`
    *   Select event source: **Time-driven**
    *   Select type of time based trigger: **Hour timer**
    *   Select hour interval: **Every hour**
4.  Bấm **Save**.

<p align="center">
  <img src="images/trigger_setup.jpeg" width="50%">
</p>

> [!NOTE]
> Bạn phải chọn **Every hour (Mỗi giờ)** ngay cả khi bạn cấu hình kiểm tra theo tháng. Script sẽ tự động kiểm tra xem hôm nay có phải là ngày cần chạy không. Nếu bạn chọn timer khác, bot có thể sẽ không chạy đúng giờ cấu hình.

### Tùy chọn Tiết kiệm Trigger (Nâng cao)
Nếu bạn chỉ dùng cấu hình **Kiểm tra theo Tháng/Tuần** (thời gian chờ lâu) và muốn tiết kiệm số lần chạy của Script, bạn có thể chọn:
*   Select type of time based trigger: **Day timer**
*   Select time of day: **9am to 10am** (Hoặc khung giờ trùng với `CHECK_TIME_HOUR` của bạn)

**Lưu ý:** Cách này **CHỈ** dùng được nếu `TIMEOUT_HOURS` của bạn là đơn vị Ngày (d) hoặc Tuần (w). Nếu bạn set timeout ngắn (ví dụ 30 phút), cách này sẽ làm bot bị trễ thông báo.

## 5. Sử dụng & Cấu hình
Trong Sheet "Config", bạn có thể tùy chỉnh:

| Key | Mô tả |
| :--- | :--- |
| **TELEGRAM_BOT_TOKEN** | Lấy từ bước 1.2 |
| **USER_CHAT_ID** | Lấy từ bước 1.4 |
| **CHECK_DAY** | Ngày kiểm tra hàng tháng (1-31). Để trống nếu check hàng ngày. |
| **CHECK_TIME_HOUR** | Giờ kiểm tra (0-23) |
| **TIMEOUT_HOURS** | Thời gian chờ phản hồi (VD: 24, 9h, 30m, 1w) |
| **MAX_RETRIES** | Số lần nhắc nhở tối đa trước khi gửi email |
| **STATUS** | (Tự động) Trạng thái hiện tại (ALIVE/PENDING/DEAD) |
| **TEST_MODE** | Chế độ test (TRUE/FALSE) |
| **LAST_PING** | (Tự động) Thời gian kiểm tra gần nhất |
| **RETRIES** | (Tự động) Số lần đã nhắc nhở hiện tại |

Nếu config như hình dưới thì tôi muốn bot gửi tin nhắn kiểm tra hàng tháng vào ngày 12 của tháng, khoảng 9h sáng, và nếu không có phản hồi sẽ nhắc 3 lần sau mỗi 24h. Nếu vẫn không có phản hồi, bot sẽ gửi email thông báo.
<p align="center">
  <img src="images/config_sheet_demo.png" width="50%">
</p>

## 5b. Cấu hình qua Giao diện (Mới)
Sau khi chạy `setWebhook`, một nút **"Bot Config"** sẽ xuất hiện khi bạn chat `/menu` hoặc mở Menu chính của bot.

<p align="center">
  <img src="images/config_ui_preview.png" width="50%">
</p>

Giao diện này cho phép bạn:
*   **Dễ dàng điều chỉnh**: Timeout, Giờ kiểm tra, Ngày kiểm tra...
*   **Chế độ Test & Debug**: Bật tắt nhanh chóng để kiểm tra lỗi.
*   **Giải thích thông minh**: Bot sẽ tự động giải thích cấu hình hiện tại (Ví dụ: "Bot sẽ kiểm tra ngày 1 hàng tháng...") và cảnh báo nếu bạn cài đặt sai (Ví dụ: Dùng Timeout phút cho chế độ chạy giờ).

> **Lưu ý**: Nếu bạn đang dùng phiên bản cũ, hãy update code trong file `Code.vi.gs` và `webapp.html` lên phiên bản v1.1.0 mới nhất, sau đó chọn **Deploy > New Deployment** để thấy được giao diện này.

### Các Ví dụ Cấu hình

#### 1. Kiểm tra Hàng tháng, Nhắc nhở Hàng tuần (Yêu cầu phổ biến)
*   **CHECK_DAY**: `1` (Kiểm tra vào ngày mùng 1 hàng tháng)
*   **CHECK_TIME_HOUR**: `9` (lúc 9 giờ sáng)
*   **TIMEOUT_HOURS**: `1w` (Nếu không trả lời, đợi 7 ngày sau mới nhắc lại)
*   **MAX_RETRIES**: `3` (Nhắc 3 lần = 3 tuần dây dưa)
*   **Cấu hình Trigger**:
    *   Select type of time based trigger: **Hour timer**
    *   Select hour interval: **Every hour**

#### 2. Kiểm tra Hàng ngày
*   **CHECK_DAY**: (Để trống)
*   **TIMEOUT_HOURS**: `24`
*   **Cấu hình Trigger**:
    *   Select type of time based trigger: **Hour timer**
    *   Select hour interval: **Every hour**

#### 3. Chế độ Test (Chạy thử nhanh)
Mục đích: Kiểm tra xem bot có hoạt động, gửi tin nhắn và gửi email đúng không mà không cần chờ cả tuần.

*   **Cấu hình Sheet**:
    *   **TEST_MODE**: `TRUE` (Bỏ qua kiểm tra giờ, cứ chạy script là check)
    *   **CHECK_DAY**: (Để trống)
    *   **TIMEOUT_HOURS**: `2m` (Chờ 2 phút không trả lời là nhắc)
    *   **MAX_RETRIES**: `3` (Sau 3 lần nhắc x 2 phút = 6 phút sẽ gửi email)
*   **Cấu hình Trigger**:
    *   Select type of time based trigger: **Minute timer**
    *   Select minute interval: **Every minute**

*   **⚠️ QUAN TRỌNG**:
    *   Hãy đổi email người nhận trong sheet `Beneficiaries` thành email phụ của bạn để test. Đừng gửi cho người thân thật lúc này!
    *   Sau khi test xong, nhớ tắt `TEST_MODE` (`FALSE`), đổi lại Trigger sang `Hour timer` và cập nhật lại thời gian timeout.

## 6. Donation (Ủng hộ)
Nếu bạn thấy dự án này hữu ích, hãy ủng hộ tôi 1 ly cà phê nhé! ☕

<p align="center">
  <a href="https://buymeacoffee.com/stevehuynh" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" >
  </a>
</p>

*   **Bank Account**: `QR Code`
<p align="center">
  <img src="images/vietcombank.png" width="20%">
</p>
