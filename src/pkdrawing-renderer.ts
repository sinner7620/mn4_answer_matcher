// PencilKit's dataRepresentation is a compact protobuf-like stream beginning with "wrd".
// The field layout below follows libfreeform's independently implemented PKDrawing decoder
// (MIT OR Apache-2.0): https://github.com/can1357/libfreeform
export const pkDrawingRendererScript = String.raw`
(function(){
  function b64(s){var x=atob(s),a=new Uint8Array(x.length);for(var i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a}
  function uint(a,p,n){var v=0;for(var i=0;i<n;i++)v=v*256+a[p+i];return v}
  function text(a,p,n,wide){var s='';for(var i=0;i<n;i++)s+=String.fromCharCode(wide?uint(a,p+i*2,2):a[p+i]);return s}
  function binaryPlist(a){
    if(a.length<40||text(a,0,8,false)!=='bplist00')throw Error('不是二进制归档');
    var trailer=a.length-32,offsetSize=a[trailer+6],refSize=a[trailer+7],count=uint(a,trailer+8,8),top=uint(a,trailer+16,8),table=uint(a,trailer+24,8),offsets=[],cache=[];
    if(!offsetSize||!refSize||count>100000||table>=a.length)throw Error('归档尾部损坏');
    for(var i=0;i<count;i++)offsets.push(uint(a,table+i*offsetSize,offsetSize));
    function length(p,info){if(info<15)return [info,p];var m=a[p++],kind=m>>4,bytes=Math.pow(2,m&15);if(kind!==1||bytes>8)throw Error('归档长度损坏');return [uint(a,p,bytes),p+bytes]}
    function parse(index){
      if(cache[index]!==undefined)return cache[index];var p=offsets[index],m=a[p++],kind=m>>4,info=m&15,len,q,keys,values,result;
      if(kind===0){result=info===8?false:info===9?true:null}
      else if(kind===1){result=uint(a,p,Math.pow(2,info))}
      else if(kind===2){var size=Math.pow(2,info),view=new DataView(a.buffer,a.byteOffset+p,size);result=size===4?view.getFloat32(0,false):view.getFloat64(0,false)}
      else if(kind===3){result=new DataView(a.buffer,a.byteOffset+p,8).getFloat64(0,false)}
      else if(kind===4){q=length(p,info);result=a.slice(q[1],q[1]+q[0])}
      else if(kind===5){q=length(p,info);result=text(a,q[1],q[0],false)}
      else if(kind===6){q=length(p,info);result=text(a,q[1],q[0],true)}
      else if(kind===8){result={uid:uint(a,p,info+1)}}
      else if(kind===10){q=length(p,info);len=q[0];p=q[1];result=[];cache[index]=result;for(var j=0;j<len;j++)result.push(parse(uint(a,p+j*refSize,refSize)))}
      else if(kind===13){q=length(p,info);len=q[0];p=q[1];keys=p;values=p+len*refSize;result={};cache[index]=result;for(var j=0;j<len;j++)result[String(parse(uint(a,keys+j*refSize,refSize)))]=parse(uint(a,values+j*refSize,refSize))}
      else throw Error('未知归档对象 '+kind);
      cache[index]=result;return result
    }
    return parse(top)
  }
  function unarchive(a){
    var archive=binaryPlist(a),objects=archive.$objects,rootRef=archive.$top&&archive.$top.root;
    if(!objects||!rootRef||typeof rootRef.uid!=='number')throw Error('归档根对象缺失');
    function object(value){return value&&typeof value.uid==='number'?objects[value.uid]:value}
    var root=object(rootRef);if(root&&root['NS.data'] instanceof Uint8Array)return root['NS.data'];
    if(root&&root['NS.keys']&&root['NS.objects']){var out={},ks=root['NS.keys'],vs=root['NS.objects'];for(var i=0;i<ks.length;i++)out[String(object(ks[i]))]=object(vs[i]);return out}
    return root
  }
  function drawingData(encoded){
    var raw=b64(encoded);if(raw[0]===119&&raw[1]===114&&raw[2]===100)return raw;
    var first=unarchive(raw);if(first instanceof Uint8Array&&first[0]===119&&first[1]===114&&first[2]===100)return first;
    var second=first instanceof Uint8Array?unarchive(first):first,d=second&&(second.drawing2||second.drawing1);
    if(!(d instanceof Uint8Array))throw Error('归档中没有 drawing 数据');return d
  }
  function fields(a,start,end){
    var out=[],p=start||0,limit=end==null?a.length:end;
    function vi(){var v=0,m=1,b;do{if(p>=limit)throw Error('varint');b=a[p++];v+=(b&127)*m;m*=128}while(b&128);return v}
    while(p<limit){var key=vi(),n=Math.floor(key/8),w=key&7,v;
      if(w===0)v=vi();else if(w===1){v=a.slice(p,p+8);p+=8}else if(w===2){var l=vi();v=a.slice(p,p+l);p+=l}
      else if(w===5){v=a.slice(p,p+4);p+=4}else throw Error('wire '+w);
      out.push({n:n,w:w,v:v})
    }return out
  }
  function all(fs,n){return fs.filter(function(f){return f.n===n})}
  function one(fs,n){var z=all(fs,n);return z.length?z[z.length-1]:null}
  function f32(v,off){return new DataView(v.buffer,v.byteOffset+off,4).getFloat32(0,true)}
  function color(ink){
    var c=one(fields(ink),1);if(!c||c.w!==2)return 'rgba(25,25,25,1)';var fs=fields(c.v),q=[];
    for(var i=1;i<=4;i++){var x=one(fs,i);q.push(x&&x.w===5?f32(x.v,0):(i===4?1:0))}
    var scale=Math.max(q[0],q[1],q[2])<=1.01?255:1;
    return 'rgba('+Math.round(q[0]*scale)+','+Math.round(q[1]*scale)+','+Math.round(q[2]*scale)+','+Math.max(0,Math.min(1,q[3]))+')'
  }
  function transform(raw){var t=[1,0,0,1,0,0];if(!raw)return t;var fs=fields(raw);
    for(var i=1;i<=6;i++){var x=one(fs,i);if(x&&x.w===5)t[i-1]=f32(x.v,0)}return t
  }
  function pointPath(raw,t){var fs=fields(raw),cnt=one(fs,3),packed=one(fs,7);if(!cnt||!packed||!cnt.v)return [];
    var stride=packed.v.length/cnt.v;if([12,14,16,18,20,22].indexOf(stride)<0)return [];var pts=[];
    for(var i=0;i<cnt.v;i++){var o=i*stride,x=f32(packed.v,o),y=f32(packed.v,o+4),w=stride>=16?Math.abs(f32(packed.v,o+12)):2;
      pts.push({x:t[0]*x+t[2]*y+t[4],y:t[1]*x+t[3]*y+t[5],w:isFinite(w)&&w>0&&w<100?w:2})}return pts
  }
  function decode(raw){if(raw.length<4||raw[0]!==119||raw[1]!==114||raw[2]!==100)throw Error('magic');var root=fields(raw,3),inks=all(root,4).map(function(x){return color(x.v)}),strokes=[];
    all(root,5).forEach(function(s){var fs=fields(s.v),ink=one(fs,4),path=one(fs,5),tr=one(fs,7);if(!path)return;var pts=pointPath(path.v,transform(tr&&tr.v));if(pts.length)strokes.push({p:pts,c:inks[ink?ink.v:0]||'rgba(25,25,25,1)'})});return strokes
  }
  function draw(canvas){try{var ss=decode(drawingData(canvas.getAttribute('data-drawing')));if(!ss.length)throw Error('笔迹为空');var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    ss.forEach(function(s){s.p.forEach(function(p){minX=Math.min(minX,p.x-p.w);minY=Math.min(minY,p.y-p.w);maxX=Math.max(maxX,p.x+p.w);maxY=Math.max(maxY,p.y+p.w)})});
    var pad=8,w=Math.max(1,maxX-minX+pad*2),h=Math.max(1,maxY-minY+pad*2),cssW=Math.max(160,Math.min(900,w)),scale=cssW/w;
    canvas.width=Math.ceil(cssW*devicePixelRatio);canvas.height=Math.ceil(h*scale*devicePixelRatio);var c=canvas.getContext('2d');c.scale(scale*devicePixelRatio,scale*devicePixelRatio);c.translate(-minX+pad,-minY+pad);c.lineCap='round';c.lineJoin='round';
    ss.forEach(function(s){if(s.p.length<2)return;c.strokeStyle=s.c;c.lineWidth=Math.max(1,s.p.reduce(function(v,p){return v+p.w},0)/s.p.length);c.beginPath();c.moveTo(s.p[0].x,s.p[0].y);for(var i=1;i<s.p.length;i++)c.lineTo(s.p[i].x,s.p[i].y);c.stroke()});
  }catch(e){canvas.outerHTML='<div class="missing-image">手写解析失败：'+String(e&&e.message||e)+'</div>'}}
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-drawing]'),draw)
})();`
