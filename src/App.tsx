import { useState, useEffect, useRef, useCallback } from 'react';
import { useRadioAudio } from './hooks/useRadioAudio';

interface RadioMessage {
  id: number;
  callsign: string;
  text: string;
  timestamp: Date;
  isIncoming: boolean;
}

const CALLSIGNS = ['Alpha-1', 'Bravo-2', 'Charlie-3', 'Delta-4', 'Echo-5', 'Foxtrot-6'];

const SIMULATED_MESSAGES = [
  "All units, this is Command. Status report, over.",
  "Roger that Command. Alpha-1 in position. All clear.",
  "Bravo-2 checking in. Sector 7 secure. Over.",
  "Command, we have movement at grid reference 4-7. Requesting backup.",
  "Copy that. Delta-4 en route to your position. ETA 3 minutes.",
  "All units, maintain radio silence. Repeat, radio silence.",
  "Echo-5 to Command. Package delivered. Returning to base.",
  "Foxtrot-6 reporting. Perimeter established. No contact.",
  "Command, requesting medevac at our position. Over.",
  "Roger Foxtrot-6. Medevac inbound. Hold your position.",
  "All units, new coordinates received. Rally point Charlie. Move out.",
  "Charlie-3 in position at rally point. Waiting for further orders.",
  "Command, we have visual on target. Awaiting your go.",
  "Negative. Hold position. Repeat, hold position.",
  "Bravo-2, report your ammo status. Over.",
  "Command, Bravo-2. Green across the board. Ready to engage.",
];

const FREQUENCIES = [
  { name: 'TACTICAL-1', freq: '142.500' },
  { name: 'TACTICAL-2', freq: '148.225' },
  { name: 'COMMAND', freq: '156.800' },
  { name: 'MEDICAL', freq: '162.400' },
  { name: 'LOGISTICS', freq: '171.050' },
];

export default function App() {
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [volume, setVolumeState] = useState(0.5);
  const [currentFrequency, setCurrentFrequency] = useState(0);
  const [messages, setMessages] = useState<RadioMessage[]>([]);
  const [signalStrength, setSignalStrength] = useState(4);
  const [batteryLevel, setBatteryLevel] = useState(87);
  const [isOn, setIsOn] = useState(false);
  const [myCallsign] = useState('Sierra-7');
  const messageEndRef = useRef<HTMLDivElement>(null);
  const simulationTimerRef = useRef<number | null>(null);
  const messageIndexRef = useRef(0);

  const {
    initAudio,
    playTransmissionStart,
    playTransmissionEnd,
    playIncomingStatic,
    playSquelch,
    setVolume,
  } = useRadioAudio();

  // Simulate signal fluctuation
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => {
      setSignalStrength(Math.floor(Math.random() * 2) + 3); // 3-5 bars
    }, 3000);
    return () => clearInterval(interval);
  }, [isOn]);

  // Simulate battery drain
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => {
      setBatteryLevel(prev => Math.max(0, prev - 0.1));
    }, 30000);
    return () => clearInterval(interval);
  }, [isOn]);

  // Simulate incoming messages
  useEffect(() => {
    if (!isOn) return;

    const scheduleNextMessage = () => {
      const delay = Math.random() * 8000 + 5000; // 5-13 seconds
      simulationTimerRef.current = window.setTimeout(() => {
        const sender = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
        const text = SIMULATED_MESSAGES[messageIndexRef.current % SIMULATED_MESSAGES.length];
        messageIndexRef.current++;

        setIsReceiving(true);
        playIncomingStatic();

        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now(),
            callsign: sender,
            text,
            timestamp: new Date(),
            isIncoming: true,
          }]);
          setIsReceiving(false);
        }, 800);

        scheduleNextMessage();
      }, delay);
    };

    scheduleNextMessage();

    return () => {
      if (simulationTimerRef.current) {
        clearTimeout(simulationTimerRef.current);
      }
    };
  }, [isOn, playIncomingStatic]);

  // Auto-scroll messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handlePowerToggle = () => {
    if (!isOn) {
      initAudio();
      playSquelch();
    }
    setIsOn(!isOn);
    if (isOn) {
      setMessages([]);
    }
  };

  const handlePushToTalk = useCallback(() => {
    if (!isOn || isReceiving) return;
    setIsTransmitting(true);
    playTransmissionStart();

    // Simulate voice transmission
    const message = SIMULATED_MESSAGES[Math.floor(Math.random() * SIMULATED_MESSAGES.length)];
    
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        callsign: myCallsign,
        text: message,
        timestamp: new Date(),
        isIncoming: false,
      }]);
      setIsTransmitting(false);
      playTransmissionEnd();
    }, 2000 + Math.random() * 2000);
  }, [isOn, isReceiving, myCallsign, playTransmissionStart, playTransmissionEnd]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolumeState(newVolume);
    setVolume(newVolume);
  };

  const cycleFrequency = () => {
    if (!isOn) return;
    playSquelch();
    setCurrentFrequency(prev => (prev + 1) % FREQUENCIES.length);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-2 font-mono select-none">
      {/* Phone frame */}
      <div className="w-full max-w-[400px] h-[780px] bg-gray-900 rounded-[2.5rem] border-4 border-gray-700 shadow-2xl overflow-hidden relative flex flex-col">
        
        {/* Status bar */}
        <div className="bg-black px-4 py-1 flex items-center justify-between text-[10px] text-gray-400">
          <span>ARMY RADIO v2.1</span>
          <div className="flex items-center gap-2">
            <span>{Math.round(batteryLevel)}%</span>
            <div className="flex gap-[1px]">
              {[1,2,3,4].map(i => (
                <div key={i} className={`w-[3px] h-[8px] rounded-[1px] ${i <= signalStrength ? 'bg-green-400' : 'bg-gray-600'}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Radio Header */}
        <div className={`px-4 py-3 border-b ${isOn ? 'border-green-900/50' : 'border-gray-800'} transition-colors`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isOn ? (isTransmitting ? 'bg-red-500 animate-pulse' : isReceiving ? 'bg-yellow-400 animate-pulse' : 'bg-green-500') : 'bg-gray-600'}`} />
              <span className={`text-xs font-bold tracking-wider ${isOn ? 'text-green-400' : 'text-gray-600'}`}>
                {isTransmitting ? 'TRANSMITTING' : isReceiving ? 'RECEIVING' : isOn ? 'STANDBY' : 'OFFLINE'}
              </span>
            </div>
            <button
              onClick={handlePowerToggle}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isOn ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Frequency Display */}
        <div className={`px-4 py-3 ${isOn ? 'bg-gray-900/80' : 'bg-gray-900/40'} transition-colors`}>
          <button onClick={cycleFrequency} className="w-full text-left">
            <div className={`text-[10px] tracking-widest ${isOn ? 'text-green-600' : 'text-gray-700'}`}>
              CHANNEL: {FREQUENCIES[currentFrequency].name}
            </div>
            <div className={`text-2xl font-bold tracking-wider ${isOn ? 'text-green-400' : 'text-gray-700'} transition-colors`}>
              {FREQUENCIES[currentFrequency].freq} <span className="text-sm">MHz</span>
            </div>
          </button>
          
          {/* Signal visualization */}
          {isOn && (
            <div className="mt-2 flex items-center gap-1">
              <div className="flex gap-[2px] items-end h-4">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-[3px] rounded-full transition-all duration-150 ${
                      isTransmitting || isReceiving
                        ? `bg-green-400`
                        : 'bg-green-900'
                    }`}
                    style={{
                      height: `${Math.random() * 100}%`,
                      animationDelay: `${i * 50}ms`,
                      opacity: isTransmitting || isReceiving ? 0.6 + Math.random() * 0.4 : 0.3,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Callsign */}
        <div className="px-4 py-2 border-b border-gray-800/50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 tracking-wider">YOUR CALLSIGN</span>
            <span className="text-sm font-bold text-amber-400 tracking-wider">{myCallsign}</span>
          </div>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
          {messages.length === 0 && isOn && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 text-xs text-center animate-pulse">
                MONITORING FREQUENCY...<br />
                <span className="text-[10px]">Press PTT to transmit</span>
              </p>
            </div>
          )}
          {!isOn && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-700 text-xs text-center">
                RADIO OFFLINE<br />
                <span className="text-[10px]">Press power button to start</span>
              </p>
            </div>
          )}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`p-2 rounded-lg border ${
                msg.isIncoming
                  ? 'bg-gray-800/50 border-gray-700/50'
                  : 'bg-green-950/30 border-green-900/30'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold tracking-wider ${
                  msg.isIncoming ? 'text-blue-400' : 'text-green-400'
                }`}>
                  {msg.isIncoming ? '⬇' : '⬆'} {msg.callsign}
                </span>
                <span className="text-[9px] text-gray-600">{formatTime(msg.timestamp)}</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">{msg.text}</p>
            </div>
          ))}
          {isReceiving && (
            <div className="p-2 rounded-lg border border-yellow-900/30 bg-yellow-950/20 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                <span className="text-[10px] text-yellow-400 tracking-wider">INCOMING TRANSMISSION...</span>
              </div>
            </div>
          )}
          <div ref={messageEndRef} />
        </div>

        {/* Volume Control */}
        <div className="px-4 py-2 border-t border-gray-800/50">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500"
              disabled={!isOn}
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </div>
        </div>

        {/* PTT Button */}
        <div className="px-4 py-4 bg-gray-900/80 border-t border-gray-800">
          <button
            onMouseDown={handlePushToTalk}
            onTouchStart={(e) => { e.preventDefault(); handlePushToTalk(); }}
            disabled={!isOn || isReceiving}
            className={`w-full py-5 rounded-xl font-bold text-lg tracking-wider transition-all duration-150 ${
              isTransmitting
                ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] scale-95 border-2 border-red-400'
                : isOn && !isReceiving
                ? 'bg-gradient-to-b from-gray-700 to-gray-800 text-green-400 border-2 border-green-900/50 active:scale-95 active:bg-green-900 active:border-green-500 shadow-lg'
                : 'bg-gray-800 text-gray-600 border-2 border-gray-700 cursor-not-allowed'
            }`}
          >
            {isTransmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full bg-white animate-pulse" />
                TRANSMITTING...
              </span>
            ) : isReceiving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
                RECEIVING...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                PUSH TO TALK
              </span>
            )}
          </button>
          <p className="text-center text-[9px] text-gray-600 mt-2 tracking-wider">
            HOLD BUTTON TO TRANSMIT • RELEASE TO LISTEN
          </p>
        </div>

        {/* Bottom bar */}
        <div className="bg-black px-4 py-2 flex items-center justify-center">
          <div className="w-32 h-1 bg-gray-700 rounded-full" />
        </div>
      </div>
    </div>
  );
}
