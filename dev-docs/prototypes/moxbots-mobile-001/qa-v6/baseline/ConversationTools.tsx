import {useRef,useState} from 'react';
import {Mic} from 'lucide-react';
import {PlusIcon,PaperPlaneIcon,ImageIcon,FileIcon,Cross2Icon,ChevronDownIcon,StopIcon,CheckIcon,ChatBubbleIcon} from '@radix-ui/react-icons';
import {BottomSheet,KeyboardTextarea,useKeyboard,useKeyboardInsets,useScreenPortal} from './mobile';
import {AttachmentContent} from './AttachmentContent';
import {type Attachment,models,modelName} from './prototype-domain';
type Props={text:string;onText:(v:string)=>void;attachments:Attachment[];onAttachments:(v:Attachment[])=>void;model:string;onModel:(v:string)=>void;running?:boolean;disabled?:boolean;onSend:()=>void;onStop?:()=>void;next?:string[];large?:boolean;hint?:string;disabledPlaceholder?:string;enterSend?:boolean;context?:string};
export function ConversationTools(p:Props){
 const [panel,setPanel]=useState<'attach'|'model'|'voice'|'preview'|null>(null),[voice,setVoice]=useState<'listening'|'review'|'talk'>('listening'),[turns,setTurns]=useState(0),[error,setError]=useState(''),[transcript,setTranscript]=useState(''),[selected,setSelected]=useState<Attachment|null>(null);
 const input=useRef<HTMLInputElement>(null),imageInput=useRef<HTMLInputElement>(null),keyboard=useKeyboard(),{screenRef}=useScreenPortal(),{isKeyboardVisible}=useKeyboardInsets();
 const phrases=['请总结当前进展，并列出下一步需要确认的问题。','把行动项按优先级排列，先处理最重要的三项。','保留当前结论，继续细化执行方案。'];
 function close(){keyboard.hide();setPanel(null);}
 function open(v:typeof panel){keyboard.hide();setError('');if(v==='voice'){setVoice('listening');setTurns(0);setTranscript(phrases[0]);}setPanel(v);}
 function useTranscript(text:string){p.onText((p.text?p.text+'\n':'')+text);close();}
 async function choose(files:FileList|null){
  if(!files)return;const added:Attachment[]=[];let issue='';
  for(const file of Array.from(files)){
   if(p.attachments.length+added.length>=5){issue='每条消息最多添加 5 个附件，其余文件未添加。';break;}
   if(file.size>20*1024*1024){issue='「'+file.name+'」超过 20 MB，未添加。';continue;}
   try{const picture=/^image\/(png|jpeg|webp|gif)$/.test(file.type),text=/\.(md|txt|csv|json|log)$/i.test(file.name);
    added.push({id:crypto.randomUUID(),name:file.name,size:file.size<1024?file.size+' B':(file.size/1024).toFixed(1)+' KB',kind:picture?'image':'file',url:picture?URL.createObjectURL(file):undefined,preview:text?(await file.slice(0,8192).text()).slice(0,1200):undefined});
   }catch{issue='无法读取「'+file.name+'」，请重新选择。';}
  }
  p.onAttachments([...p.attachments,...added]);setError(issue);close();
 }
 return <div className={'conversation-tools '+(p.large?'large-tools':'')}>
  {p.next?.length&&!p.text&&!p.attachments.length&&!isKeyboardVisible&&<div className="next-prompts" aria-label="下一步建议"><span>接下来可以</span><div>{p.next.map(x=><button key={x} onClick={()=>p.onText(x)} disabled={p.disabled}>{x}</button>)}</div></div>}
  <div className="composer-panel">
   {!!p.attachments.length&&<div className="attachment-drafts" aria-label="待发送附件">{p.attachments.map(a=><div key={a.id} className="attachment-chip"><button className="attachment-open" disabled={p.disabled} aria-label={'预览附件：'+a.name} onPointerDown={e=>e.preventDefault()} onClick={()=>{setSelected(a);open('preview');}}>{a.kind==='image'?<img src={a.url} alt=""/>:<FileIcon/>}<span>{a.name}<small>{a.size}</small></span></button><button disabled={p.disabled} aria-label={'移除附件：'+a.name} onPointerDown={e=>e.preventDefault()} onClick={()=>{p.onAttachments(p.attachments.filter(i=>i.id!==a.id));setError('');}}><Cross2Icon/></button></div>)}</div>}
   {error&&<p className="field-error" role="alert">{error}</p>}
   <div className="composer"><KeyboardTextarea aria-label={p.large?'首条消息':'继续对话'} rows={p.large?4:1} placeholder={p.disabled?(p.disabledPlaceholder||'请先处理当前请求'):p.large?'描述你想完成的工作…':p.running?'补充要求，将在本轮后发送…':'发送消息…'} value={p.text} disabled={p.disabled} maxLength={8000} onChange={e=>p.onText(e.target.value)} onBlur={()=>keyboard.hide()} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!p.large&&p.enterSend!==false){e.preventDefault();p.onSend();}}}/></div>
   <div className="input-tool-row"><button className="tool-action" aria-label="添加文件或图片" disabled={p.disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>open('attach')}><PlusIcon/></button><button className="model-button" disabled={p.disabled||p.running} onPointerDown={e=>e.preventDefault()} onClick={()=>open('model')}>{modelName(p.model)}<ChevronDownIcon/></button><div className="input-actions"><button className="tool-action voice-action" aria-label="语音输入与对话" disabled={p.disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>open('voice')}><Mic strokeWidth={1.8}/></button>{!p.large&&(p.running&&!p.text.trim()&&!p.attachments.length?<button className="icon-button composer-stop" aria-label="停止当前执行" onPointerDown={e=>e.preventDefault()} onClick={p.onStop}><StopIcon/></button>:<button className="icon-button send-button" aria-label={p.running?'排队发送':'发送消息'} disabled={p.disabled||(!p.text.trim()&&!p.attachments.length)} onPointerDown={e=>e.preventDefault()} onClick={p.onSend}><PaperPlaneIcon/></button>)}</div></div>
  </div>
  {p.hint&&<span className="composer-helper">{p.hint}</span>}
  <input ref={input} type="file" multiple hidden aria-label="选择文件" onChange={e=>{void choose(e.target.files);e.target.value='';}}/>
  <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden aria-label="选择图片" onChange={e=>{void choose(e.target.files);e.target.value='';}}/>
  <BottomSheet open={!!panel} onOpenChange={v=>{if(!v)close();}} title={panel==='attach'?'添加到消息':panel==='model'?'选择模型':panel==='preview'?'附件预览':'语音'} description={panel==='voice'?'本地演示 · 未访问麦克风':panel==='model'?'示例配置 · 仅影响之后的消息':panel==='preview'?'预览待发送的本机附件':'最多 5 个附件，单个不超过 20 MB'} snap={panel==='voice'?.76:panel==='preview'?.85:.55}>
   <div className="mox-sheet-body tools-sheet" onPointerDownCapture={e=>{if((e.target as Element).closest('button'))e.preventDefault();}} onFocusCapture={()=>screenRef.current?.scrollTo({top:0,left:0})}>
    <button className="icon-button sheet-close" aria-label="关闭输入工具" onClick={close}><Cross2Icon/></button>
    {panel==='attach'&&<><button className="tool-option" onClick={()=>imageInput.current?.click()}><ImageIcon/><span>图片<small>从本机选择 PNG、JPEG、WebP、GIF</small></span></button><button className="tool-option" onClick={()=>input.current?.click()}><FileIcon/><span>文件<small>文档、表格、代码及其他文件</small></span></button><div className="local-note">选择后可预览和移除，确认发送前不会进入会话记录。</div></>}
    {panel==='preview'&&selected&&<AttachmentContent attachment={selected} onDone={close} onRemove={()=>{p.onAttachments(p.attachments.filter(a=>a.id!==selected.id));close();}}/>}
    {panel==='model'&&<div role="radiogroup" aria-label="消息模型">{models.map(m=><button key={m.id} className="tool-option model-option" role="radio" aria-checked={m.id===p.model} onClick={()=>{p.onModel(m.id);close();}}><span>{m.name}<small>{m.detail}</small></span>{m.id===p.model&&<CheckIcon/>}</button>)}</div>}
    {panel==='voice'&&<div className="voice-content"><div className="voice-mode-tabs" role="group" aria-label="语音方式"><button aria-pressed={voice!=='talk'} onClick={()=>{if(voice==='talk')setVoice('listening');}}><Mic/>语音输入</button><button aria-pressed={voice==='talk'} onClick={()=>{if(voice!=='talk'){setTurns(0);setVoice('talk');}}}><ChatBubbleIcon/>语音对话</button></div><p className="voice-context">{p.context||'当前会话'} · {modelName(p.model)}</p>
     {voice==='listening'&&<><div className="listening-mic"><Mic strokeWidth={1.6}/></div><h3>正在聆听（演示）</h3><p>说完后结束录入，转写内容可编辑后再发送。</p><button className="primary-button" onClick={()=>{setTranscript(phrases[0]);setVoice('review');}}><StopIcon/>结束录入</button><button className="text-button" onClick={close}>取消录入</button></>}
     {voice==='review'&&<><h3>确认转写内容</h3><KeyboardTextarea aria-label="语音转写内容" value={transcript} onChange={e=>setTranscript(e.target.value)} onBlur={()=>keyboard.hide()} maxLength={2000}/><button className="primary-button" disabled={!transcript.trim()} onClick={()=>useTranscript(transcript.trim())}>加入消息草稿</button><button className="secondary-button" onClick={()=>setVoice('listening')}>重新录入</button></>}
     {voice==='talk'&&<><h3>语音对话（演示）</h3><div className="voice-transcript-log">{turns===0?<p>点击下方按钮，演示向当前会话提出要求。</p>:Array.from({length:turns},(_,i)=><div key={i}><p><strong>你</strong>{phrases[i%phrases.length]}</p><p><strong>Bot</strong>{i===0?'我会结合当前会话整理进展与待确认问题。':'已记录补充要求，会保留当前工作上下文。'}</p></div>)}</div><button className="primary-button" onClick={()=>setTurns(n=>n+1)}>{turns?'继续一句示例':'模拟说一句'}</button><span className="subtle">已模拟 {turns} 轮，不采集或播放音频</span><button className="secondary-button" onClick={()=>{if(turns)useTranscript(Array.from({length:turns},(_,i)=>phrases[i%phrases.length]).join('\n'));else close();}}>结束并{turns?'带回草稿':'返回'}</button></>}
    </div>}
   </div>
  </BottomSheet>
 </div>;
}
