/* 完全虚构的工资单：只复现店家模板结构，不读取真实工资文件。 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const C=require('../core.js');
const Excel=require('../excel.js');
function createFixture(directory){
  fs.mkdirSync(directory,{recursive:true});
  const positions=[4,8,12,17,21,25,29,33,37,42,46,50,54,58,62,66,70,74,78,82,86,90,94];
  const rows=Array.from({length:94},()=>[]),records=[],merges=[];
  rows[0]=['','','','虚构测试店 · 9月工资'];
  positions.forEach((rowNo,i)=>{
    const r={...C.blankAmounts(),base:400000+i*10000,mealAllowance:20000+i*100,commission:30000+i*150,bonus:10000+i*100,leaveDays:0};
    let note='',extra='',g='提成',h='奖金',j='迟到';
    if(i===0)j='买衣服';
    if(i===1){r.leaveDays=1950;r.leaveDeduction=25000;r.depositRefund=80000;note='退押金800';}
    if(i===5){r.insuranceAllowance=50000;r.housingAllowance=80000;r.commission=12300;r.bonus=0;g='社保';h='房贴';note='提成123';}
    if(i===6){r.leaveDays=250;r.leaveDeduction=10000;r.depositRefund=90000;note='退押金900';}
    if(i===8){r.leaveDays=1500;r.leaveDeduction=45000;r.depositRefund=50000;note='退押金500';}
    if(i===9){r.depositDeduction=30000;note='扣押金300';}
    if(i===10){r.leaveDays=1950;extra='饭贴500';}
    if(i===11){r.leaveDays=100;r.leaveDeduction=15000;}
    if(i===16){h='房贴';r.housingAllowance=60000;r.bonus=0;}
    if(i===17){r.depositRefund=60000;note='退押金600';}
    if(i===18)r.leaveDays=2600;
    if(i===19){r.depositRefund=70000;note='退押金700';}
    if(i===20){r.leaveDays=100;r.leaveDeduction=12000;r.extraPay=40000;note='补150+250';}
    if(i===21)r.leaveDays=2800;
    if(i===22){r.leaveDays=2900;r.mealAllowance=0;extra='无饭贴';}
    const missing=[10,18,21,22].includes(i),recordedNet=missing?null:C.net(r)+(i===7?300:0);
    rows[rowNo-3]=['编号','日期','姓名','请假天数','应发工资','','','','扣款项目','','','','实发金额','备注'];
    rows[rowNo-2]=['','','','','基本工资','饭贴',g,h,'扣请假',j,'预支工资','员工押金','',''];
    rows[rowNo-1]=[i<18?i+1:19,i===0?'2026年9月':46266,'虚构员工'+String(i+1).padStart(2,'0'),r.leaveDays?r.leaveDays/100:'',r.base/100,r.mealAllowance/100,g==='社保'?r.insuranceAllowance/100:r.commission/100,h==='房贴'?r.housingAllowance/100:r.bonus/100,r.leaveDeduction?r.leaveDeduction/100:'',j==='买衣服'?r.clothing/100:r.lateness/100,r.advance/100,r.depositDeduction/100,recordedNet===null?'':recordedNet/100,note,extra];
    merges.push(`E${rowNo-2}:H${rowNo-2}`,`I${rowNo-2}:L${rowNo-2}`);
    records.push({...r,row:rowNo,recordedNet,note});
  });
  const file=path.join(directory,'虚构工资测试.xlsx');
  fs.writeFileSync(file,Excel.writeWorkbook([{name:'Sheet1',rows,merges}]));
  // 用标准库压缩生成的虚构文件，覆盖 XLSX 常见的 deflate 解压路径。
  const script="import sys,io; from pathlib import Path; from zipfile import ZipFile,ZIP_DEFLATED; p=Path(sys.argv[1]); src=ZipFile(io.BytesIO(p.read_bytes())); out=io.BytesIO(); dst=ZipFile(out,'w',ZIP_DEFLATED); [dst.writestr(n,src.read(n)) for n in src.namelist()]; dst.close(); src.close(); p.write_bytes(out.getvalue())";
  const result=spawnSync('python',['-I','-c',script,file],{encoding:'utf8'});
  if(result.status!==0)throw new Error('生成压缩虚构工资单失败：'+result.stderr);
  return {file,records,originalTotal:records.reduce((n,r)=>n+(r.recordedNet??0),0)};
}
module.exports={createFixture};
