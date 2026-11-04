const $=id=>document.getElementById(id);
const STATUS={DISPONIVEL:'Disponível',EM_USO:'Em Uso',EM_MANUTENCAO:'Em Manutenção',PERDIDO:'Perdido'};
let items=[], currentMoves=[], warehouses=[];
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function api(url, options={}) {
  const response=await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'Não foi possível concluir a operação.');
  return data;
}
function showPage(p){
  document.querySelectorAll('[id^="page-"]').forEach(e=>e.classList.add('hidden'));
  $('page-'+p).classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
  if(p==='mov')renderMoves();
  if(p==='mapa')renderShelves();
  if(p==='retirada'){populateWithdrawSelect();updateWithdrawSummary();}
  if(p==='status')loadStatusCounts();
}
document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.goto)));

async function loadItems(){
  try {
    [items,warehouses]=await Promise.all([api('/api/items'),api('/api/warehouses')]);
    renderWarehouseOptions();
    renderWithdrawOptions();
    $('warehouseCount').textContent=warehouses.length;
    await search(false);
  }
  catch(e){showMessage('Não foi possível carregar o banco de dados. Inicie o servidor pelo arquivo iniciar.bat ou pelo comando python app.py.',true);}
}
function showMessage(message,error=false){
  $('message').classList.remove('hidden');$('message').textContent=message;
  $('message').style.background=error?'#fff4e5':'#eaf6ee';
  $('message').style.color=error?'#855500':'#155e37';
}
function statusClass(i){return i.status==='Disponível'?'':(i.status==='Em Uso'?'warn':(i.status==='Em Manutenção'?'warn':'warn'))}
function actionButtons(i){
 let actions=[];
 if(i.status==='Disponível') actions=[['withdraw','Retirar'],['maintenance','Enviar à manutenção'],['lost','Marcar perdido']];
 if(i.status==='Em Uso') actions=[['return','Registrar devolução'],['lost','Marcar perdido']];
 if(i.status==='Em Manutenção') actions=[['maintenance_return','Retorno da manutenção']];
 if(i.status==='Perdido') actions=[['found','Registrar item localizado']];
 return actions.map(([a,label])=>`<button class="smallbtn" data-action="${a}" data-code="${esc(i.code)}">${label}</button>`).join(' ');
}
async function search(showNotice=true){
 const params=new URLSearchParams();
 const q=$('q').value.trim(),cat=$('cat').value,sector=$('sector').value,status=$('status').value;
 if(q)params.set('q',q);if(cat)params.set('category',cat);if(sector)params.set('sector',sector);if(status)params.set('status',status);
 try{
  const found=await api('/api/items?'+params.toString());items=await api('/api/items');
  if(showNotice)showMessage(found.length?`${found.length} material(is) encontrado(s). Os dados vêm do banco SQLite.`:'Nenhum material encontrado. Tente outro nome, código ou filtro.');
  const box=$('results');
  if(!found.length){box.className='empty';box.innerHTML='<div style="font-size:46px">⌕</div><div class="empty-text">Nenhum material encontrado<div class="subtle">Altere os filtros ou cadastre itens no banco SQLite.</div></div>';return;}
  box.className='results';
  box.innerHTML=found.map(i=>`<article class="result"><div><div class="item-name">${esc(i.name)}</div><div class="item-meta">${esc(i.code)} · ${esc(i.cat)} · ${esc(i.sector)}</div><div class="item-meta">Local: ${esc(i.loc)}</div>${i.employee?`<div class="item-meta">Responsável: ${esc(i.employeeName||'Matrícula '+i.employee)} (${esc(i.employee)})</div>`:''}</div><div style="display:flex;align-items:flex-end;gap:8px;flex-direction:column;max-width:100%"><span class="pill ${statusClass(i)}">${esc(i.status)}</span><button class="smallbtn" data-locate="${esc(i.code)}">Ver localização</button><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${actionButtons(i)}</div></div></article>`).join('');
  box.querySelectorAll('[data-locate]').forEach(b=>b.addEventListener('click',()=>locate(b.dataset.locate)));
  box.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>performAction(b.dataset.code,b.dataset.action)));
  renderWithdrawOptions();
 }catch(e){showMessage(e.message,true);}
}
function locate(code){
 const i=items.find(x=>x.code===code);if(!i)return;
 showPage('mapa');$('shelfInfo').classList.remove('hidden');$('shelfInfo').textContent=`${i.name} (${i.code}) — ${i.loc}. Status: ${i.status}.`;
 renderShelves(i);
}
$('search').addEventListener('click',()=>search());$('q').addEventListener('keydown',e=>{if(e.key==='Enter')search()});
['cat','sector','status'].forEach(id=>$(id).addEventListener('change',()=>search()));

function renderShelves(selected){
 const container=$('warehouses-container');
 container.innerHTML=warehouses.map(galpao=>{
  const galpaoItems=items.filter(i=>i.sector===galpao||(i.loc&&i.loc.includes(galpao)));
  const nums=Array.from({length:12},(_,n)=>n+1);
  const buttons=nums.map(num=>{
   let pad=String(num).padStart(2,'0');
   let shelfName='Prateleira '+pad;
   let hasItems=galpaoItems.some(i=>i.prateleira===shelfName||(i.loc&&i.loc.includes(shelfName)));
   let isSel=selected && (selected.sector===galpao||(selected.loc&&selected.loc.includes(galpao))) && (selected.prateleira===shelfName||(selected.loc&&selected.loc.includes(shelfName)));
   return `<button class="shelf" data-galpao="${esc(galpao)}" data-shelf="${pad}" style="border:1px solid ${isSel?'#16804a':(hasItems?'#8ab9a0':'#dbe5e1')};background:${isSel?'#e6f5eb':(hasItems?'#f1faf4':'#f7faf8')};border-radius:10px;padding:18px 8px;color:#173b2c;font-weight:700;min-height:78px"><span style="display:block;font-size:22px">▤</span>Prateleira ${pad}${hasItems?'<span style="display:block;font-size:11px;color:#08783f;margin-top:4px">● Com material</span>':''}</button>`;
  }).join('');
  return `<div class="panel"><h3>${esc(galpao)} — visão simplificada</h3><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${buttons}</div><p class="subtle">Selecione uma prateleira do ${esc(galpao)} para ver os detalhes do local.</p></div>`;
 }).join('');

 container.querySelectorAll('[data-shelf]').forEach(b=>b.addEventListener('click',()=>{
  let pad=b.dataset.shelf;
  let galpao=b.dataset.galpao;
  let shelfName='Prateleira '+pad;
  let matching=items.filter(i=>(i.sector===galpao||(i.loc&&i.loc.includes(galpao))) && (i.prateleira===shelfName||(i.loc&&i.loc.includes(shelfName))));
  $('shelfInfo').classList.remove('hidden');$('shelfInfo').textContent=matching.length?`${galpao} > ${shelfName}: ${matching.map(i=>i.name+' ('+i.code+') — '+i.status).join('; ')}.`:`${galpao} > ${shelfName}: nenhum material cadastrado nesta prateleira.`;
  container.querySelectorAll('.shelf').forEach(x=>x.style.outline='');
  b.style.outline='3px solid #94c9a8';
 }));
}

async function renderMoves(){
 try{
  currentMoves=await api('/api/movements');
  $('moves').innerHTML=currentMoves.length?currentMoves.map(m=>`<tr><td>${esc(m.date)}</td><td>${esc(m.item)}</td><td>${esc(m.type)}</td><td>${esc(m.location)}</td><td>${esc(m.employee)}</td></tr>`).join(''):'<tr><td colspan="5">Nenhuma movimentação registrada até agora.</td></tr>';
 }catch(e){$('moves').innerHTML=`<tr><td colspan="5">${esc(e.message)}</td></tr>`;}
}
$('newMove').addEventListener('click',()=>{showPage('busca');showMessage('Para registrar uma movimentação, use os botões de ação de cada material na lista de busca.');});
function renderWithdrawOptions(){
 const select=$('withdrawItem');const selected=select.value;
 const available=items.filter(i=>i.status==='Disponível');
 select.innerHTML=available.map(i=>`<option value="${esc(i.code)}">${esc(i.code)} — ${esc(i.name)}</option>`).join('')||'<option value="">Nenhum material disponível</option>';
 if(available.some(i=>i.code===selected))select.value=selected;
}
function renderWarehouseOptions(){
 const select=$('sector');const selected=select.value;
 select.innerHTML='<option value="">⚑ Setor: todos</option>'+warehouses.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
 if(warehouses.includes(selected))select.value=selected;
}
function populateWithdrawSelect(){renderWithdrawOptions();}
function updateWithdrawSummary(){
 const i=items.find(x=>x.code===$('withdrawItem').value);
 if(!i){$('withdrawItemInfo').textContent='Nenhum material disponível no cadastro.';$('withdrawSummary').textContent='Cadastre um material no banco para começar.';return;}
 $('withdrawItemInfo').textContent=`${i.code} · ${i.cat} · ${i.sector} · Status atual: ${i.status}`;
 $('withdrawSummary').textContent=`${i.name} — ${i.loc}. Status: ${i.status}${i.employee?' · Matrícula responsável: '+i.employee:''}.`;
}
$('withdrawItem').addEventListener('change',()=>{$('withdrawNotice').classList.add('hidden');updateWithdrawSummary();});
async function confirmWithdrawal(){
 const code=$('withdrawItem').value, matricula=$('employeeId').value.trim();$('withdrawNotice').classList.remove('hidden');
 try{
  const result=await api(`/api/items/${encodeURIComponent(code)}/action`,{method:'POST',body:JSON.stringify({action:'withdraw',matricula})});
  $('withdrawNotice').style.background='#eaf6ee';$('withdrawNotice').style.color='#155e37';$('withdrawNotice').textContent=`Retirada confirmada! ${result.item.name} (${result.item.code}) agora está “${result.item.status}”. Colaborador: ${result.item.employeeName} (${matricula}).`;
  $('employeeId').value='';await refreshAll();
 }catch(e){$('withdrawNotice').style.background='#fff4e5';$('withdrawNotice').style.color='#855500';$('withdrawNotice').textContent=e.message;}
}
$('confirmWithdraw').addEventListener('click',confirmWithdrawal);
async function performAction(code,action){
 const labels={withdraw:'retirar este material',return:'registrar a devolução',maintenance:'enviar à manutenção',maintenance_return:'registrar o retorno da manutenção',lost:'marcar este item como perdido',found:'registrar que o item foi localizado'};
 let matricula=prompt(`Digite a matrícula do colaborador para ${labels[action]}. Exemplos: 8820 (Yuri), 8821 (Davi):`);
 if(matricula===null)return;
 let observacao=prompt('Observação (opcional):','');if(observacao===null)observacao='';
 try{
  const result=await api(`/api/items/${encodeURIComponent(code)}/action`,{method:'POST',body:JSON.stringify({action,matricula,observacao})});
  showMessage(`${result.message} ${result.item.name}: ${result.item.status}.`);
  await refreshAll();
 }catch(e){showMessage(e.message,true);}
}
async function loadStatusCounts(){
 try{
  const statuses=await api('/api/statuses');
  document.querySelectorAll('#page-status .status-list .panel').forEach(card=>{
   const label=card.querySelector('h3')?.textContent?.trim();
   const match=statuses.find(s=>s.label===label);
   if(match){let badge=card.querySelector('.pill');if(badge)badge.textContent=`${match.total} item(ns)`;}
  });
 }catch(e){console.warn(e);}
}
async function refreshAll(){
 items=await api('/api/items');
 renderWithdrawOptions();updateWithdrawSummary();
 await search(false);
 if(!$('page-mov').classList.contains('hidden'))await renderMoves();
 if(!$('page-status').classList.contains('hidden'))await loadStatusCounts();
 if(!$('page-mapa').classList.contains('hidden'))renderShelves();
}
loadItems();