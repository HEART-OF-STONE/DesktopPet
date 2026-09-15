let context: AudioContext | undefined;
export function softChime(volume: number): void {
  try {
    context ||= new AudioContext();
    const audio=context;
    void audio.resume().then(()=>{
      if(audio.state!=='running')return;
      const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(660,start);oscillator.frequency.exponentialRampToValueAtTime(880,start+.12);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(Math.max(0,Math.min(1,volume))*.12,start+.015);gain.gain.exponentialRampToValueAtTime(.001,start+.22);
      oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(start);oscillator.stop(start+.24);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }).catch(()=>{});
  } catch { /* Audio availability never blocks an interaction. */ }
}
