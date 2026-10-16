/* Presentation and navigation only. Existing answer and exam state stay in their original controllers. */
(() => {
  'use strict';
  const names={guide:'學習指南',knowledge:'知識點與公式',worked:'典型例題',practice:'原創題練習',random:'隨機練習',cbt:'限時模考',forms:'學習路線與固定卷'};
  const meta={guide:'LEARNING RESOURCES',knowledge:'CORE KNOWLEDGE',worked:'WORKED EXAMPLES',practice:'210 QUESTIONS',random:'RANDOM PRACTICE',cbt:'TIMED PRACTICE',forms:'STUDY PLAN'};
  function useVisibleOptionLabels(scope) {
    scope.querySelectorAll('label.option input[type=radio],label.cbt-choice input[type=radio]').forEach(input=>input.removeAttribute('aria-label'));
  }
  // The enclosing label includes both the letter and its numeric answer.
  // Preserve that accessible name for static and newly drawn questions.
  useVisibleOptionLabels(document);
  for(const id of ['randomCards','cbt-choices']) {
    const container=document.getElementById(id);
    if(container)new MutationObserver(()=>useVisibleOptionLabels(container)).observe(container,{childList:true,subtree:true});
  }
  function sync(panel) {
    if(!names[panel])return;
    document.body.dataset.page=panel;
    document.querySelectorAll('.navbutton').forEach(button=>{
      if(button.dataset.target===panel)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    document.getElementById('context-current').textContent=names[panel];
    document.getElementById('context-meta').textContent='EXAM P · '+meta[panel];
    document.title=names[panel]+' | Exam P 學習';
  }
  document.addEventListener('exam-p-panel-change',event=>sync(event.detail.panel));
  document.addEventListener('click',event=>{
    const button=event.target.closest('button[data-open-panel]');
    if(!button)return;
    const panel=button.dataset.openPanel;
    window.ExamPActivatePanel?.(panel);
    document.querySelector('#'+panel+' h1')?.focus({preventScroll:true});
  });
  const wide=matchMedia('(min-width: 1240px)');
  for(const ident of ['guide','knowledge','worked','forms']) {
    const panel=document.getElementById(ident);
    const content=panel?.querySelector('.reading-content');
    const aside=panel?.querySelector('.reading-aside');
    if(!content||!aside)continue;
    let toc=panel.querySelector('.toc');
    if(!toc) {
      const headings=[...content.querySelectorAll('h2')];
      if(!headings.length)continue;
      toc=document.createElement('nav');toc.className='toc';toc.setAttribute('aria-label','章節目錄');
      for(const [i,heading] of headings.entries()) {
        if(!heading.id)heading.id=ident+'-ui-h'+i;
        const a=document.createElement('a');a.href='#'+heading.id;a.textContent=heading.textContent;toc.append(a);
      }
    }
    toc.querySelector('strong')?.remove();
    const disclosure=document.createElement('details');disclosure.className='contents-disclosure';
    const summary=document.createElement('summary');summary.textContent='本頁目錄';disclosure.append(summary,toc);aside.append(disclosure);
    function placeContents() {
      disclosure.open=wide.matches;
      if(wide.matches)aside.append(disclosure);
      else {
        const lead=content.querySelector('.panel-lead')||content.querySelector('h1');
        if(lead)lead.insertAdjacentElement('afterend',disclosure);
      }
    }
    placeContents();wide.addEventListener('change',placeContents);
    toc.addEventListener('click',event=>{
      if(!event.target.closest('a'))return;
      if(!wide.matches)disclosure.open=false;
    });
  }
  sync(document.querySelector('.panel.active')?.id||'guide');
})();
