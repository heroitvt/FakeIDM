# Changelog

## 1.2.0 — 2026-10-23

- Phát triển từ bản SwiftDrop trong Downloads với giao diện bảng, menu và thanh công cụ kiểu IDM.
- Đổi tên ứng dụng, extension, metadata và thư mục dữ liệu thành FakeIDM.
- Thêm gói Windows/Linux x64 kèm Electron, giữ nguồn launcher Swift trên Mac.
- Sửa retry sau phản hồi bị ngắt để tính lại vị trí byte, tránh ghi trùng.
- Sửa tải file không hỗ trợ Range lớn hơn 64 MiB; kiểm tra validator cả với phản hồi không Range.
- Không chia nhiều đoạn hoặc ghép qua phản hồi mới khi nguồn thiếu validator đáng tin cậy.
- Làm mới URL dừng tác vụ cũ, xóa phần tạm và bắt đầu an toàn; từ chối sửa file đã hoàn tất.
- Giới hạn header từ trình duyệt, chặn ghi đè Range/Host và loại bỏ cookie/Authorization khi đổi origin.
- Cookie được lấy đúng URL; API trạng thái không trả header xác thực.
- Tiện ích chống gửi trùng và chỉ hủy tải trình duyệt sau khi ứng dụng nhận thành công.
- Thay window.prompt bằng dialog tương thích Electron; sửa nút đóng chi tiết bị CSP chặn.
- Thêm regression tests, tài liệu, CI và script build kiểm tra checksum runtime.

## 1.0.0 — bản gốc SwiftDrop

HTTP/HTTPS, pause/resume, hàng đợi, hẹn giờ, giới hạn tốc độ và launcher macOS.
