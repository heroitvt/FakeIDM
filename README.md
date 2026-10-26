# FakeIDM

Trình quản lý tải xuống HTTP/HTTPS chạy trên máy cá nhân, có giao diện bảng và thanh công cụ kiểu IDM bằng tiếng Việt, tải nhiều kết nối và tiếp tục tải. **Windows · Linux · macOS**.

Dự án độc lập, lấy cảm hứng từ các chức năng quản lý tải công khai của Internet Download Manager. FakeIDM không liên kết với IDM/Tonec và không sử dụng mã nguồn, logo hoặc tài sản giao diện của IDM.

**Phiên bản hiện tại: 1.2.0.** Tên cũ của dự án là SwiftDrop.

## Dùng bản đóng gói

Không cần cài Node.js hoặc npm. Các gói hiện tại dành cho **x64**, chưa có bản ARM64.

| Hệ điều hành | Gói | Cách mở |
| --- | --- | --- |
| Windows x64 | `FakeIDM-1.2.0-Windows-x64.zip` | Giải nén toàn bộ thư mục, mở `FakeIDM.exe` |
| Linux desktop x64 | `FakeIDM-1.2.0-Linux-x64.tar.gz` | Giải nén, chạy `./Start-FakeIDM.sh` |
| macOS Intel | `FakeIDM-1.2.0-Mac-Intel.zip` | Giải nén, mở `FakeIDM.app` |

Gói phát hành có thể được đính kèm ở [Releases](https://github.com/heroitvt/FakeIDM/releases). Nếu chưa có release, lấy artifact của lần build thành công trong [Actions](https://github.com/heroitvt/FakeIDM/actions), hoặc tự build bên dưới.

Windows đề xuất Windows 11. Linux cần desktop dùng glibc, GTK3, NSS, thư viện âm thanh và trình quản lý file; gói không dành cho Alpine/musl hoặc máy chủ không có giao diện. macOS đặt mức tối thiểu 14.0. Xem [hướng dẫn nền tảng](docs/PLATFORMS.md) và [kết quả kiểm thử](docs/TESTING.md).

Các gói chưa có chứng thư ký mã thương mại; macOS chỉ ký ad-hoc. Không cần tắt bảo vệ toàn hệ thống. Chỉ chạy gói từ nguồn bạn tin cậy, đối chiếu SHA-256 đi kèm nếu cần.

## Sử dụng

1. Bấm **Thêm lượt tải**, dán đường dẫn trực tiếp đến file; mỗi dòng một link nếu thêm hàng loạt.
2. Chọn số kết nối, tên file hoặc thời gian bắt đầu nếu cần, rồi bấm **Bắt đầu tải**.
3. Dùng **Tạm dừng / Tiếp tục**, tìm kiếm, bộ lọc và nút mở thư mục để quản lý file.

Phím tắt: `Ctrl+N` / `Ctrl+K` trên Windows, Linux; `⌘N` / `⌘K` trên macOS. Đóng cửa sổ sẽ dừng bộ tải và lưu tiến độ. Mở lại rồi bấm **Tiếp tục**.

## Chức năng

- HTTP/HTTPS, chuyển hướng, nhận tên file từ `Content-Disposition`.
- Tối đa 16 kết nối/file nếu máy chủ hỗ trợ Range; hàng đợi 1–6 file đồng thời.
- Pause/resume qua lần khởi động lại; kiểm tra ETag mạnh / Last-Modified, kích thước và URL đích.
- Tự thử lại tối đa ba lần khi lỗi kết nối; giới hạn tổng tốc độ và hẹn giờ bắt đầu.
- Kéo thả, thêm nhiều link, hiển thị tiến độ từng kết nối.
- Tính SHA-256, thêm hậu tố khi trùng tên; bỏ lịch sử không xóa file hoàn tất.
- Tiện ích Chrome/Edge gửi link qua menu chuột phải hoặc tự chuyển theo định dạng đã chọn, kèm cookie dành cho URL đó.

Tốc độ phụ thuộc máy chủ và đường truyền. SHA-256 là mã băm file nhận được, không tự xác minh nguồn phát hành. Bộ tải chia đoạn cố định; không tuyên bố khôi phục thuật toán nội bộ của IDM.

## Giới hạn đã biết

- **Google Drive:** nhận link tải trực tiếp cùng cookie phù hợp từ tiện ích trình duyệt. Chưa tự phân giải link chia sẻ `/file/d/.../view`, bước xác nhận quét virus, quota hoặc tài khoản thiếu quyền. Phản hồi HTML bị báo lỗi, không bị coi là file tải thành công. Link hết hạn cần lấy lại từ trình duyệt; Làm mới liên kết sẽ tải lại từ đầu để bảo đảm toàn vẹn.
- Chưa hỗ trợ HLS/DASH, DRM, torrent, FTP hoặc tự trích video từ trang web. Đuôi `.torrent` chỉ được tải như file thông thường.
- Máy chủ không có Range hoặc validator đáng tin cậy sẽ tải lại từ đầu khi tiếp tục.
- Hẹn giờ cần ứng dụng đang mở và máy thức; chưa có tự cập nhật hoặc tự khởi động cùng hệ thống.
- Windows/Linux đã được đóng gói từ runtime chính thức; kiểm thử chạy trực tiếp trên hai hệ điều hành này cần kết quả CI hoặc máy đích. Build chéo không thay thế kiểm thử GUI trên máy đích.

## Tiện ích Chrome / Edge

1. Mở `chrome://extensions` / `edge://extensions`, bật Developer mode, chọn **Load unpacked** và thư mục `extension`.
2. Trong FakeIDM → **Cài đặt**, sao chép mã kết nối.
3. Mở tùy chọn tiện ích FakeIDM, dán mã và chọn **Lưu và kiểm tra**.
4. Bấm chuột phải vào link → **Tải bằng FakeIDM**. Ứng dụng phải đang mở.

Tiện ích chưa lên cửa hàng. Tiện ích xin quyền downloads, cookies và HTTP/HTTPS để chuyển lượt tải phù hợp bộ lọc sang ứng dụng. Chỉ lấy cookie dành cho URL được tải; không gộp cookie các tên miền Google. Trình duyệt chỉ bị hủy lượt tải sau khi ứng dụng xác nhận đã lưu công việc. Có thể tắt tự bắt link trong Cài đặt. Cookie/Authorization không được chuyển tiếp sang origin khác và không xuất hiện trong API trạng thái; header cần cho tải tiếp được lưu trong dữ liệu cục bộ của ứng dụng.

## File và dữ liệu

File hoàn tất mặc định ở `Downloads/FakeIDM`; bản desktop dùng thư mục Downloads do hệ điều hành cung cấp. Có thể đổi trong Cài đặt.

| Nền tảng | Dữ liệu bộ tải |
| --- | --- |
| Windows | `%APPDATA%\FakeIDM` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/FakeIDM` |
| macOS | `~/Library/Application Support/FakeIDM` |

URL đầy đủ, header xác thực cần tải tiếp và mã ghép nối được lưu cục bộ. Không chia sẻ thư mục dữ liệu hoặc log có URL riêng tư. Không đưa dữ liệu này lên Git. Máy chủ chỉ lắng nghe `127.0.0.1:17831`, kiểm tra Host/Origin và Bearer token cho API. Không có telemetry hay tài khoản đám mây.

FakeIDM không tự sửa/xóa dữ liệu SwiftDrop. Xem [chuyển lịch sử](docs/MIGRATION.md). Hai ứng dụng dùng cùng cổng mặc định nên hãy đóng bản cũ trước.

## Chạy mã nguồn

Cần Node.js **22+**, khuyến nghị Node 24 LTS. Bộ tải và web UI không có dependency npm ngoài.

```sh
git clone https://github.com/heroitvt/FakeIDM.git
cd fakeIDM
npm ci
npm start
```

Mở URL localhost chứa mã kết nối được in trong terminal; giữ terminal chạy trong khi tải. Không chia sẻ URL này. Mở cửa sổ desktop x64 bằng:

```sh
npm run desktop
```

Lần đầu tải Electron **45.0.0** chính thức và kiểm tra SHA-256 đã ghim trong `scripts/runtime.mjs`. Bản macOS phát hành dùng Swift/WKWebView, không dùng Electron.

## Kiểm thử và build

```sh
npm run check
npm test
npm run package:win
npm run package:linux
```

Gói Windows/Linux ở `dist/`. Build chéo trên macOS/Linux cần `unzip`, `zip`, `tar`; Windows dùng PowerShell để nén/giải nén ZIP. CI build từng nền tảng trên runner tương ứng.

Build Mac với Command Line Tools:

```sh
npm run package:mac
```

Kết quả ở `build/FakeIDM.app`. Script dùng Node và kiến trúc máy build, kèm giấy phép Node và ký ad-hoc. Xem [DEVELOPMENT.md](docs/DEVELOPMENT.md) cho cấu trúc mã nguồn, biến môi trường và quy trình phát hành.

## REA và giấy phép

[REA](https://github.com/morluto/rea) được dùng khi khảo sát ban đầu bằng phân tích tĩnh tài nguyên PE của bộ cài IDM. REA không phải bộ tải, không chạy trong FakeIDM và không được đóng gói cùng ứng dụng. Bộ tải được viết độc lập; không đưa bộ cài hoặc tài sản IDM vào repo. Xem [nguồn tham khảo](docs/RESEARCH.md).

Mã FakeIDM theo [MIT License](LICENSE); runtime giữ giấy phép riêng trong [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Xem [CONTRIBUTING.md](CONTRIBUTING.md) và [SECURITY.md](SECURITY.md).

## Bộ cài Windows và Debian/Ubuntu

Tải `.exe` và `.deb` tại [GitHub Releases](https://github.com/heroitvt/FakeIDM/releases/latest). Xem [hướng dẫn cài đặt](docs/RELEASE-NOTES.md). Workflow `Build and publish installers` kiểm thử cài đặt, mở desktop và gỡ cài đặt trên Windows/Ubuntu trước khi phát hành.

Build từ mã nguồn: `npm run package:win` rồi `npm run installer:win` trên Windows có NSIS; `npm run package:linux` rồi `npm run installer:linux` trên Linux có dpkg-deb.
