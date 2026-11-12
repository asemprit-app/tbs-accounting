// Browser-native chart image used in Word exports. Native jsPDF draws columns
// separately; the screen uses Recharts. No remote image, canvas plugin or API.
const number=n=>Number(n)||0;
export function verticalReportChartPng(rows,{keys,labels,colors,width=1120,height=480}={}){
 if(typeof document==='undefined'||typeof document.createElement!=='function')return null;
 if(!Array.isArray(rows)||!rows.length||!keys?.length)return null;
 const canvas=document.createElement('canvas');
 canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 if(!ctx)return null;
 ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,width,height);
 const left=105,right=width-35,top=73,bottom=height-102;
 const v=rows.flatMap(r=>keys.map(k=>number(r[k])));
 const rawHigh=Math.max(0,...v),rawLow=Math.min(0,...v);
 const high=rawHigh===rawLow?rawHigh+1:rawHigh,low=rawHigh===rawLow?rawLow-1:rawLow;
 const valY=value=>top+(high-value)/(high-low)*(bottom-top);
 ctx.lineWidth=1;ctx.textAlign='right';ctx.font='14px Arial';ctx.fillStyle='#566A7F';
 for(let t=0;t<=4;t++){
  const y=top+(bottom-top)*t/4;
  ctx.strokeStyle='#DCE5ED';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
  const label=high-(high-low)*t/4;
  ctx.fillStyle='#566A7F';ctx.fillText(label.toLocaleString('en-US',{notation:'compact',maximumFractionDigits:1}),left-10,y+4);
 }
 const zero=valY(0);ctx.strokeStyle='#617184';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(left,zero);ctx.lineTo(right,zero);ctx.stroke();
 const slot=(right-left)/rows.length,groupWidth=Math.min(slot*.82,114),barWidth=groupWidth/keys.length;
 for(let i=0;i<rows.length;i++){
  const center=left+slot*(i+.5);
  for(let j=0;j<keys.length;j++){
   const value=number(rows[i][keys[j]]),y=valY(value);
   const x=center-groupWidth/2+j*barWidth+2;
   ctx.fillStyle=keys[j]==='netIncome'&&value<0?'#B74B47':colors[j];
   if(value!==0)ctx.fillRect(x,Math.min(y,zero),Math.max(2,barWidth-4),Math.max(1,Math.abs(y-zero)));
  }
  ctx.fillStyle='#3C4F62';ctx.textAlign='center';ctx.font='14px Arial';
  ctx.fillText(String(rows[i].label||''),center,bottom+25);
 }
 let legendX=left;
 for(let i=0;i<keys.length;i++){
  ctx.fillStyle=colors[i];ctx.fillRect(legendX,22,15,15);
  ctx.font='14px Arial';ctx.textAlign='left';ctx.fillStyle='#374B61';
  ctx.fillText(labels[i]||keys[i],legendX+22,35);
  legendX+=i===1?280:190;
 }
 const encoded=canvas.toDataURL('image/png').split(',')[1];
 if(!encoded)return null;
 const decoded=atob(encoded);
 return Uint8Array.from(decoded,c=>c.charCodeAt(0));
}
