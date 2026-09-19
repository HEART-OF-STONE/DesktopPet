use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let file = std::env::args().nth(1).ok_or("installer path required")?;
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))?;
    let key = config["plugins"]["updater"]["pubkey"].as_str().ok_or("public key missing")?;
    let key = PublicKey::decode(&String::from_utf8(STANDARD.decode(key)?)?)?;
    let signature = std::fs::read_to_string(format!("{file}.sig"))?;
    let signature = Signature::decode(&String::from_utf8(STANDARD.decode(signature.trim())?)?)?;
    key.verify(&std::fs::read(file)?, &signature, true)?;
    println!("Installer signature matches the application's pinned public key.");
    Ok(())
}
