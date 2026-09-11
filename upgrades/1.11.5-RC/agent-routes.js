const fs=require('fs'),path=require('path');
const {planProject,readDxf}=require('./agent-planner');
module.exports=function registerAgent(app,{pool,auth,ceo,multer,createProjectFolders}){
 ceo=(r,s,n)=>r.session.user?.department==='Ban quản trị'?n():s.status(403).json({error:'Chỉ thành viên Ban quản trị được điều hành.'});
 const fileUpload=multer({dest:'/data/uploads',limits:{fileSize:20*1024*1024},fileFilter:(r,f,cb)=>cb(null,/\.(pdf|dxf|dwg)$/i.test(f.originalname))});
 const init=()=>pool.query(`CREATE TABLE IF NOT EXISTS agent_drawings(id BIGSERIAL PRIMARY KEY,file_key TEXT NOT NULL,file_name TEXT NOT NULL,file_type TEXT,file_size INT,analysis JSONB NOT NULL,created_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now());CREATE TABLE IF NOT EXISTS agent_proposals(id BIGSERIAL PRIMARY KEY,title TEXT NOT NULL,input JSONB NOT NULL,plan JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'Nháp',project_id INT REFERENCES projects(id),drawing_id BIGINT REFERENCES agent_drawings(id),created_by INT REFERENCES users(id),approved_by INT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now(),approved_at TIMESTAMPTZ);`);
 const buildPlan=async input=>{
  const plan=planProject(input);const staff=await pool.query("SELECT department,count(*)::int count FROM employees WHERE active=true AND is_seed=false GROUP BY department");
  for(const [department,need] of [['Sản xuất',plan.resources.crewProduction],['Thi công',plan.resources.crewInstallation]]){const available=staff.rows.find(x=>x.department===department)?.count||0;if(need>available)plan.warnings.push(`${department}: cần ${need} người, hiện có ${available}; bổ sung hoặc thuê ngoài.`);}
  const overlap=await pool.query("SELECT count(*)::int n FROM tasks WHERE status<>'Hoàn thành' AND due_date >= $1 AND (start_date IS NULL OR start_date <= $2)",[plan.startDate,plan.dueDate]);
  if(overlap.rows[0].n)plan.warnings.push(`Có ${overlap.rows[0].n} công việc hiện hữu trùng khoảng lịch. Chưa tự cân đối nguồn lực giữa các dự án.`);
  plan.warnings.push('Khi duyệt, công việc chưa có người phụ trách. Ban quản trị giao người trước triển khai.');
  return plan;
 };
 const log=(client,uid,action,id,note='')=>client.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,note) VALUES($1,$2,$3,$4,$5)',[uid,action,'agent_proposal',String(id),note]);
 app.get('/api/agent/status',auth,ceo,async(r,s)=>{
  const [staff,late,proposals,drawings,overBudget]=await Promise.all([
   pool.query("SELECT department,count(*)::int count FROM employees WHERE active=true AND is_seed=false GROUP BY department"),
   pool.query("SELECT t.id,t.title,t.department,t.due_date,p.code FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.due_date<CURRENT_DATE AND t.status<>'Hoàn thành' ORDER BY t.due_date LIMIT 30"),
   pool.query('SELECT id,title,status,project_id,created_at FROM agent_proposals ORDER BY id DESC LIMIT 50'),
   pool.query('SELECT id,file_name,created_at FROM agent_drawings ORDER BY id DESC LIMIT 30'),
   pool.query("SELECT p.id,p.code,p.name,p.approved_budget,COALESCE((SELECT SUM(amount) FROM transactions WHERE project_id=p.id AND type='Chi'),0)+COALESCE((SELECT SUM(amount) FROM depreciation_allocations WHERE project_id=p.id),0) cost FROM projects p WHERE p.approved_budget>0")]);
  s.json({engine:'Định mức và quy tắc; chưa kết nối mô hình AI sinh nội dung',staff:staff.rows,late:late.rows,proposals:proposals.rows,drawings:drawings.rows,overBudget:overBudget.rows.filter(p=>+p.cost>+p.approved_budget),database:'connected'});
 });
 app.post('/api/agent/drawings',auth,ceo,fileUpload.single('file'),async(r,s)=>{
  if(!r.file)return s.status(400).json({error:'Chọn PDF, ASCII DXF hoặc DWG (tối đa 20 MB).'});
  const f=r.file;let analysis;
  try{
   if(/\.dxf$/i.test(f.originalname))analysis=readDxf(fs.readFileSync(f.path,'utf8'),r.body.units);
   else if(/\.pdf$/i.test(f.originalname)){
    const {PDFParse}=require('pdf-parse');const parser=new PDFParse({data:fs.readFileSync(f.path)});
    try{const result=await parser.getText({first:10});analysis={kind:'PDF',text:String(result.text||'').slice(0,30000),pages:result.total,warnings:['Chỉ trích chữ tối đa 10 trang; chưa bóc kích thước/hình học hoặc nhận diện cấu kiện.','PDF dạng ảnh cần OCR và kiểm tra kỹ thuật.']};}finally{await parser.destroy();}
   }else analysis={kind:'DWG',warnings:['Đã lưu bản vẽ DWG. Chưa có bộ chuyển đổi DWG; hãy xuất PDF hoặc ASCII DXF để đọc trong Agent.']};
   const q=await pool.query('INSERT INTO agent_drawings(file_key,file_name,file_type,file_size,analysis,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,file_name,analysis',[f.filename,f.originalname,f.mimetype,f.size,JSON.stringify(analysis),r.session.user.id]);s.status(201).json(q.rows[0]);
  }catch(e){fs.unlink(f.path,()=>{});s.status(400).json({error:'Chưa đọc được bản vẽ: '+e.message});}
 });
 app.get('/api/agent/drawings/:id',auth,ceo,async(r,s)=>{const q=await pool.query('SELECT id,file_name,analysis FROM agent_drawings WHERE id=$1',[r.params.id]);if(!q.rowCount)return s.sendStatus(404);s.json(q.rows[0]);});
 app.get('/api/agent/drawings/:id/file',auth,ceo,async(r,s)=>{const q=await pool.query('SELECT * FROM agent_drawings WHERE id=$1',[r.params.id]);if(!q.rowCount)return s.sendStatus(404);s.download(path.join('/data/uploads',q.rows[0].file_key),q.rows[0].file_name);});
 app.post('/api/agent/preview',auth,ceo,async(r,s)=>{
  try{const plan=await buildPlan(r.body);
   s.json(plan);
  }catch(e){s.status(400).json({error:e.message});}
 });
 app.post('/api/agent/proposals',auth,ceo,async(r,s)=>{
  try{const plan=await buildPlan(r.body);let drawingId=r.body.drawingId||null;if(drawingId){const d=await pool.query('SELECT id FROM agent_drawings WHERE id=$1',[drawingId]);if(!d.rowCount)throw Error('Bản vẽ đã chọn không tồn tại.');}
   const q=await pool.query('INSERT INTO agent_proposals(title,input,plan,drawing_id,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[plan.name,JSON.stringify(r.body),JSON.stringify(plan),drawingId,r.session.user.id]);await log(pool,r.session.user.id,'Lưu phương án Agent',q.rows[0].id);s.status(201).json(q.rows[0]);
  }catch(e){s.status(400).json({error:e.message});}
 });
 app.get('/api/agent/proposals/:id',auth,ceo,async(r,s)=>{const q=await pool.query('SELECT * FROM agent_proposals WHERE id=$1',[r.params.id]);if(!q.rowCount)return s.sendStatus(404);s.json(q.rows[0]);});
 app.post('/api/agent/proposals/:id/approve',auth,ceo,async(r,s)=>{
  if(r.body.confirmed!==true)return s.status(400).json({error:'Thành viên Ban quản trị cần xác nhận đã kiểm tra khối lượng, giá, nhân sự và tiến độ.'});
  const c=await pool.connect();try{
   await c.query('BEGIN');const q=await c.query('SELECT * FROM agent_proposals WHERE id=$1 FOR UPDATE',[r.params.id]);if(!q.rowCount)throw Error('Không có phương án.');const draft=q.rows[0];
   if(draft.status==='Đã duyệt'){await c.query('COMMIT');return s.json({ok:true,projectId:draft.project_id,alreadyApproved:true});}
   const p=draft.plan,uid=r.session.user.id;
   const result=await c.query('INSERT INTO projects(code,name,client,start_date,due_date,approved_budget,manager,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[p.code,p.name,p.client,p.startDate,p.dueDate,p.costs.budget,r.session.user.name,uid]);const pid=result.rows[0].id;
   await createProjectFolders(c,pid);
   await c.query("INSERT INTO estimates(project_id,material_cost,labor_cost,machine_cost,subcontract_cost,overhead_cost,contingency_cost,status,updated_by,estimate_type,transport_cost,profit_amount,vat_rate) VALUES($1,$2,$3,$4,$5,$6,$7,'Đã duyệt',$8,'Giá nội bộ',$9,$10,$11)",[pid,p.costs.materialCost,p.costs.laborCost,p.costs.machineCost+p.costs.depreciation,p.costs.subcontractCost,p.costs.overheadCost,p.costs.contingencyCost,uid,p.costs.transportCost,p.costs.profit,p.costs.vatRate]);
   let dependencyId=null;for(const phase of p.gantt){const task=await c.query('INSERT INTO tasks(project_id,title,department,assignee,start_date,due_date,notes,planned_qty,quantity_unit,material_plan,labor_plan,machine_plan,dependency_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',[pid,phase.title,phase.department,'Chưa phân công',phase.startDate,phase.dueDate,'Tạo từ phương án Agent #'+draft.id+'. Ban quản trị giao người phụ trách trước triển khai.',1,'giai đoạn',phase.department==='Sản xuất'?p.items.map(x=>`${x.materialName}: ${x.required} ${x.materialUnit}`).join('\n'):'',phase.crew?`${phase.crew} người × ${phase.days} ngày`: 'Ban quản trị phân công',String(p.costs.machineCost),dependencyId,uid]);dependencyId=task.rows[0].id;}
   if(draft.drawing_id){const d=(await c.query('SELECT * FROM agent_drawings WHERE id=$1',[draft.drawing_id])).rows[0];const folder=(await c.query('SELECT id FROM project_folders WHERE project_id=$1 AND folder_order=2',[pid])).rows[0];const doc=await c.query('INSERT INTO project_documents(project_id,folder_id,title,created_by) VALUES($1,$2,$3,$4) RETURNING id',[pid,folder.id,d.file_name,uid]);await c.query('INSERT INTO document_revisions(document_id,revision_no,file_key,file_name,file_type,file_size,note,created_by) VALUES($1,1,$2,$3,$4,$5,$6,$7)',[doc.rows[0].id,d.file_key,d.file_name,d.file_type,d.file_size,'Bản vẽ nguồn của phương án Agent; khối lượng do Ban quản trị xác nhận.',uid]);}
   await c.query("UPDATE agent_proposals SET status='Đã duyệt',project_id=$1,approved_by=$2,approved_at=now() WHERE id=$3",[pid,uid,draft.id]);await log(c,uid,'Duyệt phương án Agent',draft.id,'Tạo dự án '+p.code);await c.query('COMMIT');s.json({ok:true,projectId:pid});
  }catch(e){await c.query('ROLLBACK');s.status(400).json({error:e.code==='23505'?'Mã dự án đã tồn tại; chưa tạo thêm dữ liệu.':e.message});}finally{c.release();}
 });
 app.patch('/api/tasks/:id/assignment',auth,ceo,async(r,s)=>{
  const task=(await pool.query('SELECT * FROM tasks WHERE id=$1',[r.params.id])).rows[0];if(!task)return s.sendStatus(404);
  const assignee=String(r.body.assignee||'Chưa phân công');if(assignee!=='Chưa phân công'){const e=await pool.query('SELECT name FROM users WHERE name=$1 AND department=$2 AND active=true UNION SELECT name FROM employees WHERE name=$1 AND department=$2 AND active=true AND is_seed=false',[assignee,task.department]);if(!e.rowCount)return s.status(400).json({error:'Người phụ trách phải đang hoạt động và thuộc đúng phòng ban công việc.'});}
  const q=await pool.query('UPDATE tasks SET assignee=$1,updated_at=now() WHERE id=$2 RETURNING *',[assignee,task.id]);await log(pool,r.session.user.id,'Giao người phụ trách',task.id,assignee);s.json(q.rows[0]);
 });
 return init;
};
