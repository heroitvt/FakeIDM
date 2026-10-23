# Chuyển từ SwiftDrop sang FakeIDM

Tên mới dùng dữ liệu riêng, không tự sửa dữ liệu bản cũ. File hoàn tất vẫn ở vị trí ban đầu.

Giữ lịch sử và các phần đang tải trên Mac:

1. Đóng hoàn toàn cả hai app.
2. Sao lưu `~/Library/Application Support/SwiftDrop`.
3. Khi đích chưa có dữ liệu cần giữ, sao chép toàn bộ nội dung SwiftDrop sang `~/Library/Application Support/FakeIDM`, gồm state.json, pairing-token.txt và các thư mục UUID.
4. Mở FakeIDM, kiểm tra danh sách trước khi Tiếp tục. Nhập lại mã nếu cài extension mới.

Không gộp hai state.json hoặc ghi đè lịch sử cần giữ. Đường dẫn tải tuyệt đối trong lịch sử/cài đặt vẫn giữ nguyên. Chuyển giữa Windows và Linux/macOS chưa có công cụ tự chuyển đường dẫn.

File tạm `.swiftdrop-*.tmp` từ lần ghép bị gián đoạn không được tự dọn bởi tên mới. Chỉ tự xóa khi đã chắc chắn bản cũ đóng và không cần phục hồi.
