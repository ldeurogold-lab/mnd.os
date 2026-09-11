MÁI NHÀ ĐẸP OS 1.3.1 RC - BỔ SUNG QUY TRÌNH DỰ ÁN

Quan trọng khi nâng cấp:
- Tự động lấy cấu hình .env từ phiên bản cũ ở thư mục kế bên.
- Giữ nguyên tài khoản CEO, mật khẩu, nhân viên, dự án, tài chính và tệp tải lên.
- Chỉ yêu cầu tạo CEO khi cài mới hoàn toàn và chưa có volume dữ liệu.
- Nếu đã có dữ liệu nhưng thiếu cấu hình cũ, bộ cài dừng lại để bảo vệ dữ liệu.
- Không xóa mnd_os_data, mnd_os_uploads và không chạy docker compose down -v.

Mục tiêu:
- Chạy độc lập trên máy CEO, nâng cấp máy chủ sau.
- Không kết nối MISA.
- Không dùng hoặc sửa dữ liệu Eurogold OS.
- Dùng cổng kỹ thuật riêng 3200.
- Dữ liệu và hồ sơ nằm trong volume Docker riêng.

Cài đặt:
1. Giải nén bộ cài vào một thư mục riêng, ví dụ D:\Mai-Nha-Dep-OS.
2. Mở Docker Desktop và chờ Docker hoạt động.
3. Nhấp đúp file CAI-DAT.bat. Cửa sổ sẽ không tự đóng và luôn hiển thị kết quả.
4. Khi nâng cấp, bộ cài không hỏi lại thông tin CEO. Chỉ cài mới hoàn toàn mới cần nhập.
5. Khi thành công, trình duyệt tự mở http://localhost:3200 trên máy CEO.
6. Nếu lỗi, gửi file NHAT-KY-CAI-DAT.txt nằm trong thư mục bộ cài.

Sử dụng từ máy khác trong mạng LAN:
- Xem địa chỉ IPv4 của máy CEO bằng ipconfig.
- Cần mở cổng 3200 trong Windows Firewall trước khi nhân viên truy cập.
- Truy cập http://DIA-CHI-IP-MAY-CEO:3200.
- Chưa chuyển Cloudflare Tunnel trong lần cài đầu.

Sao lưu:
- Chạy SAO-LUU-DU-LIEU.ps1.
- Chép thư mục backups sang ổ cứng khác.
- Không chạy docker compose down -v vì sẽ xóa dữ liệu.

Chức năng bản 1.0:
- Tài khoản CEO và đăng nhập riêng.
- Tạo dự án, giao việc, chuyển công đoạn.
- Báo cáo sản xuất/thi công, ảnh, PDF, Excel, CSV.
- Quản lý tài khoản công ty, thu–chi và lô dự án.
- Dữ liệu PostgreSQL và tệp hồ sơ độc lập.

Chức năng bản 1.2.0:
- Giao diện thống nhất với mô hình điều hành ban đầu.
- Dữ liệu màn hình lấy từ PostgreSQL, không dùng số liệu mẫu.
- Cơ cấu 17 người: Ban quản trị 3, Kế toán 2, Sản xuất 6, Thi công 6.
- CEO thêm/cho nghỉ nhân sự và tạo/khóa tài khoản đăng nhập.
- Giao việc, chuyển công đoạn, báo cáo, ảnh, PDF và Excel.
- Giao diện responsive cho điện thoại; có hướng dẫn Cloudflare Tunnel riêng.

Bổ sung trong 1.3.0 RC:
- Dự toán theo vật tư, nhân công, máy/khấu hao, thầu phụ, chi phí chung và dự phòng.
- Danh mục vật tư, tồn kho và phiếu nhập/cấp/xuất theo dự án.
- Báo cáo sản xuất, thi công, ảnh hiện trường và cập nhật tiến độ.
- Nghiệm thu có cấp duyệt; chưa duyệt thì không thể hoàn thành công việc.
- Kế toán ghi thu/chi, thanh toán, quyết toán; CEO xem lợi nhuận thực tế.
- Nhật ký kiểm soát, giới hạn dữ liệu và hành động theo vai trò/phòng ban.
- PWA responsive, cookie an toàn khi chạy HTTPS qua Cloudflare.
- KIEM-THU-RC.bat và KIEM-TRA-PHUC-HOI.bat để kiểm tra trước Production.

Bổ sung trong 1.3.1 RC:
- Mỗi dự án có nút Mở quy trình dự án.
- Hiển thị 6 bước liên tục từ dự toán đến quyết toán.
- Tự xác định Chưa thực hiện, Đang thực hiện, Hoàn thành từ PostgreSQL.
- Từng bước có nút mở đúng màn hình nghiệp vụ để tiếp tục xử lý.

Giai đoạn sau:
- Tên miền và Cloudflare Tunnel.
- PWA điện thoại.
- Tự động sao lưu theo lịch.

Mở cho điện thoại và máy khác trong LAN:
1. Đảm bảo thiết bị dùng cùng mạng Wi-Fi/LAN với máy CEO.
2. Nhấp đúp MO-TRUY-CAP-LAN.bat và chấp nhận quyền Administrator.
3. Mở địa chỉ được hiển thị trên điện thoại/máy khác.
4. Mỗi nhân viên dùng tài khoản riêng do CEO tạo trong mục Nhân sự & quyền.
5. Không mở trực tiếp cổng 3200 trên modem/router Internet.
