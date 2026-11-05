/* PowerShellJS v0.2 — structural parser. PowerShell subset, not PowerShell's formal grammar.
   No eval, external dependencies, DOM or native bindings. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PowerShellParser=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
class SyntaxErrorPS extends Error{constructor(message,line=1,column=1){super(message);this.name='SyntaxErrorPS';this.code='ParserError';this.line=line;this.column=column;}}
const lineAt=(s,i)=>1+(s.slice(0,i).match(/\n/g)||[]).length;
function preprocess(src){
  src=src.replace(/\r\n?/g,'\n');let out='',q=null,block=0;
  for(let i=0;i<src.length;i++){
    let c=src[i],n=src[i+1];
    if(q){out+=c;if(c==='`'&&q==='"'&&n!==undefined){out+=n;i++;continue;}if(c===q){if(q==="'"&&n==="'"){out+=n;i++;}else q=null;}continue;}
    if(c==='\''||c==='"'){q=c;out+=c;continue;}
    if(c==='<'&&n==='#'){block++;out+='  ';i++;continue;}
    if(c==='#'&&n==='>'&&block){block--;out+='  ';i++;continue;}
    if(block){out+=c==='\n'?'\n':' ';continue;}
    if(c==='#'){while(i<src.length&&src[i]!=='\n'){out+=' ';i++;}if(i<src.length)out+='\n';continue;}
    if(c==='`'&&n==='\n'){out+='  ';i++;continue;}
    if(c==='\n'&&/^[ \t]*\|/.test(src.slice(i+1))){out+=' ';continue;}
    if(c==='|'&&/^[ \t]*\n/.test(src.slice(i+1))){out+='|';i++;while(i<src.length&&/[ \t]/.test(src[i]))i++;if(src[i]==='\n')out+=' ';else i--;continue;}
    out+=c;
  }
  if(q)throw new SyntaxErrorPS('Unterminated string.',lineAt(src,src.length));
  if(block)throw new SyntaxErrorPS('Unterminated block comment.',lineAt(src,src.length));
  return out;
}
function partition(src,delimiterSet){
 const output=[];let q=null,brace=0,paren=0,bracket=0,start=0;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(q){if(c==='`'&&q==='"'){i++;continue;}if(c===q){if(c==="'"&&src[i+1]==="'"){i++;continue;}q=null;}continue;}
  if(c==='"'||c==="'"){q=c;continue;}
  if(c==='{')brace++;else if(c==='}')brace--;
  else if(c==='(')paren++;else if(c===')')paren--;
  else if(c==='[')bracket++;else if(c===']')bracket--;
  if(brace<0||paren<0||bracket<0)throw new SyntaxErrorPS('Unexpected closing delimiter.',lineAt(src,i));
  if(brace===0&&paren===0&&bracket===0&&delimiterSet.includes(c)){
    const text=src.slice(start,i).trim();if(text)output.push({text,line:lineAt(src,start)});
    else if(c==='|')throw new SyntaxErrorPS('Missing pipeline stage.',lineAt(src,i));
    start=i+1;
  }
 }
 if(q||brace||paren||bracket)throw new SyntaxErrorPS('Unbalanced quotes, braces, brackets or parentheses.',lineAt(src,src.length));
 const text=src.slice(start).trim();if(text)output.push({text,line:lineAt(src,start)});
 else if(src.trimEnd().endsWith('|')&&delimiterSet.includes('|'))throw new SyntaxErrorPS('Missing pipeline stage.',lineAt(src,src.length));
 return output;
}
function readGroup(src,start,open,close){
 if(src[start]!==open)throw new SyntaxErrorPS('Expected '+open+'.');
 let q=null,depth=0;
 for(let i=start;i<src.length;i++){
  const c=src[i];
  if(q){if(c==='`'&&q==='"'){i++;continue;}if(c===q){if(q==="'"&&src[i+1]==="'"){i++;continue;}q=null;}continue;}
  if(c==='"'||c==="'"){q=c;continue;}
  if(c===open)depth++;
  if(c===close&&--depth===0)return {inside:src.slice(start+1,i),end:i+1};
 }
 throw new SyntaxErrorPS('Expected matching '+close+'.');
}
function statement(text,line){
 let m;
 if(/^if\s*\(/i.test(text)){
   let at=text.search(/\(/),cond=readGroup(text,at,'(',')'),tail=text.slice(cond.end).trimStart();
   let yes=readGroup(tail,0,'{','}'),after=tail.slice(yes.end).trim(),otherwise=[];
   if(after){if(!/^else\s*\{/i.test(after))throw new SyntaxErrorPS('Expected else { ... } after if.',line);
     const start=after.indexOf('{'),no=readGroup(after,start,'{','}');if(after.slice(no.end).trim())throw new SyntaxErrorPS('Unexpected content after else block.',line);
     otherwise=parse(no.inside);}
   return {kind:'if',line,condition:cond.inside.trim(),then:parse(yes.inside),else:otherwise};
 }
 if(/^foreach\s*\(/i.test(text)){
   const at=text.search(/\(/),head=readGroup(text,at,'(',')');
   const match=/^\s*\$([A-Za-z_]\w*)\s+in\s+([\s\S]+?)\s*$/i.exec(head.inside);
   if(!match)throw new SyntaxErrorPS('Expected foreach ($item in $collection).',line);
   const rest=text.slice(head.end).trim();let body=readGroup(rest,0,'{','}');if(rest.slice(body.end).trim())throw new SyntaxErrorPS('Unexpected trailing content after foreach.',line);
   return {kind:'foreach',line,name:match[1],collection:match[2],body:parse(body.inside)};
 }
 if((m=/^function\s+([A-Za-z_][\w-]*)\s*/i.exec(text))){
   let rest=text.slice(m[0].length),params=[];
   if(rest.startsWith('(')){const p=readGroup(rest,0,'(',')');params=p.inside.split(',').map(v=>v.trim()).filter(Boolean).map(v=>{const mm=/^\$([A-Za-z_]\w*)$/.exec(v);if(!mm)throw new SyntaxErrorPS('Only simple function parameters are supported.',line);return mm[1];});rest=rest.slice(p.end).trim();}
   let body=readGroup(rest,0,'{','}');if(rest.slice(body.end).trim())throw new SyntaxErrorPS('Unexpected trailing content after function.',line);
   return {kind:'function',line,name:m[1],params,body:parse(body.inside)};
 }
 if((m=/^\$([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/i.exec(text)))return {kind:'assignment',line,name:m[1],expression:m[2]};
 const pieces=partition(text,['|']);
 return {kind:'pipeline',line,stages:pieces.map(({text:source})=>({source}))};
}
function parse(src){
 if(typeof src!=='string')throw new TypeError('Expected script source string.');
 if(src.length>100000)throw new SyntaxErrorPS('Source too long.');
 return partition(preprocess(src),['\n',';']).map(({text,line})=>statement(text,line));
}
return {parse,partition,preprocess,SyntaxErrorPS,readGroup,VERSION:'0.2.0'};
});
