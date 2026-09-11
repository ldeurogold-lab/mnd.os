# Mái Nhà Đẹp OS

Hệ thống nội bộ quản lý dự án, sản xuất, thi công, nghiệm thu và tài chính của Công Ty Mái Nhà Đẹp.

## Cấu trúc mã nguồn

- `app/`: bộ mã nguồn cài nền chạy bằng Docker và PostgreSQL.
- `upgrades/1.11.5-RC/`: bộ nâng cấp tích lũy đang dùng cho máy chủ CEO, gồm phân quyền Ban quản trị, cập nhật nhân sự, giao việc, Agent, xuất Excel, PWA và nút tải lại dữ liệu.

## Cài đặt

Máy chủ Windows cần Docker Desktop. Vào thư mục `app` và chạy `CAI-DAT.bat` cho lần cài mới. Khi máy đang chạy bản 1.9 trở lên, dùng `upgrades/1.11.5-RC/NANG-CAP.bat` để nâng cấp.

Không chạy `docker compose down -v`: thao tác này có thể xóa volume dữ liệu.

## Bảo mật và dữ liệu

Kho mã nguồn không chứa `.env`, mật khẩu, token Cloudflare, dữ liệu PostgreSQL, hồ sơ tải lên hoặc bản sao lưu. Các tệp đó phải được giữ riêng trên máy chủ và không commit lên GitHub.

## Phiên bản

- Mã cài nền: 1.3.1 RC.
- Bộ nâng cấp tích lũy mới nhất trong kho: 1.11.5 RC.

