(()=>{
 if(typeof ME==='undefined'||ME.department!=='Ban quản trị')return;
 const wrap=document.createElement('div');wrap.className='workspaceActions';wrap.innerHTML='<button type="button" id="exportProjectXlsx">Xuất Excel dự án</button>';document.querySelector('#projects .pageTitle')?.append(wrap);
 document.getElementById('exportProjectXlsx')?.addEventListener('click',()=>{if(!D.projects?.length)return alert('Chưa có dự án để xuất.');const choices=D.projects.map((p,i)=>(i+1)+'. '+p.code+' · '+p.name).join('\n'),pick=prompt('Nhập số thứ tự dự án cần xuất:\n'+choices,'1'),p=D.projects[Number(pick)-1];if(!p)return alert('Số thứ tự không hợp lệ.');location.href='/api/export/project/'+p.id+'.xlsx';});
})();
