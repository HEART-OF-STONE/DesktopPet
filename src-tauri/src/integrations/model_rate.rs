//! Scalar output samples used only for model speed; never retain response text.
use super::models::*;
use serde_json::Value;

const MAX_DURATION:u64=7*86400000;
fn millis(v:&Value)->Option<u64>{v.as_u64().filter(|n|*n<=MAX_DURATION)}
fn timestamp(v:&Value,at:u64)->Option<u64>{
    let n=v.as_u64()?;let n=if n<100_000_000_000{n.checked_mul(1000)?}else{n};
    (n>0&&n<=at&&at-n<=MAX_DURATION).then_some(n)
}
pub fn start(cursor:&mut Cursor,at:u64){
    if cursor.timing.turn_id!=cursor.turn_id||cursor.timing.started_at.is_none(){cursor.timing=CursorTiming{turn_id:cursor.turn_id.clone(),started_at:Some(at),output:0,complete:true,observed_at:None};}
}
pub fn usage(cursor:&mut Cursor,delta:&Tokens,reset:bool,at:u64){
    let t=&mut cursor.timing;
    if t.turn_id!=cursor.turn_id||t.started_at.is_none(){return;}
    if reset||delta.cached>delta.input||delta.reasoning>delta.output||delta.input.checked_add(delta.output)!=Some(delta.total){t.complete=false;t.observed_at=Some(at);}
    t.output=t.output.saturating_add(delta.output);
    if delta.output>0{t.observed_at=Some(at);}
}
pub fn read(cursor:&Cursor,p:&Value,at:u64,completed:bool)->TaskTiming{
    let duration=completed.then(||millis(&p["duration_ms"])).flatten();
    let started=timestamp(&p["started_at"],at).or(cursor.timing.started_at.filter(|_|cursor.timing.turn_id==cursor.turn_id)).or_else(||duration.and_then(|d|at.checked_sub(d)));
    let output=(completed&&cursor.timing.complete&&cursor.timing.turn_id==cursor.turn_id&&cursor.timing.started_at.is_some()).then_some(cursor.timing.output);
    let duration=duration.or_else(||if completed{started.map(|s|at.saturating_sub(s)).filter(|d|*d<=MAX_DURATION)}else{None});
    let sample=(cursor.timing.turn_id==cursor.turn_id&&cursor.timing.started_at.is_some()).then(||cursor.timing.observed_at.map(|at|OutputSample{at,tokens:cursor.timing.complete.then_some(cursor.timing.output)})).flatten();
    TaskTiming{started_at:started,duration_ms:duration,output_tokens:output,output_sample:sample}
}
pub fn merge(old:&TaskTiming,new:&TaskTiming)->TaskTiming{
    let sample=match (&old.output_sample,&new.output_sample){(Some(a),Some(b))=>Some(if b.at>=a.at{b.clone()}else{a.clone()}),(Some(a),None)=>Some(a.clone()),(None,b)=>b.clone()};
    TaskTiming{started_at:old.started_at.or(new.started_at),duration_ms:new.duration_ms.or(old.duration_ms),output_tokens:new.output_tokens.or(old.output_tokens),output_sample:sample}
}

#[cfg(test)]mod tests{
 use super::*;use serde_json::json;
 #[test]fn unchanged_output_holds_sample_and_resets_invalidate_it(){
  let mut c=Cursor{turn_id:"t".into(),..Default::default()};start(&mut c,1000);
  usage(&mut c,&Tokens{input:1000,output:200,total:1200,..Default::default()},false,5000);
  let live=read(&c,&json!({}),5000,false);assert_eq!(live.output_sample.as_ref().unwrap().tokens,Some(200));assert!(live.output_tokens.is_none());
  usage(&mut c,&Tokens::default(),false,7000);assert_eq!(read(&c,&json!({}),7000,false).output_sample,live.output_sample);
  usage(&mut c,&Tokens{input:500,output:200,total:700,..Default::default()},false,11000);
  let later=read(&c,&json!({}),11000,false);assert_eq!(later.output_sample.as_ref().unwrap().tokens,Some(400));assert_eq!(merge(&later,&live).output_sample,later.output_sample);
  usage(&mut c,&Tokens{input:10,output:5,total:15,..Default::default()},true,12000);
  let bad=read(&c,&json!({}),12000,false);assert_eq!(bad.output_sample.as_ref().unwrap().tokens,None);assert_eq!(merge(&later,&bad).output_sample,bad.output_sample);
 }
 #[test]fn completed_output_excludes_input_and_missing_start_is_unknown(){
  let mut c=Cursor{turn_id:"t".into(),..Default::default()};assert!(read(&c,&json!({"duration_ms":2000}),3000,true).output_tokens.is_none());
  start(&mut c,1000);usage(&mut c,&Tokens{input:1000,cached:900,output:80,reasoning:30,total:1080},false,3000);
  let t=read(&c,&json!({"duration_ms":2000}),3000,true);assert_eq!(t.output_tokens,Some(80));assert_eq!(t.duration_ms,Some(2000));
  let restored:Cursor=serde_json::from_slice(&serde_json::to_vec(&c).unwrap()).unwrap();assert_eq!(restored.timing.output,80);
  start(&mut c,1000);assert_eq!(c.timing.output,80);c.turn_id="new".into();start(&mut c,4000);assert_eq!(c.timing.output,0);
 }
}
