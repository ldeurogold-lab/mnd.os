let D = {
    projects: [],
    tasks: [],
    accounts: [],
    transactions: [],
    users: [],
    employees: [],
    records: [],
    permissions: {},
  },
  ME = null,
  MODE = "";
const $ = (s) => document.querySelector(s),
  V = (n) => new Intl.NumberFormat("vi-VN").format(Number(n || 0)) + " đ",
  E = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
async function API(url, opt) {
  const r = await fetch(url, opt),
    d = await r.json();
  if (!r.ok) throw Error(d.error || "Có lỗi xảy ra");
  return d;
}
async function start() {
  ME = await API("/api/me");
  if (!ME) return;
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#userName").textContent = ME.name;
  $("#userRole").textContent = ME.role + " · " + ME.department;
  $("#headerName").textContent = ME.role === "CEO" ? "Giám đốc" : ME.name;
  $("#today").textContent = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  await load();
}
async function load() {
  D = await API("/api/dashboard");
  const rc = await API("/api/rc");
  D = {
    ...D,
    ...rc,
    permissions: D.permissions,
    rcPermissions: rc.permissions,
  };
  $(".usersNav").hidden = !D.permissions.manageUsers;
  $(".financeNav").hidden = !D.permissions.finance;
  document
    .querySelectorAll(".manageTask")
    .forEach((x) => (x.hidden = !D.permissions.manageTasks));
  render();
}
const cards = (a) =>
    a
      .map((x) => `<article><span>${x[0]}</span><b>${x[1]}</b></article>`)
      .join(""),
  empty = (t) => `<div class="empty">${t}</div>`;
function render() {
  const inc = D.transactions
      .filter((x) => x.type === "Thu")
      .reduce((s, x) => s + +x.amount, 0),
    out = D.transactions
      .filter((x) => x.type === "Chi")
      .reduce((s, x) => s + +x.amount, 0),
    bal = D.accounts.reduce((s, x) => s + +x.current_balance, 0);
  $("#summary").innerHTML = cards([
    ["Tổng công việc", D.tasks.length],
    [
      "Đang sản xuất",
      D.tasks.filter((x) => x.status === "Đang sản xuất").length,
    ],
    [
      "Đang thi công",
      D.tasks.filter((x) => x.status === "Đang thi công").length,
    ],
    [
      "Việc khẩn cấp",
      D.tasks.filter(
        (x) => x.priority === "Khẩn cấp" && x.status !== "Hoàn thành",
      ).length,
    ],
  ]);
  $("#overviewKpis").innerHTML = cards([
    ["Dự án", D.projects.length],
    ["Tổng số dư", D.permissions.finance ? V(bal) : "—"],
    ["Thu trừ chi", D.permissions.finance ? V(inc - out) : "—"],
    ["Nhân sự", D.employees.length + 1],
  ]);
  board();
  overview();
  projects();
  finance();
  people();
  records();
  dept("Sản xuất", "#productionList");
  dept("Thi công", "#constructionList");
  renderRc();
}
function card(t) {
  return `<article><small>${E(t.project_code)}</small><h4>${E(t.title)}</h4><p>${E(t.project_name)}</p><span>${E(t.department)} · ${E(t.assignee)}</span><progress value="${+t.progress}" max="100"></progress><b>${+t.progress}% · Hạn ${t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : "—"}</b><button onclick="record(${t.id})">📎 Báo cáo / ảnh / hồ sơ</button>${t.status === "Nghiệm thu" ? `<button onclick="openInspection(${t.id})">Lập nghiệm thu</button>` : ""}${t.status !== "Hoàn thành" ? `<button onclick="advance(${t.id},'${t.status}',${+t.progress})">Cập nhật & chuyển công đoạn ›</button>` : ""}</article>`;
}
function board() {
  const q = ($("#taskSearch").value || "").toLowerCase(),
    tasks = D.tasks.filter((t) =>
      (t.title + t.project_name + t.assignee).toLowerCase().includes(q),
    ),
    sts = [
      "Chờ triển khai",
      "Đang sản xuất",
      "Chờ thi công",
      "Đang thi công",
      "Nghiệm thu",
      "Hoàn thành",
    ];
  $("#board").innerHTML = sts
    .map(
      (s) =>
        `<div class="column"><h3>${s}<i>${tasks.filter((x) => x.status === s).length}</i></h3>${tasks
          .filter((x) => x.status === s)
          .map(card)
          .join("")}</div>`,
    )
    .join("");
}
function overview() {
  const ds = ["Ban quản trị", "Kế toán", "Sản xuất", "Thi công"];
  $("#orgText").textContent =
    `${D.employees.length + 1} nhân sự · 4 bộ phận · mỗi bộ phận có người điều hành`;
  $("#orgCards").innerHTML = ds
    .map(
      (d) =>
        `<article><b>${d}</b><h2>${D.employees.filter((e) => e.department === d).length + (d === "Ban quản trị" ? 1 : 0)} người</h2><span>${d === "Ban quản trị" ? "CEO / Trưởng ban" : d === "Kế toán" ? "Phụ trách kế toán" : d === "Sản xuất" ? "Quản đốc sản xuất" : "Chỉ huy thi công"}</span></article>`,
    )
    .join("");
  $("#overviewProjects").innerHTML =
    D.projects
      .map(
        (p) =>
          `<div class="projectRow"><b>${E(p.code)} · ${E(p.name)}</b><p>${E(p.client)} · ${E(p.status)}</p></div>`,
      )
      .join("") || empty("Chưa có dự án");
  const a = D.tasks.filter(
    (t) =>
      ((t.due_date && new Date(t.due_date) < new Date()) ||
        t.priority === "Khẩn cấp") &&
      t.status !== "Hoàn thành",
  );
  $("#alerts").innerHTML =
    a
      .map(
        (t) =>
          `<div class="alertItem"><b>${t.priority === "Khẩn cấp" ? "Khẩn cấp" : "Chậm tiến độ"}: ${E(t.title)}</b><p>${E(t.project_name)}</p></div>`,
      )
      .join("") || empty("Không có cảnh báo");
}
function projects() {
  $("#projectList").innerHTML =
    D.projects
      .map(
        (p) =>
          `<article><span>${E(p.code)}</span><h3>${E(p.name)}</h3><p>${E(p.client)}</p><b>${E(p.status)}</b><p>Hợp đồng: ${V(p.contract_value)}<br>Ngân sách: ${V(p.approved_budget)}</p><button class="primary" onclick="openWorkflow(${p.id})">Mở quy trình dự án ›</button></article>`,
      )
      .join("") || empty("Chưa có dự án");
  $("#estimateList").innerHTML = D.projects.length
    ? `<table><thead><tr><th>Dự án</th><th>Khách hàng</th><th>Hợp đồng</th><th>Ngân sách</th><th>Chênh lệch</th></tr></thead><tbody>${D.projects.map((p) => `<tr><td>${E(p.code)} · ${E(p.name)}</td><td>${E(p.client)}</td><td>${V(p.contract_value)}</td><td>${V(p.approved_budget)}</td><td>${V(+p.contract_value - +p.approved_budget)}</td></tr>`).join("")}</tbody></table>`
    : empty("Chưa có dự toán");
}
function dept(d, target) {
  const x = D.tasks.filter((t) => t.department === d);
  $(target).innerHTML = x.map(card).join("") || empty("Chưa có công việc");
}
function records() {
  $("#recordsList").innerHTML =
    D.records
      .map(
        (r) =>
          `<div class="recordItem"><b>${E(r.record_type)}</b><p>${E(r.note || r.file_name || "Không có ghi chú")} · ${E(r.created_by_name)}</p>${r.file_key ? `<a href="/api/files/${encodeURIComponent(r.file_key)}">Mở tệp ${E(r.file_name)}</a>` : ""}</div>`,
      )
      .join("") || empty("Chưa có hồ sơ");
}
function finance() {
  $("#accounts").innerHTML =
    D.accounts
      .map(
        (a) =>
          `<article><span>${E(a.type)}</span><b>${E(a.name)}</b><strong>${V(a.current_balance)}</strong></article>`,
      )
      .join("") || empty("Chưa có tài khoản");
  $("#transactions").innerHTML = D.transactions
    .map(
      (x) =>
        `<tr><td>${new Date(x.tx_date).toLocaleDateString("vi-VN")}</td><td>${E(x.description)}</td><td>${E(x.project_name || "Toàn công ty")}<small>${E(x.project_lot)}</small></td><td>${E(x.account_name)}</td><td>${E(x.type)}</td><td class="${x.type === "Thu" ? "green" : "red"}">${x.type === "Thu" ? "+" : "-"}${V(x.amount)}</td></tr>`,
    )
    .join("");
}
function renderRc() {
  const totalStock = D.materials.reduce((s, x) => s + (+x.stock_qty || 0), 0),
    low = D.materials.filter((x) => +x.stock_qty <= +x.min_qty).length;
  $("#stockSummary").innerHTML = cards([
    ["Mã vật tư", D.materials.length],
    ["Tổng lượng tồn", totalStock.toLocaleString("vi-VN")],
    ["Cảnh báo tồn thấp", low],
    [
      "Phiếu chờ duyệt",
      D.movements.filter((x) => x.status === "Chờ duyệt").length,
    ],
  ]);
  $("#materialsList").innerHTML = D.materials.length
    ? `<h3>Tồn kho vật tư</h3><table><thead><tr><th>Mã</th><th>Vật tư</th><th>ĐVT</th><th>Tồn</th><th>Tối thiểu</th><th>Đơn giá</th></tr></thead><tbody>${D.materials.map((x) => `<tr><td>${E(x.code)}</td><td>${E(x.name)}</td><td>${E(x.unit)}</td><td class="${+x.stock_qty <= +x.min_qty ? "red" : ""}">${+x.stock_qty}</td><td>${+x.min_qty}</td><td>${V(x.unit_cost)}</td></tr>`).join("")}</tbody></table>`
    : empty("Chưa có danh mục vật tư");
  $("#movementsList").innerHTML = D.movements.length
    ? `<h3>Nhập – xuất – cấp vật tư</h3><table><thead><tr><th>Ngày</th><th>Loại</th><th>Vật tư</th><th>Dự án</th><th>Số lượng</th><th>Trạng thái</th><th></th></tr></thead><tbody>${D.movements.map((x) => `<tr><td>${new Date(x.movement_date).toLocaleDateString("vi-VN")}</td><td>${E(x.type)}</td><td>${E(x.material_code)} · ${E(x.material_name)}</td><td>${E(x.project_code || "Kho chung")}</td><td>${+x.quantity} ${E(x.unit)}</td><td>${E(x.status)}</td><td>${x.status === "Chờ duyệt" && D.rcPermissions.approve ? `<button onclick="approveMovement(${x.id})">Duyệt</button>` : ""}</td></tr>`).join("")}</tbody></table>`
    : empty("Chưa có phiếu vật tư");
  const est = new Map(D.estimates.map((x) => [+x.project_id, x]));
  $("#estimateList").innerHTML = D.projects.length
    ? `<table><thead><tr><th>Dự án</th><th>Hợp đồng</th><th>Vật tư</th><th>Nhân công</th><th>Máy/KH</th><th>Chi phí khác</th><th>Lợi nhuận dự kiến</th><th>Trạng thái</th></tr></thead><tbody>${D.projects
        .map((p) => {
          const x = est.get(+p.id) || {},
            cost =
              +x.material_cost +
              +x.labor_cost +
              +x.machine_cost +
              +x.subcontract_cost +
              +x.overhead_cost +
              +x.contingency_cost;
          return `<tr><td>${E(p.code)} · ${E(p.name)}</td><td>${V(p.contract_value)}</td><td>${V(x.material_cost)}</td><td>${V(x.labor_cost)}</td><td>${V(x.machine_cost)}</td><td>${V(+x.subcontract_cost + +x.overhead_cost + +x.contingency_cost)}</td><td class="${+p.contract_value - cost < 0 ? "red" : "green"}">${V(+p.contract_value - cost)}</td><td>${E(x.status || "Chưa lập")}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : empty("Chưa có dự án");
  $("#projectCosts").innerHTML = D.costs.length
    ? `<h3>Chi phí và lợi nhuận thực tế theo dự án</h3><table><thead><tr><th>Dự án</th><th>Hợp đồng</th><th>Ngân sách</th><th>Thực chi</th><th>Đã thu</th><th>Lợi nhuận tạm tính</th></tr></thead><tbody>${D.costs.map((x) => `<tr><td>${E(x.code)} · ${E(x.name)}</td><td>${V(x.contract_value)}</td><td>${V(x.approved_budget)}</td><td>${V(x.actual_cost)}</td><td>${V(x.received)}</td><td class="${+x.contract_value - +x.actual_cost < 0 ? "red" : "green"}">${V(+x.contract_value - +x.actual_cost)}</td></tr>`).join("")}</tbody></table>`
    : empty("Chưa có dữ liệu chi phí dự án");
  $("#inspectionList").innerHTML =
    D.inspections
      .map(
        (x) =>
          `<div class="recordItem"><b>${E(x.project_code)} · ${E(x.task_title)}</b><p>${E(x.result)} · ${E(x.note)} · ${E(x.status)}</p>${x.status === "Chờ duyệt" && D.rcPermissions.approve ? `<button onclick="approveInspection(${x.id},'Đã duyệt')">Duyệt</button> <button onclick="approveInspection(${x.id},'Từ chối')">Từ chối</button>` : ""}</div>`,
      )
      .join("") || empty("Không có nghiệm thu chờ xử lý");
  $("#auditList").innerHTML =
    D.auditLogs
      .map(
        (x) =>
          `<div class="recordItem"><b>${E(x.action)} · ${E(x.entity)}</b><p>${E(x.user_name || "")} · ${new Date(x.created_at).toLocaleString("vi-VN")} · ${E(x.note)}</p></div>`,
      )
      .join("") || empty("Chỉ CEO xem được nhật ký kiểm soát");
}
function people() {
  const ds = ["Ban quản trị", "Kế toán", "Sản xuất", "Thi công"];
  $("#departmentSummary").innerHTML = ds
    .map(
      (d) =>
        `<article><span>${d}</span><b>${D.employees.filter((e) => e.department === d).length + (d === "Ban quản trị" ? 1 : 0)} người</b></article>`,
    )
    .join("");
  $("#employeeList").innerHTML = D.employees
    .map(
      (e) =>
        `<tr><td><b>${E(e.name)}</b></td><td>${E(e.department)}</td><td>${E(e.position)}</td><td>${E(e.phone || "—")}</td><td><span class="pill on">Đang làm việc</span></td><td><button class="smallBtn" onclick="toggleEmployee(${e.id})">Cho nghỉ</button></td></tr>`,
    )
    .join("");
  $("#userList").innerHTML = D.users
    .map(
      (u) =>
        `<tr><td><b>${E(u.name)}</b></td><td>${E(u.email)}</td><td>${E(u.department)}</td><td>${E(u.role)}</td><td><span class="pill ${u.active ? "on" : "off"}">${u.active ? "Hoạt động" : "Đã khóa"}</span></td><td>${u.role !== "CEO" ? `<button class="smallBtn" onclick="toggleUser(${u.id},${!u.active})">${u.active ? "Khóa" : "Mở"}</button>` : ""}</td></tr>`,
    )
    .join("");
}
const field = (l, n, type = "text", extra = "") =>
    `<label>${l}<input name="${n}" type="${type}" ${extra}></label>`,
  select = (l, n, o) =>
    `<label>${l}<select name="${n}">${o.map((x) => `<option value="${x[0] ?? x}">${x[1] ?? x}</option>`).join("")}</select></label>`;
function openModal(m) {
  MODE = m;
  $("#formError").textContent = "";
  const ds = ["Ban quản trị", "Kế toán", "Sản xuất", "Thi công"];
  if (m === "project") {
    $("#modalTitle").textContent = "Tạo dự án";
    $("#fields").innerHTML =
      field("Mã dự án", "code", "text", "required") +
      field("Tên dự án", "name", "text", "required") +
      field("Khách hàng", "client") +
      field("Người phụ trách", "manager") +
      field("Giá trị hợp đồng", "contractValue", "number") +
      field("Ngân sách duyệt", "approvedBudget", "number") +
      field("Ngày bắt đầu", "startDate", "date") +
      field("Ngày hoàn thành", "dueDate", "date");
  }
  if (m === "task") {
    $("#modalTitle").textContent = "Giao việc mới";
    $("#fields").innerHTML =
      select(
        "Dự án",
        "projectId",
        D.projects.map((p) => [p.id, p.code + " · " + p.name]),
      ) +
      field("Nội dung", "title", "text", "required") +
      select("Bộ phận", "department", ds) +
      select("Người phụ trách", "assignee", [
        ["Chưa phân công", "Chưa phân công"],
        ...D.employees.map((e) => [e.name, e.name + " · " + e.department]),
      ]) +
      select("Ưu tiên", "priority", ["Bình thường", "Cao", "Khẩn cấp"]) +
      field("Hạn hoàn thành", "dueDate", "date", "required") +
      field("Ghi chú", "notes");
  }
  if (m === "account") {
    $("#modalTitle").textContent = "Thêm tài khoản";
    $("#fields").innerHTML =
      field("Tên tài khoản", "name", "text", "required") +
      select("Loại", "type", ["Tiền mặt", "Ngân hàng"]) +
      field("Ngân hàng", "bankName") +
      field("Số tài khoản", "accountNumber") +
      field("Số dư đầu kỳ", "openingBalance", "number");
  }
  if (m === "transaction") {
    $("#modalTitle").textContent = "Ghi nhận thu–chi";
    $("#fields").innerHTML =
      field("Ngày", "txDate", "date", "required") +
      select("Loại", "type", ["Thu", "Chi"]) +
      select(
        "Tài khoản",
        "accountId",
        D.accounts.map((a) => [a.id, a.name]),
      ) +
      select("Dự án", "projectId", [
        ["", "Toàn công ty"],
        ...D.projects.map((p) => [p.id, p.name]),
      ]) +
      field("Lô dự án", "projectLot") +
      field("Nhóm chi phí", "category", "text", "required") +
      field("Số tiền", "amount", "number", "required") +
      field("Nội dung", "description", "text", "required") +
      field("Số chứng từ", "documentNo");
  }
  if (m === "employee") {
    $("#modalTitle").textContent = "Thêm nhân sự";
    $("#fields").innerHTML =
      field("Họ tên", "name", "text", "required") +
      select("Phòng ban", "department", ds) +
      field("Chức vụ", "position") +
      field("Điện thoại", "phone") +
      field("Email", "email", "email");
  }
  if (m === "user") {
    $("#modalTitle").textContent = "Tạo tài khoản";
    $("#fields").innerHTML =
      field("Họ tên", "name", "text", "required") +
      field("Email", "email", "email", "required") +
      field("Mật khẩu", "password", "password", 'required minlength="10"') +
      select("Phòng ban", "department", ds) +
      select("Vai trò", "role", ["Điều hành", "Trưởng phòng", "Nhân viên"]);
  }
  if (m === "estimate") {
    $("#modalTitle").textContent = "Lập dự toán dự án";
    $("#fields").innerHTML =
      select(
        "Dự án",
        "projectId",
        D.projects.map((p) => [p.id, p.code + " · " + p.name]),
      ) +
      field("Chi phí vật tư", "materialCost", "number", "required") +
      field("Chi phí nhân công", "laborCost", "number", "required") +
      field("Máy móc và khấu hao", "machineCost", "number") +
      field("Thầu phụ", "subcontractCost", "number") +
      field("Chi phí chung", "overheadCost", "number") +
      field("Dự phòng phát sinh", "contingencyCost", "number") +
      select("Trạng thái", "status", ["Nháp", "Chờ duyệt", "Đã duyệt"]);
  }
  if (m === "material") {
    $("#modalTitle").textContent = "Thêm vật tư";
    $("#fields").innerHTML =
      field("Mã vật tư", "code", "text", "required") +
      field("Tên vật tư", "name", "text", "required") +
      field("Đơn vị tính", "unit", "text", "required") +
      field("Tồn đầu kỳ", "openingQty", "number", 'step="0.001"') +
      field("Tồn tối thiểu", "minQty", "number", 'step="0.001"') +
      field("Đơn giá", "unitCost", "number");
  }
  if (m === "movement") {
    $("#modalTitle").textContent = "Nhập / cấp vật tư";
    $("#fields").innerHTML =
      field("Ngày", "movementDate", "date", "required") +
      select("Loại phiếu", "type", ["Nhập", "Cấp", "Xuất"]) +
      select(
        "Vật tư",
        "materialId",
        D.materials.map((x) => [x.id, x.code + " · " + x.name]),
      ) +
      select("Dự án", "projectId", [
        ["", "Kho chung"],
        ...D.projects.map((p) => [p.id, p.code + " · " + p.name]),
      ]) +
      field(
        "Số lượng",
        "quantity",
        "number",
        'required step="0.001" min="0.001"',
      ) +
      field("Ghi chú", "note");
  }
  if (m === "inspection") {
    $("#modalTitle").textContent = "Lập biên bản nghiệm thu";
    $("#fields").innerHTML =
      select(
        "Công việc",
        "taskId",
        D.tasks.map((t) => [t.id, t.project_code + " · " + t.title]),
      ) +
      field("Ngày nghiệm thu", "inspectionDate", "date", "required") +
      select("Kết quả", "result", ["Đạt", "Đạt có điều kiện", "Không đạt"]) +
      field("Nội dung / tồn tại", "note");
  }
  modal.showModal();
}
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await API("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    await start();
  } catch (x) {
    $("#loginError").textContent = x.message;
  }
};
$("#dataForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const p = {
      project: "projects",
      task: "tasks",
      account: "accounts",
      transaction: "transactions",
      employee: "employees",
      user: "users",
      estimate: "estimates",
      material: "materials",
      movement: "material-movements",
      inspection: "inspections",
    };
    await API("/api/" + p[MODE], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    modal.close();
    e.currentTarget.reset();
    await load();
  } catch (x) {
    $("#formError").textContent = x.message;
  }
};
async function advance(id, s, p) {
  const a = [
      "Chờ triển khai",
      "Đang sản xuất",
      "Chờ thi công",
      "Đang thi công",
      "Nghiệm thu",
      "Hoàn thành",
    ],
    status = a[a.indexOf(s) + 1];
  await API("/api/tasks/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      progress: status === "Hoàn thành" ? 100 : Math.min(95, p + 20),
    }),
  });
  load();
}
async function approveMovement(id) {
  await API(`/api/material-movements/${id}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  load();
}
async function approveInspection(id, status) {
  await API(`/api/inspections/${id}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  load();
}
function goTo(view) {
  const b = document.querySelector(`nav button[data-view="${view}"]`);
  if (b) b.click();
  workflowModal.close();
}
function openWorkflow(projectId) {
  const p = D.projects.find((x) => +x.id === +projectId);
  if (!p) return;
  const est = D.estimates.find((x) => +x.project_id === +projectId),
    mov = D.movements.filter(
      (x) => +x.project_id === +projectId && x.status === "Đã duyệt",
    ),
    prod = D.tasks.filter(
      (x) => +x.project_id === +projectId && x.department === "Sản xuất",
    ),
    cons = D.tasks.filter(
      (x) => +x.project_id === +projectId && x.department === "Thi công",
    ),
    ins = D.inspections.filter(
      (x) => x.project_code === p.code && x.status === "Đã duyệt",
    ),
    cost = D.costs.find((x) => +x.project_id === +projectId);
  const allDone = (a) =>
      a.length > 0 && a.every((x) => x.status === "Hoàn thành"),
    avg = (a) =>
      a.length
        ? Math.round(a.reduce((s, x) => s + (+x.progress || 0), 0) / a.length)
        : 0;
  const steps = [
    {
      name: "Dự án & dự toán",
      detail: est
        ? `${est.status} · Tổng dự toán ${V(+est.material_cost + +est.labor_cost + +est.machine_cost + +est.subcontract_cost + +est.overhead_cost + +est.contingency_cost)}`
        : "Chưa lập dự toán",
      done: est?.status === "Đã duyệt",
      started: !!est,
      view: "estimate",
    },
    {
      name: "Cấp vật tư",
      detail: mov.length
        ? `${mov.length} phiếu đã duyệt`
        : "Chưa có vật tư được cấp",
      done: mov.length > 0,
      started: mov.length > 0,
      view: "warehouse",
    },
    {
      name: "Sản xuất",
      detail: prod.length
        ? `${prod.length} việc · tiến độ ${avg(prod)}%`
        : "Chưa giao việc sản xuất",
      done: allDone(prod),
      started: prod.length > 0,
      view: "production",
    },
    {
      name: "Thi công",
      detail: cons.length
        ? `${cons.length} việc · tiến độ ${avg(cons)}%`
        : "Chưa giao việc thi công",
      done: allDone(cons),
      started: cons.length > 0,
      view: "construction",
    },
    {
      name: "Nghiệm thu",
      detail: ins.length
        ? `${ins.length} biên bản đã duyệt`
        : "Chưa có nghiệm thu được duyệt",
      done: ins.length > 0,
      started: D.inspections.some((x) => x.project_code === p.code),
      view: "rules",
    },
    {
      name: "Thanh toán & quyết toán",
      detail: cost
        ? `Đã thu ${V(cost.received)} · Thực chi ${V(cost.actual_cost)} · LN ${V(+cost.contract_value - +cost.actual_cost)}`
        : "Chưa có số liệu kế toán",
      done:
        !!cost &&
        +cost.contract_value > 0 &&
        +cost.received >= +cost.contract_value,
      started: !!cost && (+cost.received > 0 || +cost.actual_cost > 0),
      view: "finance",
    },
  ];
  const done = steps.filter((x) => x.done).length,
    current = steps.findIndex((x) => !x.done);
  $("#workflowContent").innerHTML =
    `<div class="workflowHead"><small>${E(p.code)}</small><h2>${E(p.name)}</h2><p>${E(p.client)} · Phụ trách ${E(p.manager || "Chưa phân công")}</p><b>Hoàn thành ${done}/6 bước</b><div class="workflowProgress"><i style="width:${Math.round((done / 6) * 100)}%"></i></div></div><div class="workflowSteps">${steps.map((x, i) => `<div class="workflowStep ${x.done ? "done" : i === current ? "active" : ""}"><div class="stepNo">${x.done ? "✓" : i + 1}</div><div><b>${x.name}</b><span>${x.detail}</span></div><button onclick="goTo('${x.view}')">${x.done ? "Xem hồ sơ" : x.started ? "Tiếp tục" : "Thực hiện"}</button></div>`).join("")}</div>`;
  workflowModal.showModal();
}
function record(id) {
  $("#recordTaskId").value = id;
  recordModal.showModal();
}
function openInspection(id) {
  openModal("inspection");
  const f = $("#dataForm").elements.taskId;
  if (f) f.value = String(id);
}
async function toggleUser(id, active) {
  await API("/api/users/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  load();
}
async function toggleEmployee(id) {
  if (confirm("Cho nhân sự này nghỉ hoạt động?")) {
    await API("/api/employees/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: '{"active":false}',
    });
    load();
  }
}
$("#recordForm").onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch("/api/records", {
      method: "POST",
      body: new FormData(e.currentTarget),
    }),
    d = await r.json();
  if (!r.ok) return alert(d.error);
  recordModal.close();
  e.currentTarget.reset();
  load();
};
document.querySelectorAll("nav button").forEach(
  (x) =>
    (x.onclick = () => {
      document
        .querySelectorAll("nav button")
        .forEach((y) => y.classList.remove("active"));
      x.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
      $("#" + x.dataset.view).hidden = false;
      document.body.classList.remove("menuOpen");
    }),
);
$("#mobileMenu").onclick = () => document.body.classList.toggle("menuOpen");
$("#refresh").onclick = load;
$("#taskSearch").oninput = board;
$("#logout").onclick = () =>
  API("/api/logout", { method: "POST" }).then(() => location.reload());
start();
