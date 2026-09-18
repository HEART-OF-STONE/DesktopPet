use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", default)]
pub struct Settings {
    pub codex_enabled: bool, pub codex_home: String, pub codex_executable: String,
    pub bridge_enabled: bool, pub deepseek_enabled: bool,
    pub low_balance: f64, pub daily_budget: f64,
    pub notify_completed: bool, pub notify_failed: bool, pub notify_approval: bool,
    pub completion_template: String,
    pub show_pet_status: bool, pub pet_metric: String, pub pet_layout:String,
}
impl Default for Settings {
    fn default() -> Self { Self { codex_enabled:true, codex_home:String::new(), codex_executable:String::new(),
        bridge_enabled:false, deepseek_enabled:false, low_balance:10., daily_budget:10.,
        notify_completed:true, notify_failed:true, notify_approval:true,
        completion_template:"{source} 的任务完成了 · {tokens}".into(),show_pet_status:true,pet_metric:"none".into(),pet_layout:"side".into() } }
}
#[derive(Clone, Default, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all="camelCase", default)]
pub struct Tokens { pub input:u64, pub cached:u64, pub output:u64, pub reasoning:u64, pub total:u64 }
impl Tokens {
    pub fn add(&mut self, value:&Self) { self.input=self.input.saturating_add(value.input); self.cached=self.cached.saturating_add(value.cached);
        self.output=self.output.saturating_add(value.output); self.reasoning=self.reasoning.saturating_add(value.reasoning); self.total=self.total.saturating_add(value.total); }
    pub fn delta(&self, old:&Self) -> Self {
        if self.total < old.total { return self.clone(); }
        Self { input:self.input.saturating_sub(old.input), cached:self.cached.saturating_sub(old.cached), output:self.output.saturating_sub(old.output),
            reasoning:self.reasoning.saturating_sub(old.reasoning), total:self.total.saturating_sub(old.total) }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct UsageRecord { pub id:String, pub at:u64, pub day:String, pub source:String, pub model:String, pub tokens:Tokens }
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct PriceRate {pub source:String,pub model:String,pub input:f64,pub cached:f64,pub output:f64}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Task { pub id:String, pub source:String, pub session_id:String, pub turn_id:String, pub status:String, pub updated_at:u64, pub tokens:Option<u64> }
#[derive(Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase", default)]
pub struct Cursor { pub offset:u64, pub prefix:String, pub session_id:String, pub turn_id:String, pub model:String, pub cumulative:Tokens }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct QuotaWindow { pub bucket:String, pub label:String, pub used_percent:f64, pub window_minutes:u64, pub resets_at:Option<u64>, #[serde(default)] pub limit_name:Option<String>, #[serde(default)] pub updated_at:Option<u64>, #[serde(default)] pub source:String }
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all="camelCase", default)]
pub struct Quota { pub windows:Vec<QuotaWindow>, pub updated_at:Option<u64>, pub source:String, pub error:Option<String>, pub bucket_updated_at:BTreeMap<String,u64> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct BalanceRecord { pub at:u64, pub day:String, pub currency:String, pub total:f64, pub decrease:f64 }
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all="camelCase", default)]
pub struct Balance {
    pub configured:bool, pub available:Option<bool>, pub currency:Option<String>, pub total:Option<f64>,
    pub granted:Option<f64>, pub topped_up:Option<f64>, pub updated_at:Option<u64>, pub error:Option<String>,
    pub history:Vec<BalanceRecord>, pub low_alert_active:bool, pub budget_alert_day:String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", default)]
pub struct Data {
    pub version:u8, pub settings:Settings, pub cursors:BTreeMap<String,Cursor>, pub usage:Vec<UsageRecord>, pub tasks:Vec<Task>,
    pub seen_events:BTreeMap<String,u64>, pub quota:Quota, pub balance:Balance,
    pub quota_poll:super::quota_poll::QuotaPoll,
    pub scan_at:Option<u64>, pub scan_error:Option<String>, pub scanned_files:usize, pub detected_home:String, pub scan_pending:bool,
    pub inbox:Vec<InboxItem>,
    pub price_rates:Vec<PriceRate>,pub pricing_updated_at:Option<u64>,
}
impl Default for Data {
    fn default()->Self { Self { version:1,settings:Settings::default(),cursors:BTreeMap::new(),usage:vec![],tasks:vec![],seen_events:BTreeMap::new(),
        quota:Quota::default(),quota_poll:Default::default(),balance:Balance::default(),scan_at:None,scan_error:None,scanned_files:0,detected_home:String::new(),scan_pending:false,inbox:vec![],price_rates:super::pricing::default_rates(),pricing_updated_at:None } }
}
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct InboxItem {pub id:String,pub source:String,pub kind:String,pub text:String,pub at:u64,pub read:bool}
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct Notice { pub id:String, pub source:String, pub kind:String, pub text:String }
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Demo {pub id:String,pub kind:String,pub expires_at:u64}
#[derive(Clone,Default,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Connection {pub tested_at:Option<u64>,pub last_event_at:Option<u64>,pub last_source:Option<String>}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct AgentEvent {
    pub event_id:String, pub source:String, pub session_id:String, pub turn_id:String, pub status:String,
    pub timestamp:u64, pub model:Option<String>, pub tokens:Option<Tokens>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_settings_keep_connections_and_default_pet_display() {
        let settings:Settings=serde_json::from_str(r#"{"codexEnabled":false,"bridgeEnabled":true,"completionTemplate":"旧提醒"}"#).unwrap();
        assert!(!settings.codex_enabled);
        assert!(settings.bridge_enabled);
        assert_eq!(settings.completion_template,"旧提醒");
        assert!(settings.show_pet_status);
        assert_eq!(settings.pet_layout,"side");
        assert_eq!(settings.pet_metric,"none");
        let restored:Settings=serde_json::from_str(r#"{"showPetStatus":false,"petMetric":"balance"}"#).unwrap();
        assert!(!restored.show_pet_status);
        assert_eq!(restored.pet_metric,"balance");
    }
}
