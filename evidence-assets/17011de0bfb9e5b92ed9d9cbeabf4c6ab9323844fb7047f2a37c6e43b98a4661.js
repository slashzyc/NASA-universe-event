/** Update small UI trees without replacing active controls, disclosure or draft state. */
export function updateHTML(target,html){
  const template=document.createElement('template');template.innerHTML=html;
  const key=node=>node.nodeType===1?(node.id||node.getAttribute('data-key')||node.getAttribute('data-patch')||node.getAttribute('data-site')||''):'';
  function sync(oldNode,newNode){
    if(oldNode.nodeType!==newNode.nodeType||oldNode.nodeType===1&&oldNode.tagName!==newNode.tagName){oldNode.replaceWith(newNode);return;}
    if(oldNode.nodeType===3){if(oldNode.data!==newNode.data)oldNode.data=newNode.data;return;}
    if(oldNode.nodeType!==1)return;
    const keepDraft=['INPUT','TEXTAREA','SELECT'].includes(oldNode.tagName),skip=name=>oldNode.tagName==='DETAILS'&&name==='open'||keepDraft&&['value','selected','checked'].includes(name);
    for(const attr of [...oldNode.attributes])if(!skip(attr.name)&&!newNode.hasAttribute(attr.name))oldNode.removeAttribute(attr.name);
    for(const attr of [...newNode.attributes])if(!skip(attr.name)&&oldNode.getAttribute(attr.name)!==attr.value)oldNode.setAttribute(attr.name,attr.value);
    if(['INPUT','TEXTAREA'].includes(oldNode.tagName))return;
    children(oldNode,newNode);
  }
  function children(parent,source){
    const old=[...parent.childNodes],used=new Set();let cursor=parent.firstChild;
    for(const next of [...source.childNodes]){
      const id=key(next);let existing=id?old.find(n=>!used.has(n)&&key(n)===id):old.find(n=>!used.has(n)&&!key(n)&&n.nodeType===next.nodeType&&(n.nodeType!==1||n.tagName===next.tagName));
      if(!existing){parent.insertBefore(next,cursor);existing=next;}else{if(existing!==cursor)parent.insertBefore(existing,cursor);sync(existing,next);}
      used.add(existing);cursor=existing.nextSibling;
    }
    for(const node of old)if(!used.has(node)&&node.parentNode===parent)node.remove();
  }
  children(target,template.content);
}
