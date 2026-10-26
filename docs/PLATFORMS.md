# Hướng dẫn nền tảng

## Windows x64

Giải nén toàn bộ ZIP rồi mở `FakeIDM.exe`. Không di chuyển riêng EXE: chương trình cần DLL, resources và locales bên cạnh. Bộ cài NSIS `FakeIDM-1.2.0-Windows-x64-Setup.exe` cài cho tài khoản hiện tại, thêm shortcut và trình gỡ cài đặt. Chưa có chứng thư ký mã nhà phát hành. Không cần Administrator.

Dữ liệu ở `%APPDATA%\FakeIDM`. Ổ đích cần hỗ trợ hard link (thường là NTFS) để hoàn tất file mà không ghi đè tên đã có; FAT/exFAT và một số network shares chưa được hỗ trợ đầy đủ.

## Linux x64

```sh
tar -xzf FakeIDM-1.2.0-Linux-x64.tar.gz
cd FakeIDM-1.2.0-Linux-x64
./Start-FakeIDM.sh
```

Nếu mất quyền executable sau giải nén, chạy `chmod +x Start-FakeIDM.sh fakeidm chrome-sandbox`. Cần desktop glibc với GTK3/NSS và trình quản lý file; bản portable không phải AppImage/RPM. Có thêm gói DEB: `sudo apt install ./FakeIDM-1.2.0-Linux-amd64.deb`, mở từ menu ứng dụng hoặc lệnh `fakeidm`. DEB cài sandbox root:root 4755, không tắt sandbox.

Sandbox Chromium vẫn bật. Một số distro hạn chế user namespace hoặc cần cấu hình sandbox/AppArmor cho ứng dụng ngoài kho. Nếu gặp lỗi sandbox, giữ thông báo để cấu hình theo chính sách distro hoặc báo issue. Launcher không tự dùng `--no-sandbox`, gọi sudo hoặc thay đổi bảo vệ toàn hệ thống.

## macOS Intel

Mở `FakeIDM.app`, có thể kéo vào Applications. Bản đóng gói dùng Swift/WKWebView và Node nhúng; tối thiểu macOS 14.0, kiểm thử trên macOS 15.5 Intel. Chưa có gói Apple Silicon.

App ký ad-hoc, chưa notarize. Nếu macOS yêu cầu xác nhận nhà phát triển, dùng tùy chọn riêng cho app trong System Settings → Privacy & Security sau khi kiểm tra nguồn tải; không tắt Gatekeeper toàn hệ thống.

## Mở trùng và thoát

Windows/Linux dùng single-instance lock; mở thêm sẽ đưa cửa sổ hiện có lên trước. Cổng 17831 cũng được SwiftDrop cũ sử dụng: đóng bản cũ trước. Thoát FakeIDM sẽ lưu tiến độ; mở lại rồi bấm Tiếp tục.
