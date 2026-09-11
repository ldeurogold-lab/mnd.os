const express = require("express"),
  session = require("express-session"),
  pgSession = require("connect-pg-simple")(session),
  bcrypt = require("bcryptjs"),
  multer = require("multer"),
  path = require("path"),
  fs = require("fs"),
  helmet = require("helmet"),
  { Pool } = require("pg");
const app = express(),
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
fs.mkdirSync("/data/uploads", { recursive: true });
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    store: new pgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      maxAge: 43200000,
    },
  }),
);
app.use(express.static("public"));
const upload = multer({
    dest: "/data/uploads",
    limits: { fileSize: 20971520 },
    fileFilter: (r, f, cb) =>
      cb(
        null,
        /image|pdf|excel|spreadsheet|csv/.test(f.mimetype) ||
          /\.(pdf|xlsx?|csv)$/i.test(f.originalname),
      ),
  }),
  depts = ["Ban quản trị", "Kế toán", "Sản xuất", "Thi công"],
  roles = ["Điều hành", "Trưởng phòng", "Nhân viên"],
  safe = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    department: u.department,
    role: u.role,
  }),
  auth = (r, s, n) =>
    r.session.user ? n() : s.status(401).json({ error: "Vui lòng đăng nhập." }),
  ceo = (r, s, n) =>
    r.session.user?.role === "CEO"
      ? n()
      : s.status(403).json({ error: "Chỉ CEO được thực hiện." }),
  leaders = (u) => ["CEO", "Điều hành", "Trưởng phòng"].includes(u.role),
  manager = (r, s, n) =>
    leaders(r.session.user)
      ? n()
      : s.status(403).json({ error: "Không có quyền giao việc." }),
  finance = (r, s, n) =>
    ["CEO", "Điều hành"].includes(r.session.user?.role) ||
    r.session.user?.department === "Kế toán"
      ? n()
      : s.status(403).json({ error: "Không có quyền tài chính." });
async function init() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,department TEXT NOT NULL,role TEXT NOT NULL,active BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now());CREATE TABLE IF NOT EXISTS projects(id SERIAL PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,client TEXT DEFAULT '',status TEXT DEFAULT 'Mới',start_date DATE,due_date DATE,created_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now());CREATE TABLE IF NOT EXISTS tasks(id SERIAL PRIMARY KEY,project_id INT REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,department TEXT NOT NULL,assignee TEXT DEFAULT 'Chưa phân công',status TEXT DEFAULT 'Chờ triển khai',priority TEXT DEFAULT 'Bình thường',progress INT DEFAULT 0,due_date DATE,notes TEXT DEFAULT '',created_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());CREATE TABLE IF NOT EXISTS accounts(id SERIAL PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,bank_name TEXT DEFAULT '',account_number TEXT DEFAULT '',opening_balance BIGINT DEFAULT 0,active BOOLEAN DEFAULT true);CREATE TABLE IF NOT EXISTS transactions(id SERIAL PRIMARY KEY,tx_date DATE NOT NULL,type TEXT NOT NULL,category TEXT NOT NULL,amount BIGINT NOT NULL,account_id INT REFERENCES accounts(id),project_id INT REFERENCES projects(id),project_lot TEXT DEFAULT 'Toàn dự án',description TEXT NOT NULL,document_no TEXT DEFAULT '',created_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now());CREATE TABLE IF NOT EXISTS records(id SERIAL PRIMARY KEY,task_id INT REFERENCES tasks(id) ON DELETE CASCADE,record_type TEXT NOT NULL,note TEXT DEFAULT '',file_key TEXT,file_name TEXT,file_type TEXT,file_size INT DEFAULT 0,created_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now());CREATE TABLE IF NOT EXISTS employees(id SERIAL PRIMARY KEY,name TEXT NOT NULL,department TEXT NOT NULL,position TEXT DEFAULT 'Nhân viên',phone TEXT DEFAULT '',email TEXT DEFAULT '',active BOOLEAN DEFAULT true,is_seed BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT now());ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_value BIGINT DEFAULT 0;ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_budget BIGINT DEFAULT 0;ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager TEXT DEFAULT '';`,
  );
  const email = String(process.env.CEO_EMAIL || "").toLowerCase(),
    u = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
  if (!u.rowCount)
    await pool.query(
      "INSERT INTO users(name,email,password_hash,department,role) VALUES($1,$2,$3,$4,$5)",
      [
        process.env.CEO_NAME,
        email,
        await bcrypt.hash(process.env.CEO_PASSWORD, 12),
        "Ban quản trị",
        "CEO",
      ],
    );
  const ec = await pool.query("SELECT count(*)::int n FROM employees");
  if (!ec.rows[0].n) {
    for (const [d, n, p] of [
      ["Ban quản trị", 2, "Thành viên Ban quản trị"],
      ["Kế toán", 2, "Nhân viên kế toán"],
      ["Sản xuất", 6, "Nhân viên sản xuất"],
      ["Thi công", 6, "Nhân viên thi công"],
    ])
      for (let i = 1; i <= n; i++)
        await pool.query(
          "INSERT INTO employees(name,department,position,is_seed) VALUES($1,$2,$3,true)",
          [`${p} ${i}`, d, p],
        );
  }
}
async function initRc() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS estimates(id SERIAL PRIMARY KEY,project_id INT UNIQUE REFERENCES projects(id) ON DELETE CASCADE,material_cost BIGINT DEFAULT 0,labor_cost BIGINT DEFAULT 0,machine_cost BIGINT DEFAULT 0,subcontract_cost BIGINT DEFAULT 0,overhead_cost BIGINT DEFAULT 0,contingency_cost BIGINT DEFAULT 0,status TEXT DEFAULT 'Nháp',updated_by INT REFERENCES users(id),updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS materials(id SERIAL PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,unit TEXT NOT NULL,opening_qty NUMERIC(14,3) DEFAULT 0,min_qty NUMERIC(14,3) DEFAULT 0,unit_cost BIGINT DEFAULT 0,active BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS material_movements(id SERIAL PRIMARY KEY,movement_date DATE NOT NULL DEFAULT CURRENT_DATE,type TEXT NOT NULL,material_id INT REFERENCES materials(id),project_id INT REFERENCES projects(id),quantity NUMERIC(14,3) NOT NULL,note TEXT DEFAULT '',status TEXT DEFAULT 'Chờ duyệt',created_by INT REFERENCES users(id),approved_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now(),approved_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS inspections(id SERIAL PRIMARY KEY,task_id INT REFERENCES tasks(id) ON DELETE CASCADE,inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,result TEXT NOT NULL,note TEXT DEFAULT '',status TEXT DEFAULT 'Chờ duyệt',created_by INT REFERENCES users(id),approved_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now(),approved_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,user_id INT REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT,note TEXT DEFAULT '',created_at TIMESTAMPTZ DEFAULT now());
  `);
}
const audit = (u, action, entity, id, note = "") =>
  pool.query(
    "INSERT INTO audit_logs(user_id,action,entity,entity_id,note) VALUES($1,$2,$3,$4,$5)",
    [u, action, entity, String(id || ""), note],
  );
let attempts = new Map();
app.post("/api/login", async (r, s) => {
  const ip = r.ip,
    a = attempts.get(ip) || { n: 0, t: 0 };
  if (a.n >= 8 && Date.now() - a.t < 9e5)
    return s
      .status(429)
      .json({ error: "Đăng nhập sai nhiều lần. Thử lại sau 15 phút." });
  const q = await pool.query(
    "SELECT * FROM users WHERE email=$1 AND active=true",
    [String(r.body.email || "").toLowerCase()],
  );
  if (
    !q.rowCount ||
    !(await bcrypt.compare(
      String(r.body.password || ""),
      q.rows[0].password_hash,
    ))
  ) {
    attempts.set(ip, { n: a.n + 1, t: Date.now() });
    return s.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
  }
  attempts.delete(ip);
  r.session.user = safe(q.rows[0]);
  s.json(r.session.user);
});
app.post("/api/logout", (r, s) =>
  r.session.destroy(() => s.json({ ok: true })),
);
app.get("/api/me", (r, s) => s.json(r.session.user || null));
app.get("/api/dashboard", auth, async (r, s) => {
  const u = r.session.user,
    all = ["CEO", "Điều hành"].includes(u.role),
    where = all
      ? ""
      : u.role === "Trưởng phòng"
        ? " WHERE t.department=$1"
        : " WHERE t.department=$1 AND (t.assignee=$2 OR t.assignee='Chưa phân công')",
    params = all
      ? []
      : u.role === "Trưởng phòng"
        ? [u.department]
        : [u.department, u.name];
  const [p, t, e, rec] = await Promise.all([
    pool.query("SELECT * FROM projects ORDER BY id DESC"),
    pool.query(
      `SELECT t.*,p.code project_code,p.name project_name FROM tasks t JOIN projects p ON p.id=t.project_id${where} ORDER BY t.id DESC`,
      params,
    ),
    pool.query(
      "SELECT * FROM employees WHERE active=true ORDER BY department,id",
    ),
    pool.query(
      "SELECT r.*,u.name created_by_name,t.department FROM records r JOIN users u ON u.id=r.created_by JOIN tasks t ON t.id=r.task_id ORDER BY r.id DESC LIMIT 100",
    ),
  ]);
  let accounts = [],
    transactions = [],
    users = [];
  const canFinance = all || u.department === "Kế toán";
  if (canFinance) {
    accounts = (
      await pool.query(
        `SELECT a.*,a.opening_balance+COALESCE(SUM(CASE WHEN x.type='Thu' THEN x.amount ELSE -x.amount END),0) current_balance FROM accounts a LEFT JOIN transactions x ON x.account_id=a.id GROUP BY a.id ORDER BY a.id`,
      )
    ).rows;
    transactions = (
      await pool.query(
        `SELECT x.*,a.name account_name,p.name project_name FROM transactions x JOIN accounts a ON a.id=x.account_id LEFT JOIN projects p ON p.id=x.project_id ORDER BY x.tx_date DESC,x.id DESC LIMIT 300`,
      )
    ).rows;
  }
  if (u.role === "CEO")
    users = (
      await pool.query(
        "SELECT id,name,email,department,role,active FROM users ORDER BY department,name",
      )
    ).rows;
  const materialRows = canFinance
    ? materials.rows
    : materials.rows.map(({ unit_cost, ...x }) => x);
  s.json({
    projects: p.rows,
    tasks: t.rows,
    accounts,
    transactions,
    users,
    employees: all
      ? e.rows
      : e.rows.filter((x) => x.department === u.department),
    records: all
      ? rec.rows
      : rec.rows.filter((x) => x.department === u.department),
    permissions: {
      manageUsers: u.role === "CEO",
      manageEmployees: u.role === "CEO",
      manageTasks: leaders(u),
      finance: canFinance,
      viewAll: all,
    },
  });
});
app.post("/api/users", auth, ceo, async (r, s) => {
  const b = r.body;
  if (!b.name || !b.email || String(b.password || "").length < 10)
    return s
      .status(400)
      .json({ error: "Nhập đủ họ tên, email và mật khẩu tối thiểu 10 ký tự." });
  if (!roles.includes(b.role) || !depts.includes(b.department))
    return s
      .status(400)
      .json({ error: "Phòng ban hoặc vai trò không hợp lệ." });
  try {
    const q = await pool.query(
      "INSERT INTO users(name,email,password_hash,department,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,department,role,active",
      [
        b.name,
        String(b.email).toLowerCase(),
        await bcrypt.hash(b.password, 12),
        b.department,
        b.role,
      ],
    );
    s.status(201).json(q.rows[0]);
  } catch (e) {
    s.status(400).json({
      error:
        e.code === "23505" ? "Email đã tồn tại." : "Không thể tạo tài khoản.",
    });
  }
});
app.patch("/api/users/:id", auth, ceo, async (r, s) => {
  if (+r.params.id === r.session.user.id)
    return s.status(400).json({ error: "Không thể tự khóa tài khoản CEO." });
  s.json(
    (
      await pool.query(
        "UPDATE users SET active=$1 WHERE id=$2 RETURNING id,name,email,department,role,active",
        [!!r.body.active, r.params.id],
      )
    ).rows[0],
  );
});
app.post("/api/employees", auth, ceo, async (r, s) => {
  const b = r.body;
  if (!b.name || !depts.includes(b.department))
    return s.status(400).json({ error: "Nhập họ tên và phòng ban hợp lệ." });
  s.status(201).json(
    (
      await pool.query(
        "INSERT INTO employees(name,department,position,phone,email) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          b.name,
          b.department,
          b.position || "Nhân viên",
          b.phone || "",
          b.email || "",
        ],
      )
    ).rows[0],
  );
});
app.patch("/api/employees/:id", auth, ceo, async (r, s) => {
  s.json(
    (
      await pool.query(
        "UPDATE employees SET active=$1 WHERE id=$2 RETURNING *",
        [!!r.body.active, r.params.id],
      )
    ).rows[0],
  );
});
app.post("/api/projects", auth, manager, async (r, s) => {
  const b = r.body;
  try {
    s.status(201).json(
      (
        await pool.query(
          "INSERT INTO projects(code,name,client,start_date,due_date,contract_value,approved_budget,manager,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            b.code,
            b.name,
            b.client || "",
            b.startDate || null,
            b.dueDate || null,
            +b.contractValue || 0,
            +b.approvedBudget || 0,
            b.manager || "",
            r.session.user.id,
          ],
        )
      ).rows[0],
    );
  } catch (e) {
    s.status(400).json({
      error:
        e.code === "23505" ? "Mã dự án đã tồn tại." : "Không thể tạo dự án.",
    });
  }
});
app.post("/api/tasks", auth, manager, async (r, s) => {
  const b = r.body;
  if (
    r.session.user.role === "Trưởng phòng" &&
    b.department !== r.session.user.department
  )
    return s
      .status(403)
      .json({ error: "Trưởng phòng chỉ giao việc trong phòng mình." });
  s.status(201).json(
    (
      await pool.query(
        "INSERT INTO tasks(project_id,title,department,assignee,priority,due_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          b.projectId,
          b.title,
          b.department,
          b.assignee || "Chưa phân công",
          b.priority || "Bình thường",
          b.dueDate || null,
          b.notes || "",
          r.session.user.id,
        ],
      )
    ).rows[0],
  );
});
app.patch("/api/tasks/:id", auth, async (r, s) => {
  const q = await pool.query("SELECT * FROM tasks WHERE id=$1", [r.params.id]);
  if (!q.rowCount) return s.sendStatus(404);
  if (
    !["CEO", "Điều hành"].includes(r.session.user.role) &&
    q.rows[0].department !== r.session.user.department
  )
    return s.status(403).json({ error: "Không có quyền cập nhật." });
  if (
    r.session.user.role === "Nhân viên" &&
    q.rows[0].assignee !== r.session.user.name
  )
    return s
      .status(403)
      .json({ error: "Chỉ được cập nhật công việc được giao." });
  const order = [
    "Chờ triển khai",
    "Đang sản xuất",
    "Chờ thi công",
    "Đang thi công",
    "Nghiệm thu",
    "Hoàn thành",
  ];
  const current = q.rows[0].status,
    requested = r.body.status;
  if (
    requested !== current &&
    order.indexOf(requested) !== order.indexOf(current) + 1
  )
    return s
      .status(400)
      .json({ error: "Chỉ được chuyển sang công đoạn kế tiếp." });
  if (requested === "Hoàn thành") {
    const ok = await pool.query(
      "SELECT id FROM inspections WHERE task_id=$1 AND status='Đã duyệt' LIMIT 1",
      [r.params.id],
    );
    if (!ok.rowCount)
      return s.status(400).json({
        error: "Phải có biên bản nghiệm thu đã duyệt trước khi hoàn thành.",
      });
  }
  const updated = (
    await pool.query(
      "UPDATE tasks SET status=$1,progress=$2,updated_at=now() WHERE id=$3 RETURNING *",
      [
        r.body.status,
        Math.max(0, Math.min(100, +r.body.progress || 0)),
        r.params.id,
      ],
    )
  ).rows[0];
  await audit(
    r.session.user.id,
    "Cập nhật tiến độ",
    "task",
    r.params.id,
    `${current} → ${requested}; ${updated.progress}%`,
  );
  s.json(updated);
});
app.post("/api/accounts", auth, finance, async (r, s) => {
  const b = r.body;
  s.status(201).json(
    (
      await pool.query(
        "INSERT INTO accounts(name,type,bank_name,account_number,opening_balance) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          b.name,
          b.type,
          b.bankName || "",
          b.accountNumber || "",
          +b.openingBalance || 0,
        ],
      )
    ).rows[0],
  );
});
app.post("/api/transactions", auth, finance, async (r, s) => {
  const b = r.body;
  s.status(201).json(
    (
      await pool.query(
        "INSERT INTO transactions(tx_date,type,category,amount,account_id,project_id,project_lot,description,document_no,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          b.txDate,
          b.type,
          b.category,
          +b.amount,
          b.accountId,
          b.projectId || null,
          b.projectLot || "Toàn dự án",
          b.description,
          b.documentNo || "",
          r.session.user.id,
        ],
      )
    ).rows[0],
  );
});
app.post("/api/records", auth, upload.single("file"), async (r, s) => {
  const t = await pool.query("SELECT * FROM tasks WHERE id=$1", [
    r.body.taskId,
  ]);
  if (!t.rowCount) return s.sendStatus(404);
  if (
    !["CEO", "Điều hành"].includes(r.session.user.role) &&
    t.rows[0].department !== r.session.user.department
  )
    return s
      .status(403)
      .json({ error: "Không có quyền báo cáo công việc này." });
  if (
    r.session.user.role === "Nhân viên" &&
    t.rows[0].assignee !== r.session.user.name
  )
    return s
      .status(403)
      .json({ error: "Chỉ được báo cáo công việc được giao." });
  const f = r.file;
  s.status(201).json(
    (
      await pool.query(
        "INSERT INTO records(task_id,record_type,note,file_key,file_name,file_type,file_size,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          r.body.taskId,
          r.body.recordType,
          r.body.note || "",
          f?.filename || null,
          f?.originalname || null,
          f?.mimetype || null,
          f?.size || 0,
          r.session.user.id,
        ],
      )
    ).rows[0],
  );
});
app.get("/api/files/:key", auth, async (r, s) => {
  const q = await pool.query("SELECT * FROM records WHERE file_key=$1", [
    r.params.key,
  ]);
  if (!q.rowCount) return s.sendStatus(404);
  s.type(q.rows[0].file_type).download(
    path.join("/data/uploads", r.params.key),
    q.rows[0].file_name,
  );
});
app.get("/api/rc", auth, async (r, s) => {
  const u = r.session.user;
  const canFinance =
    ["CEO", "Điều hành"].includes(u.role) || u.department === "Kế toán";
  const [estimates, materials, movements, inspections, costs, logs] =
    await Promise.all([
      pool.query(
        "SELECT e.*,p.code project_code,p.name project_name,p.contract_value FROM estimates e JOIN projects p ON p.id=e.project_id ORDER BY e.id DESC",
      ),
      pool.query(
        `SELECT m.*,m.opening_qty+COALESCE(SUM(CASE WHEN x.status='Đã duyệt' AND x.type='Nhập' THEN x.quantity WHEN x.status='Đã duyệt' AND x.type IN ('Cấp','Xuất') THEN -x.quantity ELSE 0 END),0) stock_qty FROM materials m LEFT JOIN material_movements x ON x.material_id=m.id WHERE m.active=true GROUP BY m.id ORDER BY m.code`,
      ),
      pool.query(
        "SELECT x.*,m.code material_code,m.name material_name,m.unit,p.code project_code,u.name created_by_name FROM material_movements x JOIN materials m ON m.id=x.material_id LEFT JOIN projects p ON p.id=x.project_id JOIN users u ON u.id=x.created_by ORDER BY x.id DESC LIMIT 300",
      ),
      pool.query(
        "SELECT i.*,t.title task_title,t.department task_department,p.code project_code,u.name created_by_name FROM inspections i JOIN tasks t ON t.id=i.task_id JOIN projects p ON p.id=t.project_id JOIN users u ON u.id=i.created_by ORDER BY i.id DESC LIMIT 200",
      ),
      canFinance
        ? pool.query(
            "SELECT p.id project_id,p.code,p.name,p.contract_value,p.approved_budget,COALESCE(SUM(CASE WHEN x.type='Chi' THEN x.amount ELSE 0 END),0) actual_cost,COALESCE(SUM(CASE WHEN x.type='Thu' THEN x.amount ELSE 0 END),0) received FROM projects p LEFT JOIN transactions x ON x.project_id=p.id GROUP BY p.id ORDER BY p.id DESC",
          )
        : Promise.resolve({ rows: [] }),
      u.role === "CEO"
        ? pool.query(
            "SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100",
          )
        : Promise.resolve({ rows: [] }),
    ]);
  const seeAll = ["CEO", "Điều hành"].includes(u.role);
  const movementRows =
    seeAll ||
    u.department === "Kế toán" ||
    (u.role === "Trưởng phòng" && u.department === "Sản xuất")
      ? movements.rows
      : movements.rows.filter((x) => x.created_by === u.id);
  const inspectionRows = seeAll
    ? inspections.rows
    : u.role === "Trưởng phòng"
      ? inspections.rows.filter((x) => x.task_department === u.department)
      : inspections.rows.filter((x) => x.created_by === u.id);
  s.json({
    estimates: canFinance ? estimates.rows : [],
    materials: materialRows,
    movements: movementRows,
    inspections: inspectionRows,
    costs: costs.rows,
    auditLogs: logs.rows,
    permissions: {
      finance: canFinance,
      approve: seeAll || u.role === "Trưởng phòng",
      inventory:
        ["CEO", "Điều hành", "Trưởng phòng"].includes(u.role) ||
        u.department === "Kế toán",
    },
  });
});
app.post("/api/estimates", auth, finance, async (r, s) => {
  const b = r.body;
  if (
    b.status === "Đã duyệt" &&
    !["CEO", "Điều hành"].includes(r.session.user.role)
  )
    return s.status(403).json({
      error: "Kế toán được lập dự toán nhưng chỉ Ban quản trị được duyệt.",
    });
  const q = await pool.query(
    `INSERT INTO estimates(project_id,material_cost,labor_cost,machine_cost,subcontract_cost,overhead_cost,contingency_cost,status,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(project_id) DO UPDATE SET material_cost=$2,labor_cost=$3,machine_cost=$4,subcontract_cost=$5,overhead_cost=$6,contingency_cost=$7,status=$8,updated_by=$9,updated_at=now() RETURNING *`,
    [
      b.projectId,
      +b.materialCost || 0,
      +b.laborCost || 0,
      +b.machineCost || 0,
      +b.subcontractCost || 0,
      +b.overheadCost || 0,
      +b.contingencyCost || 0,
      b.status || "Nháp",
      r.session.user.id,
    ],
  );
  await audit(
    r.session.user.id,
    "Lưu dự toán",
    "estimate",
    q.rows[0].id,
    b.status || "Nháp",
  );
  s.status(201).json(q.rows[0]);
});
app.post("/api/materials", auth, async (r, s) => {
  if (!(
    ["CEO", "Điều hành", "Trưởng phòng"].includes(r.session.user.role) ||
    r.session.user.department === "Kế toán"
  ))
    return s.status(403).json({ error: "Không có quyền tạo vật tư." });
  const b = r.body,
    q = await pool.query(
      "INSERT INTO materials(code,name,unit,opening_qty,min_qty,unit_cost) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        b.code,
        b.name,
        b.unit,
        +b.openingQty || 0,
        +b.minQty || 0,
        +b.unitCost || 0,
      ],
    );
  await audit(
    r.session.user.id,
    "Tạo vật tư",
    "material",
    q.rows[0].id,
    b.code,
  );
  s.status(201).json(q.rows[0]);
});
app.post("/api/material-movements", auth, async (r, s) => {
  const b = r.body,
    isApprover =
      ["CEO", "Điều hành"].includes(r.session.user.role) ||
      r.session.user.department === "Kế toán" ||
      (r.session.user.role === "Trưởng phòng" &&
        r.session.user.department === "Sản xuất"),
    status = isApprover ? "Đã duyệt" : "Chờ duyệt";
  const q = await pool.query(
    "INSERT INTO material_movements(movement_date,type,material_id,project_id,quantity,note,status,created_by,approved_by,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $9::int IS NULL THEN NULL ELSE now() END) RETURNING *",
    [
      b.movementDate || new Date().toISOString().slice(0, 10),
      b.type,
      b.materialId,
      b.projectId || null,
      +b.quantity,
      b.note || "",
      status,
      r.session.user.id,
      isApprover ? r.session.user.id : null,
    ],
  );
  await audit(
    r.session.user.id,
    "Lập phiếu vật tư",
    "material_movement",
    q.rows[0].id,
    status,
  );
  s.status(201).json(q.rows[0]);
});
app.patch("/api/material-movements/:id/approve", auth, async (r, s) => {
  const canApprove =
    ["CEO", "Điều hành"].includes(r.session.user.role) ||
    r.session.user.department === "Kế toán" ||
    (r.session.user.role === "Trưởng phòng" &&
      r.session.user.department === "Sản xuất");
  if (!canApprove)
    return s.status(403).json({ error: "Không có quyền duyệt phiếu vật tư." });
  const q = await pool.query(
    "UPDATE material_movements SET status='Đã duyệt',approved_by=$1,approved_at=now() WHERE id=$2 AND status='Chờ duyệt' RETURNING *",
    [r.session.user.id, r.params.id],
  );
  if (!q.rowCount)
    return s.status(404).json({ error: "Phiếu không tồn tại hoặc đã xử lý." });
  await audit(
    r.session.user.id,
    "Duyệt phiếu vật tư",
    "material_movement",
    r.params.id,
  );
  s.json(q.rows[0]);
});
app.post("/api/inspections", auth, async (r, s) => {
  const b = r.body;
  const task = await pool.query(
    "SELECT department,assignee,status FROM tasks WHERE id=$1",
    [b.taskId],
  );
  if (!task.rowCount)
    return s.status(404).json({ error: "Công việc không tồn tại." });
  if (
    !["CEO", "Điều hành"].includes(r.session.user.role) &&
    task.rows[0].department !== r.session.user.department
  )
    return s
      .status(403)
      .json({ error: "Không có quyền lập nghiệm thu công việc này." });
  if (
    r.session.user.role === "Nhân viên" &&
    task.rows[0].assignee !== r.session.user.name
  )
    return s
      .status(403)
      .json({ error: "Chỉ được lập nghiệm thu cho việc được giao." });
  const q = await pool.query(
    "INSERT INTO inspections(task_id,inspection_date,result,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [
      b.taskId,
      b.inspectionDate || new Date().toISOString().slice(0, 10),
      b.result,
      b.note || "",
      r.session.user.id,
    ],
  );
  await audit(
    r.session.user.id,
    "Lập nghiệm thu",
    "inspection",
    q.rows[0].id,
    b.result,
  );
  s.status(201).json(q.rows[0]);
});
app.patch("/api/inspections/:id/approve", auth, async (r, s) => {
  const target = await pool.query(
    "SELECT t.department FROM inspections i JOIN tasks t ON t.id=i.task_id WHERE i.id=$1",
    [r.params.id],
  );
  if (!target.rowCount)
    return s.status(404).json({ error: "Biên bản không tồn tại." });
  const canApprove =
    ["CEO", "Điều hành"].includes(r.session.user.role) ||
    (r.session.user.role === "Trưởng phòng" &&
      r.session.user.department === target.rows[0].department);
  if (!canApprove)
    return s.status(403).json({
      error: "Chỉ trưởng phòng phụ trách hoặc Ban quản trị được duyệt.",
    });
  const q = await pool.query(
    "UPDATE inspections SET status=$1,approved_by=$2,approved_at=now() WHERE id=$3 AND status='Chờ duyệt' RETURNING *",
    [
      r.body.status === "Từ chối" ? "Từ chối" : "Đã duyệt",
      r.session.user.id,
      r.params.id,
    ],
  );
  if (!q.rowCount)
    return s
      .status(404)
      .json({ error: "Biên bản không tồn tại hoặc đã xử lý." });
  await audit(
    r.session.user.id,
    "Duyệt nghiệm thu",
    "inspection",
    r.params.id,
    q.rows[0].status,
  );
  s.json(q.rows[0]);
});
app.get("/health", (r, s) =>
  s.json({ status: "healthy", service: "mai-nha-dep-os", version: "1.3.1-rc" }),
);
app.use((e, r, s, n) => {
  console.error(e);
  s.status(500).json({ error: "Hệ thống không thể xử lý yêu cầu." });
});
init()
  .then(initRc)
  .then(() =>
    app.listen(process.env.PORT || 3200, "0.0.0.0", () =>
      console.log("MND OS 1.3.1 RC ready"),
    ),
  )
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
