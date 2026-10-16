/* Offline practice controller. No question nodes are moved when an answer changes. */
(() => {
  'use strict';
  const bank = window.EXAM_P_BANK || [];
  const forms = window.EXAM_P_FORMS || [];
  const byId = Object.fromEntries(bank.map(q => [q.id, q]));
  const key = 'exam-p-20261015-v1';
  const randomKey = 'exam-p-random-v3';
  const answers = {}, graded = {};
  let storageOK = true;
  const el = id => document.getElementById(id);
  function read(k, fallback) { try { return JSON.parse(localStorage.getItem(k) || 'null') || fallback; } catch { storageOK = false; return fallback; } }
  Object.assign(answers, read(key, {}));
  Object.assign(graded, read(key + '-graded', {}));
  let randomSession = read(randomKey, null);
  if (randomSession && (!Array.isArray(randomSession.ids) || !randomSession.ids.length || new Set(randomSession.ids).size !== randomSession.ids.length || randomSession.ids.some(id => !byId[id]))) randomSession = null;
  if (randomSession) {
    for (const field of ['answers', 'graded']) {
      const raw=randomSession[field];
      randomSession[field]=Object.fromEntries(Object.entries(raw && typeof raw==='object' && !Array.isArray(raw)?raw:{}).filter(([id,value])=>randomSession.ids.includes(id)&&'ABCDE'.includes(value)&&String(value).length===1));
    }
  }
  function write(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { storageOK = false; } }
  function save() { write(key, answers); write(key + '-graded', graded); }
  function setStorageNote() { const n=el('storageStatus'); if(n) { n.hidden=storageOK; n.textContent='此瀏覽器未開放本機保存；本次頁面仍可作答，請用 CSV 匯出備份。'; } }
  function activatePanel(id, scroll=true) {
    const target=el(id);if(!target?.classList.contains('panel'))return;
    document.querySelectorAll('.navbutton,.panel').forEach(x=>x.classList.remove('active'));
    target.classList.add('active');
    const btn=document.querySelector(`.navbutton[data-target="${id}"]`);btn?.classList.add('active');
    if(el('sectiontitle'))el('sectiontitle').textContent=btn?.textContent||'';
    write('exam-p-ui-v3',{panel:id});
    if(id==='random'&&!randomSession)drawRandom(false);
    if(scroll)window.scrollTo({top:document.querySelector('.shell').offsetTop-14,behavior:'instant'});
    document.dispatchEvent(new CustomEvent('exam-p-panel-change',{detail:{panel:id}}));
  }
  document.querySelectorAll('.navbutton').forEach(b=>b.addEventListener('click',()=>activatePanel(b.dataset.target)));
  window.ExamPActivatePanel=activatePanel;
  const controls=['bank','area','level','form','state'].map(el);
  let lastOrder='';
  function visibleIds(){
    const ordered=el('form').value?forms[Number(el('form').value)-1]:bank.map(q=>q.id);
    const text=el('search').value.trim().toLowerCase();
    return (ordered||[]).filter(id=>{const q=byId[id];return q&&
      (!el('bank').value||q.bank===el('bank').value)&&
      (!el('area').value||q.area===el('area').value)&&
      (!el('level').value||String(q.level)===el('level').value)&&
      (!el('state').value||(el('state').value==='unanswered'&&!answers[id])||(el('state').value==='answered'&&!!answers[id])||(el('state').value==='wrong'&&!!answers[id]&&graded[id]===answers[id]&&answers[id]!==q.key))&&
      (!text||(id+' '+q.search).toLowerCase().includes(text));});
  }
  function displayedIds(){return [...document.querySelectorAll('#cards>.qcard:not([hidden])')].map(x=>x.id);}
  function updateStatus(note=''){
    const ids=displayedIds();
    el('status').textContent=`顯示 ${ids.length} 題 · 已作答 ${ids.filter(id=>answers[id]).length} 題`+(el('form').value?` · 固定卷 ${el('form').value}`:'')+(note?' · '+note:'');
    setStorageNote();
  }
  function filter(){
    const ids=visibleIds(),visible=new Set(ids),signature=(el('form').value||'all');
    // Only an explicit change of form reorders nodes. Answer changes never call this path.
    if(signature!==lastOrder){
      const allOrder=el('form').value?[...(forms[Number(el('form').value)-1]||[]),...bank.map(q=>q.id).filter(id=>!(forms[Number(el('form').value)-1]||[]).includes(id))]:bank.map(q=>q.id);
      const fragment=document.createDocumentFragment();
      for(const id of allOrder){const node=el(id);if(node)fragment.appendChild(node);}
      el('cards').appendChild(fragment);lastOrder=signature;
    }
    document.querySelectorAll('#cards>.qcard').forEach(x=>{const hide=!visible.has(x.id);if(x.hidden!==hide)x.hidden=hide;});
    el('empty').hidden=ids.length>0;el('score').hidden=true;updateStatus();
  }
  function syncRegular(id){
    document.querySelectorAll(`#cards input[name="${id}"]`).forEach(x=>x.checked=answers[id]===x.value);
  }
  document.querySelectorAll('#cards input[type=radio]').forEach(x=>{
    x.checked=answers[x.name]===x.value;
    x.addEventListener('change',()=>{
      answers[x.name]=x.value;delete graded[x.name];save();
      el('score').hidden=true;
      // Keep current card visible even in 'unanswered'/'wrong' mode until the user applies filters.
      updateStatus(el('state').value?'作答已保存；按「套用篩選」更新狀態列表':'作答已保存');
    });
  });
  controls.forEach(x=>x.addEventListener('change',filter));el('search').addEventListener('input',filter);
  el('applyFilters').addEventListener('click',filter);
  el('englishOnly').addEventListener('change',e=>el('cards').classList.toggle('english-only',e.target.checked));
  el('reset').addEventListener('click',()=>{controls.forEach(x=>x.value='');el('search').value='';filter();});
  el('grade').addEventListener('click',()=>{
    const ids=displayedIds();let done=0,correct=0;
    for(const id of ids){if(answers[id]){done++;graded[id]=answers[id];}if(answers[id]===byId[id].key)correct++;}
    save();el('score').textContent=`本次顯示題目：${correct} / ${ids.length} 答對；已作答 ${done} 題。可切換「已批改錯題」訂正；此分數不換算官方及格率。`;el('score').hidden=false;
  });
  el('clearanswers').addEventListener('click',()=>{for(const x of [answers,graded])Object.keys(x).forEach(k=>delete x[k]);save();document.querySelectorAll('#cards input').forEach(x=>x.checked=false);el('score').hidden=true;updateStatus('已清空一般題庫記錄');});
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  el('export').addEventListener('click',()=>{
    const rows=[['題號','題庫','主題','我的答案','批改結果','正確答案'],...bank.map(q=>[q.id,q.bank,q.topic,answers[q.id]||'',graded[q.id]===answers[q.id]&&answers[q.id]?(answers[q.id]===q.key?'正確':'錯誤'):'未批改',graded[q.id]===answers[q.id]&&answers[q.id]?q.key:''])];
    const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Exam_P_作答記錄.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){let r;if(globalThis.crypto?.getRandomValues){const v=new Uint32Array(1);crypto.getRandomValues(v);r=v[0]/4294967296;}else r=Math.random();const j=Math.floor(r*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function quota(n){if(n===30)return {G:8,U:14,M:8};if(n===20)return {G:5,U:10,M:5};if(n===10)return {G:3,U:4,M:3};if(n===5)return {G:1,U:3,M:1};const g=Math.round(n*.267);return{G:g,U:n-2*g,M:g};}
  function sample(pool,n,balanced){
    if(pool.length<n)throw Error(`符合條件只有 ${pool.length} 題，無法抽出 ${n} 道不同題目。請減少題數或放寬條件。`);
    if(!balanced||n===1)return shuffle(pool).slice(0,n);
    const target=quota(n),result=[];
    for(const area of ['G','U','M']){const part=pool.filter(q=>q.area===area);if(part.length<target[area])throw Error(`${{G:'一般機率',U:'單變量',M:'多變量'}[area]}只有 ${part.length} 題，配比需要 ${target[area]} 題。請放寬條件或取消按考綱配比。`);result.push(...shuffle(part).slice(0,target[area]));}
    return shuffle(result);
  }
  const randomCards=el('randomCards');
  function randomMessage(message,error=false){el('randomStatus').textContent=message;el('randomStatus').classList.toggle('error',error);}
  function drawRandom(scroll=true){
    const n=Number(el('randomCount').value),source=el('randomBank').value,area=el('randomArea').value,level=el('randomLevel').value;
    const pool=bank.filter(q=>(!source||source==='bilingual'?(!source||!!q.chineseHtml):q.bank===source)&&(!area||q.area===area)&&(!level||String(q.level)===level)&&(!el('randomUnseen').checked||!answers[q.id]));
    try{
      const selected=sample(pool,n,el('randomBalanced').checked&&!area);
      randomSession={ids:selected.map(q=>q.id),answers:{},graded:{},createdAt:Date.now()};write(randomKey,randomSession);renderRandom();
      const counts=selected.reduce((o,q)=>(o[q.area]=(o[q.area]||0)+1,o),{});
      randomMessage(`已自動抽取 ${n} 題，沒有重複。一般／單變量／多變量：${counts.G||0}／${counts.U||0}／${counts.M||0}。`);
      if(scroll)el('randomSessionTop').scrollIntoView({block:'start',behavior:'instant'});
    }catch(e){randomMessage(e.message,true);}
  }
  function renderRandom(){
    randomCards.replaceChildren();if(!randomSession)return;
    for(const [i,id] of randomSession.ids.entries()){
      const q=byId[id],article=document.createElement('article');article.className='qcard';article.id='random-'+id;
      const options=q.choices.map((v,j)=>`<label class="option"><input type="radio" name="random-${id}" value="${'ABCDE'[j]}" aria-label="隨機第 ${i+1} 題選項 ${'ABCDE'[j]}"><b>${'ABCDE'[j]}</b><span>${v}</span></label>`).join('');
      article.innerHTML=`<div class="qtop"><h3>第 ${i+1} 題 · ${id}</h3><span class="badge">${q.topic}</span></div>${q.promptHtml}${q.chineseHtml?`<div class="translation">${q.chineseHtml}</div>`:''}<div class="options">${options}</div><details><summary>查看答案與詳解</summary><div class="explanation">${q.explanationHtml}</div></details>`;
      article.querySelectorAll('input').forEach(input=>{input.checked=randomSession.answers[id]===input.value;input.addEventListener('change',()=>{randomSession.answers[id]=input.value;delete randomSession.graded[id];write(randomKey,randomSession);el('randomScore').hidden=true;randomMessage(`本組已作答 ${Object.keys(randomSession.answers).length} / ${randomSession.ids.length} 題；作答已保存。`);});});
      randomCards.appendChild(article);
    }
    el('randomScore').hidden=true;el('randomGrade').disabled=false;
  }
  el('drawRandom').addEventListener('click',()=>drawRandom(true));
  el('randomArea').addEventListener('change',()=>{el('randomBalanced').disabled=!!el('randomArea').value;});
  el('randomEnglish').addEventListener('change',e=>randomCards.classList.toggle('english-only',e.target.checked));
  el('randomGrade').addEventListener('click',()=>{
    if(!randomSession)return;let correct=0,done=0;
    for(const id of randomSession.ids){const answer=randomSession.answers[id];if(answer){done++;randomSession.graded[id]=answer;answers[id]=answer;graded[id]=answer;syncRegular(id);}if(answer===byId[id].key)correct++;}
    save();write(randomKey,randomSession);el('randomScore').textContent=`本組 ${correct} / ${randomSession.ids.length} 答對；已作答 ${done} 題。已合併到一般題庫作答記錄，可在錯題篩選中回做。`;el('randomScore').hidden=false;
  });
  if(randomSession){renderRandom();randomMessage(`已恢復上次自動抽取的 ${randomSession.ids.length} 題。`);}
  else el('randomGrade').disabled=true;
  filter();
  for(const id of ['knowledge','guide','worked']){const panel=el(id);if(!panel)continue;panel.querySelector('.toc')?.remove();const nav=document.createElement('nav');nav.className='toc';nav.setAttribute('aria-label','章節目錄');nav.innerHTML='<strong>章節目錄</strong>'+[...panel.querySelectorAll('h2')].map((h,i)=>{h.id=id+'-v3-h'+i;return `<a href="#${h.id}">${h.textContent}</a>`;}).join('');panel.querySelector('h1')?.insertAdjacentElement('afterend',nav);}
  const ui=read('exam-p-ui-v3',{panel:'guide'});activatePanel(ui.panel||'guide',false);setStorageNote();
})();
