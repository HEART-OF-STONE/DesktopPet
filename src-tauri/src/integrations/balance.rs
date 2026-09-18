use serde_json::Value;
use super::{models::*,scanner::day};

#[cfg(windows)]
pub fn credential(target:&str, update:Option<Option<&str>>)->Result<Option<String>,String> {
    use windows_sys::Win32::Security::Credentials::*;
    let target=target.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    unsafe {
        if let Some(update)=update { match update {
            Some(key)=>{ let mut bytes=key.as_bytes().to_vec();let mut record:CREDENTIALW=std::mem::zeroed();record.Type=CRED_TYPE_GENERIC;record.TargetName=target.as_ptr() as *mut u16;
                record.CredentialBlobSize=bytes.len() as u32;record.CredentialBlob=bytes.as_mut_ptr();record.Persist=CRED_PERSIST_LOCAL_MACHINE;
                let result=CredWriteW(&record,0);bytes.fill(0);if result==0 {return Err("无法写入 Windows 凭据管理器".into());}
            },None=>{if CredDeleteW(target.as_ptr(),CRED_TYPE_GENERIC,0)==0 && windows_sys::Win32::Foundation::GetLastError()!=1168 {return Err("无法移除 Windows 凭据".into());}}
        } return Ok(None); }
        let mut record=std::ptr::null_mut();
        if CredReadW(target.as_ptr(),CRED_TYPE_GENERIC,0,&mut record)==0 { return if windows_sys::Win32::Foundation::GetLastError()==1168{Ok(None)}else{Err("无法读取 Windows 凭据管理器".into())}; }
        let bytes=std::slice::from_raw_parts((*record).CredentialBlob,(*record).CredentialBlobSize as usize);
        let result=String::from_utf8(bytes.to_vec()).map_err(|_|"凭据格式无效".to_string());CredFree(record as *const _);result.map(Some)
    }
}
#[cfg(not(windows))]
pub fn credential(_: &str,_:Option<Option<&str>>)->Result<Option<String>,String> {Err("当前仅支持 Windows 凭据存储".into())}

pub struct BalanceValue { pub available:bool,pub currency:String,pub total:f64,pub granted:f64,pub topped_up:f64 }
pub fn parse(value:&Value)->Result<BalanceValue,String> {
    let infos=value["balance_infos"].as_array().ok_or("余额响应缺少 balance_infos")?;
    let entry=infos.iter().find(|v|v["currency"]=="CNY").or_else(||infos.first()).ok_or("余额响应为空")?;
    let number=|key:&str| -> Result<f64,String> { let n=entry[key].as_str().and_then(|s|s.parse().ok()).or(entry[key].as_f64()).ok_or("余额字段无效")?;
        if !f64::is_finite(n)||n<0. {return Err("余额字段无效".into());}Ok(n) };
    let currency=entry["currency"].as_str().filter(|v|*v=="CNY"||*v=="USD").ok_or("未知币种")?;
    Ok(BalanceValue{available:value["is_available"].as_bool().ok_or("余额响应缺少账户状态")?,currency:currency.into(),total:number("total_balance")?,granted:number("granted_balance")?,topped_up:number("topped_up_balance")?})
}
pub fn query(target:&str)->Result<BalanceValue,String> {
    let mut key=credential(target,None)?.ok_or("请先配置 DeepSeek API Key")?;
    let client=reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(12)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"无法创建余额连接")?;
    let result=client.get("https://api.deepseek.com/user/balance").bearer_auth(&key).send();
    // The credential only exists in this native request, never in the frontend snapshot or disk settings.
    key.clear();
    let response=result.map_err(|_|"余额查询失败，请检查网络后重试")?;
    if !response.status().is_success() {return Err(match response.status().as_u16(){401|403=>"DeepSeek 密钥无效或没有权限",429=>"查询过于频繁，请稍后重试",_=>"DeepSeek 服务暂不可用"}.into());}
    if response.content_length().is_some_and(|n|n>65536) {return Err("余额响应过大".into());}
    use std::io::Read;let mut bytes=vec![];response.take(65537).read_to_end(&mut bytes).map_err(|_|"余额响应读取失败")?;
    if bytes.len()>65536 {return Err("余额响应过大".into());}parse(&serde_json::from_slice(&bytes).map_err(|_|"余额响应不是有效 JSON")?)
}
pub fn apply(balance:&mut Balance,value:BalanceValue,at:u64) {
    let same_day=balance.updated_at.is_some_and(|old|day(old)==day(at));
    let decrease=if same_day&&balance.currency.as_deref()==Some(value.currency.as_str()) {balance.total.map(|old|(old-value.total).max(0.)).unwrap_or(0.)}else{0.};
    balance.history.push(BalanceRecord{at,day:day(at),currency:value.currency.clone(),total:value.total,decrease});
    balance.available=Some(value.available);balance.currency=Some(value.currency);balance.total=Some(value.total);balance.granted=Some(value.granted);balance.topped_up=Some(value.topped_up);balance.updated_at=Some(at);balance.error=None;
}
#[cfg(test)]mod tests {use super::*;use serde_json::json;
    #[test]#[cfg(windows)]fn credential_roundtrip_isolated_target(){let target=format!("desktop-pet-test-{}",uuid::Uuid::new_v4());assert_eq!(credential(&target,None).unwrap(),None);credential(&target,Some(Some("fixture-only-no-real-key"))).unwrap();let read=credential(&target,None);credential(&target,Some(None)).unwrap();assert_eq!(read.unwrap().as_deref(),Some("fixture-only-no-real-key"));assert_eq!(credential(&target,None).unwrap(),None);}
    fn v(n:f64)->BalanceValue {BalanceValue{available:true,currency:"CNY".into(),total:n,granted:0.,topped_up:n}}
    #[test]fn deposit_and_new_day_are_not_spend(){let mut b=Balance::default();let t=1750000000000;apply(&mut b,v(20.),t);apply(&mut b,v(18.),t+1000);apply(&mut b,v(28.),t+2000);apply(&mut b,v(26.),t+86400000);assert_eq!(b.history.iter().map(|r|r.decrease).sum::<f64>(),2.);}
    #[test]fn parses_official_decimal_strings_and_rejects_missing_balance(){let p=parse(&json!({"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"12.50","granted_balance":"0","topped_up_balance":"12.50"}]})).unwrap();assert_eq!(p.total,12.5);assert!(parse(&json!({"balance_infos":[]})).is_err());}
}
