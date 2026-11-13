/* 本地 XLSX 读写：只解析单元格与缓存值，不执行公式、宏或外部链接。 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.PayrollCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollExcel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
  const maxFile = 20 * 1024 * 1024, maxExpanded = 32 * 1024 * 1024;
  function check(ok, message) { if (!ok) throw new Error(message); }
  function nodes(root, name) { return Array.from(root.getElementsByTagNameNS(NS, name)); }
  function xml(bytes) {
    const source = decoder.decode(bytes);
    check(!/<!DOCTYPE|<!ENTITY/i.test(source), '不支持含有外部实体声明的工作簿');
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    check(!doc.getElementsByTagName('parsererror').length, '工作簿 XML 格式损坏'); return doc;
  }
  const crcTable = Array.from({length:256}, (_, index) => {let c=index; for(let j=0;j<8;j++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0;});
  function crc32(bytes) { let crc=0xffffffff; for(const b of bytes) crc=crcTable[(crc^b)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer); let end = -1;
    check(bytes.length >= 22 && bytes.length <= maxFile, 'Excel 文件为空、损坏或超过 20MB');
    for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--) if(view.getUint32(p,true)===0x06054b50 && p+22+view.getUint16(p+20,true)===bytes.length){end=p;break;}
    check(end>=0, '不是可读取的 XLSX 文件，请勿只修改 .xls 后缀');
    check(view.getUint16(end+4,true)===0 && view.getUint16(end+6,true)===0, '不支持多卷压缩工作簿');
    const count=view.getUint16(end+10,true), start=view.getUint32(end+16,true), centralSize=view.getUint32(end+12,true);
    check(count>0 && count<4000 && start+centralSize<=end, '工作簿目录损坏或文件过多');
    const entries=new Map();let pos=start,total=0;
    for(let i=0;i<count;i++){
      check(pos+46<=end && view.getUint32(pos,true)===0x02014b50, '工作簿目录损坏');
      const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),crc=view.getUint32(pos+16,true),compressed=view.getUint32(pos+20,true),size=view.getUint32(pos+24,true),nameLen=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
      check(!(flags&1) && (method===0 || method===8), '不支持加密或特殊压缩的工作簿');
      check(pos+46+nameLen+extra+comment<=end && size<=8*1024*1024, '工作簿内容过大或目录损坏');
      const name=decoder.decode(bytes.subarray(pos+46,pos+46+nameLen));
      check(!name.includes('..') && !name.includes('\\') && !name.startsWith('/') && !entries.has(name), '工作簿内部路径异常');
      total+=size;check(total<=maxExpanded, '工作簿展开后超过 32MB');
      entries.set(name,{flags,method,crc,compressed,size,offset});pos+=46+nameLen+extra+comment;
    }
    const cache=new Map();
    async function read(name){
      if(cache.has(name))return cache.get(name);
      const e=entries.get(name);check(e,'工作簿缺少 '+name);const p=e.offset;
      check(p+30<=start && view.getUint32(p,true)===0x04034b50,'工作簿内容定位失败');
      const begin=p+30+view.getUint16(p+26,true)+view.getUint16(p+28,true);
      check(begin+e.compressed<=start, '工作簿内容越界');
      let result=bytes.slice(begin,begin+e.compressed);
      if(e.method===8){
        check(typeof DecompressionStream==='function','当前浏览器不支持本地 Excel 解压，请使用新版 Chrome 或 Edge');
        const stream=new Blob([result]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const reader=stream.getReader(),chunks=[];let length=0;
        for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>e.size || length>8*1024*1024){await reader.cancel();throw new Error('工作簿实际展开体积异常');}chunks.push(part.value);}
        result=new Uint8Array(length);let at=0;chunks.forEach(chunk=>{result.set(chunk,at);at+=chunk.length;});
      }
      check(result.length===e.size && crc32(result)===e.crc,'工作簿内容校验失败');cache.set(name,result);return result;
    }
    return {read,has:name=>entries.has(name)};
  }
  function pathFromWorkbook(target) {
    check(!/^[a-z]+:/i.test(target) && !target.includes('\\'), '不支持外部工作表链接');
    const stack=target.startsWith('/')?[]:['xl'];
    target.replace(/^\//,'').split('/').forEach(part=>{if(part==='..'){check(stack.length>0,'工作表路径越界');stack.pop();}else if(part && part!=='.')stack.push(part);});
    return stack.join('/');
  }
  function monthFrom(value,date1904){
    const str=String(value||'').trim();let m=str.match(/(20\d{2})\s*[年\-/]\s*(\d{1,2})(?:\s*月)?/);
    if(m){const key=m[1]+'-'+m[2].padStart(2,'0');return C.monthValid(key)?key:'';}
    if(/^\d{5}(\.\d+)?$/.test(str)){
      const date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Number(str)*86400000);
      const key=date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0');return C.monthValid(key)?key:'';
    }return '';
  }
  function moneyCell(value,label,row){
    if(value===undefined || value==='')return 0;
    const s=String(value).trim().replace(/,/g,'');
    check(/^\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?$/.test(s),`第 ${row} 行“${label}”不是非负金额，未导入`);
    const n=Number(s),c=Math.round(n*100);
    check(Number.isFinite(n) && Math.abs(c-n*100)<0.00001 && c<=C.MAX,`第 ${row} 行“${label}”超过两位小数或金额范围，未导入`);
    return c;
  }
  const mapping = {'基本工资':'base','基础工资':'base','底薪':'base','饭贴':'mealAllowance','饭补':'mealAllowance','提成':'commission','奖金':'bonus','房贴':'housingAllowance','社保':'insuranceAllowance','社保（应发项）':'insuranceAllowance','其他补贴':'subsidy','其他补发':'extraPay','退还押金':'depositRefund','扣请假':'leaveDeduction','请假扣款':'leaveDeduction','迟到':'lateness','迟到扣款':'lateness','买衣服':'clothing','买衣服扣款':'clothing','预支工资':'advance','预支工资抵扣':'advance','员工押金':'depositDeduction','押金扣款（历史项）':'depositDeduction','其他扣款':'deduction','个人社保公积金扣款':'insurance','个人所得税':'tax'};
  function applyNote(row,note){
    const patterns=[[/^退押金\s*([\d.]+)\s*元?$/,'depositRefund'],[/^扣押金\s*([\d.]+)\s*元?$/,'depositDeduction'],[/^提成\s*([\d.]+)\s*元?$/,'commission'],[/^补\s*([\d.]+(?:\s*\+\s*[\d.]+)*)\s*元?$/,'extraPay']];
    for(const [pattern,key] of patterns){const m=note.trim().match(pattern);if(m){
      const value=m[1].split('+').reduce((sum,part)=>sum+moneyCell(part,'备注金额',row.source.row),0);
      if(row[key]!==0){row.source.warnings.push('备注包含'+C.labels[key]+'，对应项目也已有金额，未重复加算，请核实');return;}
      row[key]=value;return;
    }}
    if(note.trim())row.source.warnings.push('存在未自动折算的原表备注，请人工确认是否影响实发金额');
  }
  async function read(file){
    check(/\.xlsx$/i.test(file.name),'请选择 .xlsx 工资单，不支持 .xls 或 .xlsm');
    const buffer=await file.arrayBuffer();const zip=await unzip(buffer);
    const digest=await crypto.subtle.digest('SHA-256',buffer),fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const workbook=xml(await zip.read('xl/workbook.xml'));
    const props=nodes(workbook,'workbookPr')[0],date1904=props && ['1','true'].includes(props.getAttribute('date1904'));
    const relationships=xml(await zip.read('xl/_rels/workbook.xml.rels'));
    const rels=new Map(Array.from(relationships.documentElement.children).map(r=>[r.getAttribute('Id'),r]));
    let strings=[];
    if(zip.has('xl/sharedStrings.xml'))strings=nodes(xml(await zip.read('xl/sharedStrings.xml')),'si').map(si=>nodes(si,'t').map(n=>n.textContent).join(''));
    const sheets=nodes(workbook,'sheet');check(sheets.length<=100,'工作表数量超过限制');
    const result={fileName:file.name,fingerprint,rows:[],months:[],sections:[],warnings:[]};
    for(const sheet of sheets){
      if(sheet.getAttribute('state')==='veryHidden')continue;
      const rel=rels.get(sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
      check(rel && rel.getAttribute('TargetMode')!=='External','无法读取工作表关系');
      const name=sheet.getAttribute('name'),doc=xml(await zip.read(pathFromWorkbook(rel.getAttribute('Target'))));
      let section='',headers=null,flat=false;
      for(const element of nodes(doc,'row')){
        const values={},references={},formulas=new Set();
        for(const cell of Array.from(element.children).filter(n=>n.localName==='c')){
          const ref=cell.getAttribute('r')||'',column=ref.replace(/[0-9]/g,'');
          check(/^[A-Z]{1,3}\d+$/.test(ref),'工作表单元格位置异常');
          const type=cell.getAttribute('t'),v=nodes(cell,'v')[0];let value=v?.textContent||'';
          if(type==='s'){const index=Number(value);check(Number.isSafeInteger(index)&&index>=0&&index<strings.length,'共享文本索引异常');value=strings[index];}
          else if(type==='inlineStr')value=nodes(cell,'t').map(n=>n.textContent).join('');
          if(nodes(cell,'f').length)formulas.add(column);
          if(value.length>2000)throw new Error('原表单元格内容过长，未导入');
          if(value!=='')values[column]=value.trim();references[column]=ref;
        }
        const entries=Object.entries(values),rowNo=Number(element.getAttribute('r'));
        if(values.A==='编号' && values.C==='姓名'){headers={...values};flat=false;continue;}
        if(entries.some(([,v])=>v==='姓名') && entries.some(([,v])=>v==='基本工资') && entries.some(([,v])=>v==='月份')){headers={...values};flat=true;continue;}
        if(headers && !flat && values.E==='基本工资'){Object.assign(headers,values);continue;}
        if(!headers){const title=entries.find(([,v])=>v.includes('工资') && v!=='应发工资');if(title)section=title[1];continue;}
        const nameCol=flat?Object.keys(headers).find(k=>headers[k]==='姓名'):'C';
        const numberCol=flat?null:'A';
        if(!flat && /^\d+$/.test(values.A||'') && !values.C)throw new Error('第 '+rowNo+' 行缺少员工姓名，未导入任何记录');
        if(!values[nameCol] || (!flat && !/^\d+$/.test(values[numberCol]||''))){
          if(entries.length===1 && entries[0][1].includes('工资'))section=entries[0][1];continue;
        }
        check(result.rows.length<1000,'一次最多导入 1000 条工资，请拆分工作簿');
        const dateCol=flat?Object.keys(headers).find(k=>headers[k]==='月份'):'B';
        const month=monthFrom(values[dateCol],date1904);
        const netCol=flat?(Object.keys(headers).find(k=>headers[k]==='软件计算实发')||Object.keys(headers).find(k=>headers[k]==='实发工资')):'M';
        const noteCol=flat?Object.keys(headers).find(k=>headers[k]==='备注'):'N';
        const row={...C.blankAmounts(),name:values[nameCol].trim(),leaveDays:0,note:values[noteCol]||'',source:{fileName:file.name,fingerprint,sheet:name,row:rowNo,number:numberCol?(values[numberCol]||''):'',section,month,recordedNet:values[netCol]===undefined?null:moneyCell(values[netCol],'实发金额',rowNo),warnings:[],cells:[]}};
        check(row.name && row.name.length<=60,'员工姓名为空或超过 60 字');
        const mapped=new Set();
        for(const [col,label] of Object.entries(headers)){
          if(values[col]!==undefined)row.source.cells.push({ref:references[col],label,raw:values[col]});
          const key=label==='社保'&&!flat ? (['E','F','G','H'].includes(col)?'insuranceAllowance':'insurance') : mapping[label];
          if(key && values[col]!==undefined){check(!mapped.has(key),'同一工资项目出现两次，请整理原表');row[key]=moneyCell(values[col],label,rowNo);mapped.add(key);}
          if(!flat && ['E','F','G','H','I','J','K','L'].includes(col) && values[col]!==undefined && !key)row.source.warnings.push('原表 '+references[col]+' 的项目“'+label+'”无法识别，未计入计算，请核实');
          if(['请假天数','请假'].includes(label) && values[col]!==undefined)row.leaveDays=C.days(values[col]);
        }
        if(!mapped.has('base'))row.source.warnings.push('原表基本工资未填写，当前计算按 0 暂存，请核实');
        if(!month)row.source.warnings.push('原表日期无法识别，导入月份需人工确认');
        if(formulas.size)row.source.warnings.push('原表含公式，仅导入文件中保存的缓存结果，未执行公式');
        if(row.insuranceAllowance>0)row.source.warnings.push('原表“社保”位于应发栏，已按应发项保留，请确认实际口径');
        if(row.note)applyNote(row,row.note);
        if(!flat && values.O){row.note=(row.note?row.note+'；':'')+'补充备注：'+values.O;row.source.cells.push({ref:references.O,label:'补充备注',raw:values.O});row.source.warnings.push('原表 O 列有补充备注，未自动计入金额，请核实');}
        check(row.note.length<=1000,'工资备注超过 1000 字，请整理后导入');
        result.rows.push(row);
      }
      if(flat && result.rows.length)break;
    }
    check(result.rows.length>0,'没有识别到工资记录。当前支持店家提供的分块工资单，以及本工具导出的工资汇总表');
    result.months=[...new Set(result.rows.map(r=>r.source.month).filter(Boolean))];
    result.sections=[...new Set(result.rows.map(r=>r.source.section).filter(Boolean))];
    if(result.months.length>1)result.warnings.push('原表包含多个月份，请按月份分开选择导入，不能混入同一个月');
    return result;
  }
  function escapeXml(value){return String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
  function colName(index){let value=index+1,name='';while(value){value--;name=String.fromCharCode(65+value%26)+name;value=Math.floor(value/26);}return name;}
  function sheetXml(sheet){
    const rows=sheet.rows.map((row,i)=>{
      const ht=sheet.rowHeights && sheet.rowHeights[i+1];
      return '<row r="'+(i+1)+'"'+(ht?' ht="'+ht+'" customHeight="1"':'')+'>'+row.map((value,j)=>{
        const cell=value && typeof value==='object'?value:{v:value};const ref=colName(j)+(i+1),style=cell.s??(i===0?1:0);
        if(typeof cell.v==='number'){check(Number.isFinite(cell.v),'导出金额异常');return `<c r="${ref}" s="${style}"><v>${cell.v}</v></c>`;}
        return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.v)}</t></is></c>`;
      }).join('')+'</row>';
    }).join('');
    const merges=sheet.merges?.length?'<mergeCells count="'+sheet.merges.length+'">'+sheet.merges.map(m=>'<mergeCell ref="'+escapeXml(m)+'"/>').join('')+'</mergeCells>':'';
    const cols=sheet.widths?'<cols>'+sheet.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols>':'';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0">${sheet.freeze?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>':''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="14.5"/>${cols}<sheetData>${rows}</sheetData>${sheet.filter?`<autoFilter ref="A1:${colName(sheet.rows[0].length-1)}${sheet.rows.length}"/>`:''}${merges}<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/></worksheet>`;
  }
  function pack(files){
    const chunks=[],directory=[];let offset=0;
    for(const [name,content] of files){const filename=encoder.encode(name),data=encoder.encode(content),crc=crc32(data),header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,filename.length,true);header.set(filename,30);chunks.push(header,data);
      const central=new Uint8Array(46+filename.length),v=new DataView(central.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,filename.length,true);v.setUint32(42,offset,true);central.set(filename,46);directory.push(central);offset+=header.length+data.length;
    }
    const directorySize=directory.reduce((s,c)=>s+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,directorySize,true);v.setUint32(16,offset,true);
    const result=new Uint8Array(offset+directorySize+22);let pos=0;[...chunks,...directory,end].forEach(chunk=>{result.set(chunk,pos);pos+=chunk.length;});return result;
  }
  function writeWorkbook(sheets){
    check(sheets.length>0&&sheets.length<=100,'导出工作表数量异常');
    const files=[['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
      ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${escapeXml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml',`<?xml version="1.0"?><styleSheet xmlns="${NS}"><fonts count="4"><font><sz val="11"/><name val="等线"/></font><font><sz val="24"/><color rgb="FF000000"/><name val="等线"/></font><font><sz val="9"/><name val="楷体"/></font><font><sz val="9"/><color rgb="FF000000"/><name val="等线"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="5"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="medium"><color rgb="FF000000"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="medium"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top/><bottom style="medium"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="4" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="4" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]];
    sheets.forEach((sheet,i)=>files.push(['xl/worksheets/sheet'+(i+1)+'.xml',sheetXml(sheet)]));return pack(files);
  }
  function payrollWorkbook(rows, month, shopName, locked) {
    const money = value => ({ v: value / 100, s: 4 });
    const text = value => ({ v: value, s: 4 });
    const monthText = month.slice(0, 4) + '年' + Number(month.slice(5)) + '月';
    const slips = [], merges = [], rowHeights = {};
    // 大标题（24 号大字，下边一条粗线）
    slips.push(Array(14).fill().map((_, j) => j === 0 ? { v: monthText + '工资', s: 1 } : { v: '', s: 1 }));
    merges.push('A1:N1');
    rowHeights[1] = 30.5;
    rows.forEach((r, i) => {
      const start = slips.length + 1; // 表头行
      const gKey = r.insuranceAllowance > 0 ? 'insuranceAllowance' : 'commission';
      const gLabel = r.insuranceAllowance > 0 ? '社保' : '提成';
      const hKey = r.housingAllowance > 0 ? 'housingAllowance' : 'bonus';
      const hLabel = r.housingAllowance > 0 ? '房贴' : '奖金';
      const jKey = r.lateness > 0 ? 'lateness' : 'clothing';
      const jLabel = r.lateness > 0 ? '迟到' : '买衣服';
      const listed = ['base', 'mealAllowance', gKey, hKey, 'leaveDeduction', jKey, 'advance', 'depositDeduction'];
      const yuan = cents => (cents / 100).toFixed(2).replace(/\.?0+$/, '');
      const extra = C.fields.filter(f => !listed.includes(f) && r[f] > 0).map(f => C.labels[f] + ' ' + yuan(r[f])).join('；');
      const note = (r.note || '') + (extra ? (r.note ? '；' : '') + extra : '');
      // 表头两行（楷体 9 号，块顶粗线）
      slips.push(['编号', '日期', '姓名', '请假天数', '应发工资', '', '', '', '扣款项目', '', '', '', '实发金额', '备注'].map(v => ({ v, s: 2 })));
      slips.push(['', '', '', '', '基本工资', '饭贴', gLabel, hLabel, '扣请假', jLabel, '预支工资', '员工押金', '', ''].map(v => ({ v, s: 3 })));
      // 数据行（等线 9 号，块底粗线；备注左对齐）
      slips.push([{ v: i + 1, s: 4 }, text(monthText), text(r.name), r.leaveDays > 0 ? { v: r.leaveDays / 100, s: 4 } : { v: '', s: 4 }, money(r.base), money(r.mealAllowance), money(r[gKey]), money(r[hKey]), money(r.leaveDeduction), money(r[jKey]), money(r.advance), money(r.depositDeduction), money(C.net(r)), { v: note, s: 5 }]);
      rowHeights[start + 2] = 23.5;
      slips.push([]);
      merges.push(
        'E' + start + ':G' + start, 'I' + start + ':L' + start,
        'A' + (start + 2) + ':A' + (start + 3), 'B' + (start + 2) + ':B' + (start + 3),
        'C' + (start + 2) + ':C' + (start + 3), 'D' + (start + 2) + ':D' + (start + 3),
        'M' + (start + 2) + ':M' + (start + 3), 'N' + (start + 2) + ':N' + (start + 3)
      );
    });
    return writeWorkbook([{ name: '工资单', rows: slips, merges, rowHeights, widths: [6, 12, 10, 9, 10, 10, 10, 10, 10, 10, 10, 10, 11, 24] }]);
  }
  return {read,writeWorkbook,payrollWorkbook,crc32};
});
