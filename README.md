# CHAT-22 · Conversation Lab

Ứng dụng mô phỏng hội thoại nhóm để tạo dữ liệu thô cho thử nghiệm Thread Disentanglement. HTML/CSS/JavaScript thuần; không thư viện, backend, database, LLM hay kết nối mạng.

## Chạy ứng dụng

Mở **index.html** bằng Chrome, Edge hoặc Firefox hiện đại; hoặc mở thư mục bằng VS Code và chọn **Open with Live Server**. Không cần npm. Giữ cùng trình duyệt, hồ sơ và địa chỉ trang để đọc lại dữ liệu localStorage.

## Sử dụng

1. Bấm **＋** bên cạnh Thành viên, nhập tên và ID duy nhất (ví dụ `U_LAN`). Bấm biểu tượng bút để đổi tên; ID giữ nguyên.
2. Khoảng **1/3 trang bên phải** là các khung chat riêng cho từng thành viên, có thể cuộn khi nhiều vai. Nhập và bấm **Gửi tin nhắn** ngay trong khung của vai muốn dùng, không cần đổi dropdown. Chọn thành viên bên trái để đưa con trỏ tới khung tương ứng. `Ctrl+Enter` / `⌘+Enter` gửi từ khung đang nhập; Enter thường xuống dòng. Nội dung giữ nguyên khoảng trắng và xuống dòng. Bản nháp mỗi vai độc lập: gửi từ Lan không xóa phần Nam đang soạn. Bản nháp chỉ giữ trong phiên trang hiện tại, chưa lưu qua reload.
3. Mỗi khung có **Metadata nâng cao** riêng để đặt thời gian quá khứ theo múi giờ +07:00, chủ đề thủ công, participants, OCR/ASR và ACL dạng mảng JSON như `["*"]`, `["role:manager"]`, `["U_LAN","U_NAM"]`. Participants ban đầu là `[]`, không tự chọn toàn nhóm. Các giá trị metadata đã nhập được giữ cho lượt gửi tiếp theo của vai đó; xóa hoặc bỏ chọn khi muốn đổi kịch bản.
4. Bấm **Trả lời** dưới tin cũ, rồi bấm **Trả lời msg_…** trong khung vai muốn dùng. Mỗi vai giữ ngữ cảnh reply riêng; nhiều vai có thể trả lời cùng một tin. Nút × hủy reply và giữ nội dung đang soạn. Trích dẫn có thể bấm để quay về tin gốc. Chỉ reply trong cùng `conversation_id` đang cấu hình; nếu khác, đổi cấu hình nguồn trước. Không tự gán chủ đề hay gộp thread.
5. **Sửa** chỉ đổi nội dung, dùng thời điểm hiện tại hoặc thời gian tùy chỉnh; giữ metadata nguồn của tin gốc. **Xóa** cần xác nhận và hiển thị tombstone. Cả hai thêm sự kiện, không ghi đè bản gốc. Tin đã xóa không thể sửa hoặc nhận reply mới; những reply cũ vẫn giữ tham chiếu.
6. Chọn tin nhắn, bấm **Xem dữ liệu** hoặc nút **{ } msg_…** để xem JSON bên phải. Bấm **Khung đóng vai** để quay lại các ô nhập; bản nháp vẫn giữ nguyên. Chọn từng mục trong **Lịch sử** để xem sự kiện cũ; nút sao chép lấy đúng JSON đang xem. **Sao chép toàn bộ** lấy cả gói dữ liệu. Khi sửa tin, ứng dụng tự đưa nội dung vào đúng khung người gửi gốc và khôi phục bản nháp trước đó khi lưu hoặc hủy sửa.
7. **Xuất JSON** tải bản sao; **Nhập JSON** kiểm tra toàn bộ trước khi hỏi thay thế dữ liệu hiện tại. Không trộn hai dataset, vì trộn sẽ làm mơ hồ thứ tự sự kiện và ID. **Đặt lại dữ liệu** cần xác nhận; nên xuất trước.

## Schema và lưu trữ

**Tài liệu yêu cầu ghi “14 trường” nhưng schema và danh sách thực tế có 13. Ứng dụng giữ đúng 13 trường được cung cấp**, không tự thêm trường thứ 14:

`message_id`, `conversation_id`, `channel_id`, `group_id`, `sender_id`, `timestamp`, `text`, `participants`, `reply_to`, `topic`, `media_text`, `acl`, `event_type`.

`topic`, `media_text`, `reply_to` dùng JSON `null` khi không có dữ liệu. Timestamp ISO 8601 luôn có `+07:00`; thời điểm tự động có mili giây. Participants là ID được chọn thủ công. ACL chỉ là metadata, không thực thi quyền truy cập.

File xuất là gói JSON:

```json
{
  "version": 1,
  "config": {"conversation_id":"conv_1","channel_id":"c_sales","group_id":"G01"},
  "members": [{"id":"U_LAN","name":"Lan","color":"hsl(215 58% 53%)"}],
  "events": [],
  "nextId": 1
}
```

Mỗi phần tử `events` có đúng 13 trường. Metadata thành viên và cấu hình nằm ngoài bản ghi sự kiện để khôi phục tên và tiếp tục mô phỏng. Khi đưa dữ liệu vào thuật toán, đọc `dataset.events`.

Cũng có thể nhập trực tiếp **mảng sự kiện**: tên hiển thị được khôi phục bằng ID, cấu hình lấy từ sự kiện đầu tiên, màu avatar được tạo lại theo thứ tự thành viên. Import từ chối: thiếu/thừa trường, sai kiểu, timestamp/ngày không hợp lệ, ID thành viên trùng, ID tin gốc trùng, participants không tồn tại, reply trỏ tới tin chưa tạo/đã xóa/khác nguồn, edit/delete không có bản gốc, hoặc thay metadata gốc khi sửa/xóa. ID thành viên được tạo trong UI dùng chữ ASCII, số, `_`, `-`; import giữ nguyên ID chuỗi từ dataset bên ngoài.

`message_id` tăng dần (`msg_001`…), chỉ cấp cho `new`. `edit` và `delete` dùng lại ID gốc. Bộ đếm không lùi khi xóa, đặt lại hoặc nhập dữ liệu. Sau import tính lại từ tất cả sự kiện và bộ đếm đã lưu, tránh trùng ID.

**Thứ tự mảng events là thứ tự xử lý**, không sắp theo timestamp. Giao diện giữ thứ tự gửi gốc; timestamp có thể cố ý ở quá khứ. Dựng lại hội thoại bằng cách duyệt từ đầu, thay trạng thái theo `message_id`, giữ vị trí của lần `new` đầu tiên. Sau sửa/xóa, `timestamp` là thời điểm sự kiện mới; timestamp gốc vẫn nằm ở sự kiện `new`.

Mỗi thay đổi được lưu vào khóa `chat22.simulator.v1`. Nếu localStorage đầy/bị chặn, thao tác bị hủy và báo lỗi thay vì báo lưu thành công. Nếu dữ liệu lưu bị hỏng, ứng dụng khóa ghi, không tự ghi đè. Nếu tab khác thay đổi dữ liệu, cần tải lại trang để tiếp tục.

## Kiểm thử

Chạy tùy chọn `node tests.cjs` khi có Node.js. Node chỉ phục vụ kiểm thử, không cần để sử dụng ứng dụng. Bộ test kiểm tra 5 thành viên, 20 tin, 3 chủ đề xen kẽ, reply xa, sửa/xóa và lịch sử, 13 trường, thời gian, JSON round trip, ID sau import, các dữ liệu nhập sai, metadata bất biến, reply đến tin đã xóa, và kiểm tra tĩnh các điểm có thể chèn HTML/script.

Chạy thêm `node tests-ui.cjs` để kiểm tra tương tác qua DOM mô phỏng: khung riêng của 3 vai, sender/metadata chính xác, bản nháp và reply độc lập, sửa đúng người gửi và khôi phục bản nháp, từ chối tin rỗng, chuyển xem JSON, participants và hiển thị HTML như văn bản, nạp lại hội thoại từ dữ liệu lưu. Đây là kiểm thử logic giao diện, không thay thế trình duyệt thật hoặc kiểm tra layout trực quan.

Đã chạy thành công các kiểm tra logic/serialization và cú pháp. **Chưa xác minh trực quan và thao tác trình duyệt thực tế**: công cụ Computer Use dừng do không xác định được URL Chrome. Serialization round trip mô phỏng dữ liệu lưu/tải lại, chưa thay thế kiểm tra reload thật trong trình duyệt. Clipboard, tải file, chọn file import và layout cần kiểm tra thủ công trên trình duyệt đích.

Quy trình kiểm tra thủ công: tạo 5 thành viên → gửi 20 tin với 3 chủ đề → reply tin đầu → sửa/xóa → reload → xuất JSON → nhập lại → so sánh trạng thái và lịch sử. Gửi `<img src=x onerror=alert(1)>` và `<script>alert(1)</script>`: phải xuất hiện như văn bản, không chạy mã. Các nội dung người dùng được đưa vào DOM bằng `textContent` hoặc text node.

## Cấu trúc

- `index.html`: bố cục và biểu mẫu tiếng Việt.
- `style.css`: giao diện ba vùng, responsive, không dùng tài nguyên mạng.
- `model.js`: schema, kiểm tra dữ liệu, ID, lịch sử sự kiện.
- `app.js`: DOM, thao tác người dùng, localStorage, import/export và clipboard.
- `tests.cjs`: kiểm thử không thư viện.
- `tests-ui.cjs`: kiểm thử tương tác khung vai bằng DOM mô phỏng, không thư viện.

## Giới hạn

- Dữ liệu chỉ nằm trên trình duyệt/thiết bị hiện tại, không đồng bộ. Xóa dữ liệu trình duyệt hoặc dùng chế độ riêng tư có thể làm mất dữ liệu; xuất JSON thường xuyên.
- Hành vi localStorage với `file://` tùy trình duyệt; nếu bị chặn, dùng Live Server. Clipboard có phương án dự phòng; nếu trình duyệt vẫn từ chối, dùng Xuất JSON.
- Không hỗ trợ chỉnh sửa đồng thời nhiều tab. Không có upload media thật, tự phân luồng hoặc phân quyền thật.
- Lưu toàn bộ lịch sử và kiểm tra dữ liệu trong bộ nhớ; phù hợp bộ dữ liệu thử nghiệm nhỏ/vừa, chưa tối ưu cho hàng trăm nghìn sự kiện.
