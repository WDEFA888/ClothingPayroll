/* 在真实浏览器中计算文字对比度；不检查装饰图形，也不把禁用控件当正文。 */
'use strict';
function textContrastReport() {
  const modal = document.querySelector('dialog[open]');
  const root = modal || document.body;
  const checked = new Map(), failures = [];
  function rgba(value) {
    const parts = value.match(/[\d.]+/g).map(Number);
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  function composite(top, bottom) {
    return top.slice(0,3).map((channel,i) => channel*top[3]+bottom[i]*(1-top[3]));
  }
  function background(element) {
    const layers = [];
    for(let e=element;e;e=e.parentElement)layers.push(rgba(getComputedStyle(e).backgroundColor));
    return layers.reverse().reduce((result,layer)=>composite(layer,result),[255,255,255]);
  }
  function luminance(rgb) {
    return rgb.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((n,c,i)=>n+c*[.2126,.7152,.0722][i],0);
  }
  function inspect(element, text, pseudo) {
    if(!text.trim() || !element.getClientRects().length || element.closest('[aria-hidden="true"],button:disabled,input:disabled,select:disabled,.breadcrumb-separator,.footer-dot'))return;
    const style=getComputedStyle(element,pseudo);
    if(style.visibility!=='visible' || Number(style.fontSize)===0)return;
    const bg=background(element), fg=composite(rgba(style.color),bg);
    const light=[luminance(fg),luminance(bg)].sort((a,b)=>a-b);
    const ratio=(light[1]+.05)/(light[0]+.05);
    const large=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.667 && Number(style.fontWeight)>=700);
    const threshold=large?3:4.5;
    const key=fg.join(',')+'/'+bg.join(',')+'/'+threshold;
    if(!checked.has(key)) {
      const item={text:text.trim().slice(0,50),ratio:Number(ratio.toFixed(3)),threshold,color:style.color,background:bg.map(Math.round)};
      checked.set(key,item);
      if(ratio+.001<threshold)failures.push(item);
    }
  }
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode())inspect(walker.currentNode.parentElement,walker.currentNode.textContent);
  root.querySelectorAll('input:not([type=checkbox]):not([type=hidden]):not([type=file]),select,textarea').forEach(e=>{
    if(e.value)inspect(e,e.value);
    else if(e.placeholder)inspect(e,e.placeholder,'::placeholder');
  });
  return {checked:checked.size,minimum:Math.min(...Array.from(checked.values(),x=>x.ratio)),failures};
}
module.exports={textContrastReport};
