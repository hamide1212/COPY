import { useRef, useCallback, useEffect } from 'react';

export function useRadioAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const staticNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const staticGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const isInitializedRef = useRef(false);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const initAudio = useCallback(() => {
    if (isInitializedRef.current) return;
    
    const ctx = getAudioContext();
    
    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    // Static noise generator
    const staticGain = ctx.createGain();
    staticGain.gain.value = 0.08;
    staticGain.connect(masterGain);
    staticGainRef.current = staticGain;

    startStaticNoise(ctx, staticGain);
    isInitializedRef.current = true;
  }, [getAudioContext]);

  const startStaticNoise = (ctx: AudioContext, gainNode: GainNode) => {
    // Create white noise buffer
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      // Mix of white noise and crackle
      const noise = Math.random() * 2 - 1;
      const crackle = Math.random() > 0.997 ? (Math.random() * 2 - 1) * 3 : 0;
      data[i] = noise * 0.3 + crackle;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Add a bandpass filter for radio-like sound
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2000;
    bandpass.Q.value = 0.5;

    source.connect(bandpass);
    bandpass.connect(gainNode);
    source.start();

    staticNodeRef.current = source;
  };

  const playTransmissionStart = useCallback(() => {
    const ctx = getAudioContext();
    const masterGain = masterGainRef.current;
    if (!masterGain) return;

    // Increase static during transmission
    if (staticGainRef.current) {
      staticGainRef.current.gain.setTargetAtTime(0.25, ctx.currentTime, 0.02);
    }

    // Play a short beep (transmission start tone)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    oscGain.gain.value = 0.15;
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    oscGain.gain.setTargetAtTime(0, ctx.currentTime + 0.06, 0.01);
  }, [getAudioContext]);

  const playTransmissionEnd = useCallback(() => {
    const ctx = getAudioContext();
    
    // Reduce static back to idle
    if (staticGainRef.current) {
      staticGainRef.current.gain.setTargetAtTime(0.08, ctx.currentTime, 0.05);
    }

    // Play end tone
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    oscGain.gain.value = 0.12;
    osc.connect(oscGain);
    if (masterGainRef.current) {
      oscGain.connect(masterGainRef.current);
    }
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    oscGain.gain.setTargetAtTime(0, ctx.currentTime + 0.08, 0.02);
  }, [getAudioContext]);

  const playIncomingStatic = useCallback(() => {
    const ctx = getAudioContext();
    if (!masterGainRef.current) return;

    // Burst of static for incoming message
    if (staticGainRef.current) {
      staticGainRef.current.gain.setTargetAtTime(0.35, ctx.currentTime, 0.01);
    }

    // Quick squelch sound
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseData.length);
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.3;
    noiseSource.connect(noiseGain);
    noiseGain.connect(masterGainRef.current);
    noiseSource.start();
  }, [getAudioContext]);

  const playSquelch = useCallback(() => {
    const ctx = getAudioContext();
    if (!masterGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 150;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(masterGainRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }, [getAudioContext]);

  const setVolume = useCallback((volume: number) => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume, audioContextRef.current?.currentTime || 0, 0.02);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (staticNodeRef.current) {
        staticNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    initAudio,
    playTransmissionStart,
    playTransmissionEnd,
    playIncomingStatic,
    playSquelch,
    setVolume,
  };
}
