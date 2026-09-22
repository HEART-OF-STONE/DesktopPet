// Local test server only. Never reads credentials or sends network requests.
use std::{io::{self,BufRead,Write},fs::OpenOptions,path::PathBuf};
fn main(){
    let root=PathBuf::from(std::env::var_os("CODEX_HOME").expect("isolated test home"));
    for line in io::stdin().lock().lines(){let line=line.unwrap();
        if line.contains("\"method\":\"initialize\""){println!("{{\"id\":1,\"result\":{{}}}}");}
        if line.contains("account/rateLimits/read"){
            writeln!(OpenOptions::new().create(true).append(true).open(root.join("quota-requests.txt")).unwrap(),"request").unwrap();
            if root.join("fail-quota").exists(){println!("{{\"id\":2,\"error\":{{\"code\":429,\"message\":\"fixture failure\"}}}}");}
            else{println!("{}",r#"{"id":2,"result":{"rateLimits":{"limitId":"codex","primary":{"usedPercent":30,"windowDurationMins":10080},"secondary":null,"credits":{"balance":"1234.5","hasCredits":true,"unlimited":false}}}}"#);}
        }
        io::stdout().flush().unwrap();
    }
}
