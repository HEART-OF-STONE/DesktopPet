use serde::{Deserialize,Serialize};
use super::models::Quota;

pub const INTERVAL:u64=10*60*1000;
const MAX_BACKOFF:u64=60*60*1000;

// Persist the shared request budget so restarts and manual clicks cannot
// create a burst. Fresh local main-quota records defer automatic requests.
#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct QuotaPoll {pub last_attempt_at:Option<u64>,pub next_attempt_at:u64,pub failures:u32}
impl QuotaPoll {
    pub fn next_auto_at(&self,quota:&Quota)->u64{
        let fresh_until=quota.windows.iter().filter(|w|w.bucket=="codex").map(|w|{
            let updated=w.updated_at.or(quota.updated_at).unwrap_or(0);
            let until=if updated==0{0}else{updated.saturating_add(INTERVAL)};
            w.resets_at.map(|reset|until.min(reset)).unwrap_or(until)
        }).min().unwrap_or(0);
        self.next_attempt_at.max(fresh_until)
    }
    pub fn due(&self,quota:&Quota,at:u64,enabled:bool,manual:bool)->bool{
        enabled&&at>=if manual{self.next_attempt_at}else{self.next_auto_at(quota)}
    }
    pub fn reserve(&mut self,at:u64){self.last_attempt_at=Some(at);self.next_attempt_at=at.saturating_add(INTERVAL);}
    pub fn finish(&mut self,at:u64,success:bool){
        self.failures=if success{0}else{self.failures.saturating_add(1)};
        let delay=if success{INTERVAL}else{INTERVAL.saturating_mul(1u64<<self.failures.saturating_sub(1).min(3)).min(MAX_BACKOFF)};
        self.next_attempt_at=at.saturating_add(delay);
    }
}

#[cfg(test)]mod tests{
    use super::*;use super::super::models::QuotaWindow;
    fn quota(at:u64,bucket:&str)->Quota{Quota{updated_at:Some(at),windows:vec![QuotaWindow{bucket:bucket.into(),label:"primary".into(),used_percent:40.,window_minutes:10080,resets_at:None,limit_name:None,updated_at:Some(at),source:"local_log".into()}],..Default::default()}}
    #[test]fn fresh_main_logs_defer_auto_but_spark_does_not(){
        let p=QuotaPoll::default();assert!(!p.due(&quota(1000,"codex"),1001,true,false));
        assert!(p.due(&quota(1000,"codex"),1000+INTERVAL,true,false));
        assert!(p.due(&quota(1000,"codex_bengalfox"),1001,true,false));
        assert!(!p.due(&Quota::default(),1001,false,true));
    }
    #[test]fn requests_share_a_persisted_budget(){
        let mut p=QuotaPoll::default();let q=Quota::default();p.reserve(1000);
        let restored:QuotaPoll=serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
        for manual in [true,false]{assert!(!restored.due(&q,1001,true,manual));assert!(restored.due(&q,1000+INTERVAL,true,manual));}
        p.finish(1100,true);assert_eq!(p.next_attempt_at,1100+INTERVAL);
    }
    #[test]fn backoff_is_bounded_and_success_recovers(){
        let mut p=QuotaPoll::default();
        for minutes in [10,20,40,60,60,60]{p.reserve(1000);p.finish(2000,false);assert_eq!(p.next_attempt_at,2000+minutes*60000);assert!(!p.due(&Quota::default(),2001,true,true));}
        p.finish(3000,true);assert_eq!(p.failures,0);assert_eq!(p.next_attempt_at,3000+INTERVAL);
    }
    #[test]fn reset_or_one_old_main_window_does_not_wait_for_newer_windows(){
        let mut q=quota(1000,"codex");q.windows[0].resets_at=Some(2000);
        assert_eq!(QuotaPoll::default().next_auto_at(&q),2000);
        let mut newer=quota(1000+INTERVAL,"codex").windows.remove(0);newer.window_minutes=300;q.windows.push(newer);
        assert!(QuotaPoll::default().due(&q,2000,true,false));
    }
}
