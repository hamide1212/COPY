import { useRef, useCallback, useEffect } from 'react';

export function useRadioAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const staticNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const staticGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const isInitializedRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const processedStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

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

    // Static noise generator (background radio static)
    const staticGain = ctx.createGain();
    staticGain.gain.value = 0.06;
    staticGain.connect(masterGain);
    staticGainRef.current = staticGain;

    startStaticNoise(ctx, staticGain);
    isInitializedRef.current = true;
  }, [getAudioContext]);

  const startStaticNoise = (ctx: AudioContext, gainNode: GainNode) => {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const noise = Math.random() * 2 - 1;
      // Add occasional crackles
      const crackle = Math.random() > 0.998 ? (Math.random() * 2 - 1) * 4 : 0;
      // Add some low-frequency rumble
      const rumble = Math.sin(i / 500) * 0.1 * (Math.random() * 0.5);
      data[i] = noise * 0.25 + crackle + rumble;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    // Bandpass filter for radio-like static
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 2500;
    bandpass.Q.value = 0.7;

    source.connect(bandpass);
    bandpass.connect(gainNode);
    source.start();

    staticNodeRef.current = source;
  };

  const startTransmission = useCallback(async (): Promise<MediaStream> => {
    const ctx = getAudioContext();

    // Increase static during transmission
    if (staticGainRef.current) {
      staticGainRef.current.gain.setTargetAtTime(0.15, ctx.currentTime, 0.02);
    }

    // Play transmission start beep
    playTone(1200, 0.08, 0.12);

    // Get microphone access
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        } 
      });
      micStreamRef.current = micStream;

      // Create the processing chain for radio effect
      const dest = ctx.createMediaStreamDestination();
      processedStreamDestRef.current = dest;

      // 1. Bandpass filter (telephone/radio frequency range: 300Hz - 3400Hz)
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 400;
      highpass.Q.value = 1;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3200;
      lowpass.Q.value = 1;

      // 2. Distortion for radio crunchiness
      const distortion = ctx.createWaveShaper();
      distortion.curve = makeDistortionCurve(30) as any;
      distortion.oversample = '4x';

      // 3. Compression for consistent volume
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 10;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.1;

      // 4. Gain
      const outputGain = ctx.createGain();
      outputGain.gain.value = 1.5;

      // Connect chain: mic -> highpass -> lowpass -> distortion -> compressor -> gain -> dest
      highpass.connect(lowpass);
      lowpass.connect(distortion);
      distortion.connect(compressor);
      compressor.connect(outputGain);
      outputGain.connect(dest);

      // Create source from mic and connect to chain
      const micSource = ctx.createMediaStreamSource(micStream);
      micSourceRef.current = micSource;
      micSource.connect(highpass);

      return dest.stream;
    } catch (err) {
      console.error('Microphone access denied:', err);
      throw err;
    }
  }, [getAudioContext]);

  const stopTransmission = useCallback(() => {
    const ctx = audioContextRef.current;
    
    // Play transmission end beep
    playTone(800, 0.1, 0.1);

    // Reduce static back to idle
    if (staticGainRef.current && ctx) {
      staticGainRef.current.gain.setTargetAtTime(0.06, ctx.currentTime, 0.05);
    }

    // Stop microphone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    // Disconnect mic source
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
  }, []);

  // Play incoming audio with radio effects
  const playIncomingAudio = useCallback((stream: MediaStream): AudioContext => {
    const ctx = getAudioContext();

    // Increase static for incoming
    if (staticGainRef.current) {
      staticGainRef.current.gain.setTargetAtTime(0.2, ctx.currentTime, 0.01);
    }

    // Play squelch/opening burst
    playSquelchBurst(ctx);

    // Create source from incoming stream
    const source = ctx.createMediaStreamSource(stream);

    // Apply radio receive filter (narrower, more radio-like)
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1800;
    bandpass.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.value = 1.8;

    source.connect(bandpass);
    bandpass.connect(gain);
    if (masterGainRef.current) {
      gain.connect(masterGainRef.current);
    }

    return ctx;
  }, [getAudioContext]);

  const stopIncomingAudio = useCallback(() => {
    const ctx = audioContextRef.current;
    if (staticGainRef.current && ctx) {
      staticGainRef.current.gain.setTargetAtTime(0.06, ctx.currentTime, 0.05);
    }
  }, []);

  const playTone = (freq: number, duration: number, volume: number) => {
    const ctx = audioContextRef.current;
    if (!ctx || !masterGainRef.current) return;

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    oscGain.gain.value = volume;
    osc.connect(oscGain);
    oscGain.connect(masterGainRef.current);
    osc.start();
    oscGain.gain.setTargetAtTime(0, ctx.currentTime + duration * 0.7, 0.01);
    osc.stop(ctx.currentTime + duration);
  };

  const playSquelchBurst = (ctx: AudioContext) => {
    if (!masterGainRef.current) return;

    // Short burst of filtered noise (squelch opening sound)
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const envelope = 1 - (i / bufferSize);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = 0.25;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainRef.current);
    source.start();
  };

  const playSquelch = useCallback(() => {
    const ctx = getAudioContext();
    if (!masterGainRef.current) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 120;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(masterGainRef.current);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }, [getAudioContext]);

  const setVolume = useCallback((volume: number) => {
    if (masterGainRef.current && audioContextRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume, audioContextRef.current.currentTime, 0.02);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (staticNodeRef.current) {
        try { staticNodeRef.current.stop(); } catch(e) {}
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    initAudio,
    startTransmission,
    stopTransmission,
    playIncomingAudio,
    stopIncomingAudio,
    playSquelch,
    setVolume,
  };
}

// Distortion curve generator
function makeDistortionCurve(amount: number) {
  const k = typeof amount === 'number' ? amount : 50;
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
