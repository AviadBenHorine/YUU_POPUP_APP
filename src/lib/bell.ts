export function playBell(): void {
  try {
    const ctx = new AudioContext()
    const ding = (startTime: number) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 880 // A5
      gain.gain.setValueAtTime(0.5, startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2)
      osc.start(startTime)
      osc.stop(startTime + 1.2)
    }
    ding(ctx.currentTime)
    ding(ctx.currentTime + 0.35)
  } catch {}
}
