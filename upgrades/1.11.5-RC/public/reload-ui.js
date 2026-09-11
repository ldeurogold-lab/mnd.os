(()=>{
  const button=document.createElement('button');
  button.id='globalReloadButton';
  button.type='button';
  button.setAttribute('aria-label','Tải lại dữ liệu mới nhất');
  button.title='Nạp dữ liệu mới nhất từ hệ thống';
  button.innerHTML='<span aria-hidden="true">↻</span> <b>Tải lại</b>';
  button.hidden=true;
  let timer;
  const message=text=>{
    button.querySelector('b').textContent=text;
    clearTimeout(timer);
    if(text!=='Đang tải…')timer=setTimeout(()=>button.querySelector('b').textContent='Tải lại',1800);
  };
  button.onclick=async()=>{
    if(button.disabled)return;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    message('Đang tải…');
    try{
      if(typeof load!=='function')throw Error('Chức năng tải dữ liệu chưa sẵn sàng.');
      await load();
      message('Đã cập nhật');
    }catch(error){
      console.error('Tải lại dữ liệu lỗi',error);
      message('Tải lại lỗi');
    }finally{
      button.disabled=false;
      button.removeAttribute('aria-busy');
    }
  };
  document.body.append(button);
  const app=document.getElementById('app');
  const syncVisibility=()=>button.hidden=!app||app.hidden;
  if(app)new MutationObserver(syncVisibility).observe(app,{attributes:true,attributeFilter:['hidden']});
  syncVisibility();
  const style=document.createElement('style');
  style.textContent='#globalReloadButton{position:fixed;z-index:1000;top:18px;right:20px;display:flex;align-items:center;gap:7px;padding:10px 14px;border:1px solid #c8d7eb;border-radius:10px;background:#fff;color:#164f96;box-shadow:0 5px 18px #163b6526;font:inherit;cursor:pointer}#globalReloadButton[hidden]{display:none}#globalReloadButton:hover{background:#edf5ff}#globalReloadButton:disabled{cursor:wait;opacity:.72}#globalReloadButton[aria-busy=true] span{display:inline-block;animation:mndSpin .8s linear infinite}@keyframes mndSpin{to{transform:rotate(360deg)}}@media(max-width:760px){#globalReloadButton{top:auto;right:14px;bottom:18px;padding:11px 15px;border-radius:999px;background:#1955a2;color:#fff;border-color:#1955a2}#globalReloadButton:hover{background:#164987}}';
  document.head.append(style);
})();
