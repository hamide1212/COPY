import { useState, useEffect, useRef, useCallback } from 'react';
import { usePeerConnection, PeerInfo } from './hooks/usePeerConnection';
import { useRadioAudio } from './hooks/useRadioAudio';

type Screen = 'lobby' | 'radio';

interface RadioMessage {
  id: number;
  callsign: string;
  text: string;
  timestamp: Date;
  isIncoming: boolean;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [myCallsign, setMyCallsign] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [receivingFrom, setReceivingFrom] = useState('');
  const [volume, setVolumeState] = useState(0.6);
  const [messages, setMessages] = useState<RadioMessage[]>([]);
  const [signalStrength, setSignalStrength] = useState(4);
  const [isOn, setIsOn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const messageEndRef = useRef<HTMLDivElement>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);

  const peer = usePeerConnection();
  const audio = useRadioAudio();

  // Setup incoming audio handler
  useEffect(() => {
    peer.onIncomingAudio((stream, callsign) => {
      setIsReceiving(true);
      setReceivingFrom(callsign);
      audio.playIncomingAudio(stream);
      
      setMessages(prev => [...prev, {
        id: Date.now(),
        callsign,
        text: '📡 Incoming transmission...',
        timestamp: new Date(),
        isIncoming: true,
      }]);
    });

    peer.onIncomingAudioEnd((callsign) => {
      setIsReceiving(false);
      setReceivingFrom('');
      audio.stopIncomingAudio();
      
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        callsign,
        text: '🔇 Transmission ended',
        timestamp: new Date(),
        isIncoming: true,
      }]);
    });
  }, [peer, audio]);

  // Simulate signal fluctuation
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => {
      setSignalStrength(Math.floor(Math.random() * 2) + 3);
    }, 3000);
    return () => clearInterval(interval);
  }, [isOn]);

  // Auto-scroll messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateRoom = async () => {
    if (!myCallsign.trim()) {
      setConnectionError('Enter your callsign first');
      return;
    }
    setConnecting(true);
    setConnectionError('');
    try {
      const code = await peer.createRoom(myCallsign.trim().toUpperCase());
      setRoomCode(code);
      setScreen('radio');
      setIsOn(true);
      audio.initAudio();
      
      setMessages(prev => [...prev, {
        id: Date.now(),
        callsign: 'SYSTEM',
        text: `Radio online. Room ${code} created. Share this code with your team.`,
        timestamp: new Date(),
        isIncoming: false,
      }]);
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to create room');
    }
    setConnecting(false);
  };

  const handleJoinRoom = async () => {
    if (!myCallsign.trim()) {
      setConnectionError('Enter your callsign first');
      return;
    }
    if (!joinCode.trim()) {
      setConnectionError('Enter the room code');
      return;
    }
    setConnecting(true);
    setConnectionError('');
    try {
      await peer.joinRoom(joinCode.trim().toUpperCase(), myCallsign.trim().toUpperCase());
      setRoomCode(joinCode.trim().toUpperCase());
      setScreen('radio');
      setIsOn(true);
      audio.initAudio();
      
      setMessages(prev => [...prev, {
        id: Date.now(),
        callsign: 'SYSTEM',
        text: `Connected to room ${joinCode.trim().toUpperCase()}. Radio online.`,
        timestamp: new Date(),
        isIncoming: false,
      }]);
    } catch (err: any) {
      setConnectionError(err.message || 'Failed to join room');
    }
    setConnecting(false);
  };

  const handlePushToTalk = useCallback(async () => {
    if (!isOn || isReceiving || !peer.isConnected) return;
    
    try {
      setIsTransmitting(true);
      
      // Start transmission - get processed mic stream
      const processedStream = await audio.startTransmission();
      currentStreamRef.current = processedStream;
      
      // Send to all peers
      peer.sendAudioStream(processedStream);

      setMessages(prev => [...prev, {
        id: Date.now(),
        callsign: myCallsign.toUpperCase(),
        text: '🎙️ Transmitting...',
        timestamp: new Date(),
        isIncoming: false,
      }]);
    } catch (err) {
      console.error('PTT Error:', err);
      setIsTransmitting(false);
      setMessages(prev => [...prev, {
        id: Date.now(),
        callsign: 'SYSTEM',
        text: '⚠️ Microphone access denied. Allow mic permissions.',
        timestamp: new Date(),
        isIncoming: false,
      }]);
    }
  }, [isOn, isReceiving, peer, audio, myCallsign]);

  const handleReleasePTT = useCallback(() => {
    if (!isTransmitting) return;
    
    audio.stopTransmission();
    peer.stopAudioStream();
    setIsTransmitting(false);
    currentStreamRef.current = null;
  }, [isTransmitting, audio, peer]);

  const handleLeaveRoom = () => {
    audio.stopTransmission();
    peer.leaveRoom();
    setScreen('lobby');
    setIsOn(false);
    setMessages([]);
    setRoomCode('');
    setIsTransmitting(false);
    setIsReceiving(false);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolumeState(newVolume);
    audio.setVolume(newVolume);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // ===== LOBBY SCREEN =====
  if (screen === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 font-mono">
        <div className="w-full max-w-[420px]">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-950/50 border-2 border-green-800/50 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-green-400 tracking-wider">ARMY RADIO</h1>
            <p className="text-xs text-gray-500 tracking-widest mt-1">TACTICAL COMMUNICATION SYSTEM</p>
          </div>

          {/* Callsign Input */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <label className="text-[10px] text-gray-500 tracking-widest block mb-2">YOUR CALLSIGN</label>
            <input
              type="text"
              value={myCallsign}
              onChange={(e) => setMyCallsign(e.target.value)}
              placeholder="e.g. Sierra-7"
              maxLength={16}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-green-400 placeholder-gray-600 text-sm tracking-wider focus:outline-none focus:border-green-700 transition-colors"
            />
          </div>

          {/* Create Room */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <label className="text-[10px] text-gray-500 tracking-widest block mb-3">CREATE NEW ROOM</label>
            <button
              onClick={handleCreateRoom}
              disabled={connecting || !myCallsign.trim()}
              className="w-full py-3 bg-green-900/50 border border-green-800/50 rounded-lg text-green-400 font-bold tracking-wider text-sm hover:bg-green-900/70 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {connecting ? 'CONNECTING...' : '📡 CREATE ROOM'}
            </button>
            <p className="text-[9px] text-gray-600 mt-2 text-center">Create a room and share the code with your team</p>
          </div>

          {/* Join Room */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <label className="text-[10px] text-gray-500 tracking-widest block mb-3">JOIN EXISTING ROOM</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-amber-400 placeholder-gray-600 text-sm tracking-widest text-center font-bold focus:outline-none focus:border-amber-700 transition-colors mb-3"
            />
            <button
              onClick={handleJoinRoom}
              disabled={connecting || !myCallsign.trim() || !joinCode.trim()}
              className="w-full py-3 bg-amber-900/30 border border-amber-800/50 rounded-lg text-amber-400 font-bold tracking-wider text-sm hover:bg-amber-900/50 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {connecting ? 'CONNECTING...' : '🔗 JOIN ROOM'}
            </button>
          </div>

          {/* Error */}
          {connectionError && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-3 text-center">
              <p className="text-red-400 text-xs">{connectionError}</p>
            </div>
          )}

          {/* Info */}
          <div className="text-center mt-6">
            <p className="text-[9px] text-gray-600 leading-relaxed">
              Peer-to-peer encrypted communication<br />
              No server required • Works over internet<br />
              One talks, all listen • Push-to-Talk
            </p>
          </div>

          {/* How to use */}
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4 mt-4">
            <p className="text-[10px] text-gray-400 tracking-widest mb-2 text-center font-bold">HOW TO USE</p>
            <div className="space-y-1.5 text-[10px] text-gray-500">
              <p>1. Enter your callsign (e.g. Alpha-1)</p>
              <p>2. One person creates a room</p>
              <p>3. Share the 6-letter room code with your team</p>
              <p>4. Others join using the code</p>
              <p>5. Hold PUSH TO TALK to speak</p>
              <p>6. Release to listen — one talks, all hear</p>
            </div>
            <div className="mt-3 pt-2 border-t border-gray-800/50">
              <p className="text-[9px] text-gray-600 text-center">
                ⚠️ Allow microphone access when prompted
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== RADIO SCREEN =====
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-2 font-mono select-none">
      <div className="w-full max-w-[400px] h-[780px] bg-gray-900 rounded-[2.5rem] border-4 border-gray-700 shadow-2xl overflow-hidden relative flex flex-col">
        
        {/* Status bar */}
        <div className="bg-black px-4 py-1.5 flex items-center justify-between text-[10px] text-gray-400">
          <span className="tracking-wider">ARMY RADIO</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-[1px]">
              {[1,2,3,4,5].map(i => (
                <div key={i} className={`w-[3px] h-[8px] rounded-[1px] ${i <= signalStrength ? 'bg-green-400' : 'bg-gray-600'}`} />
              ))}
            </div>
            <span className="text-green-400">●</span>
          </div>
        </div>

        {/* Radio Header */}
        <div className="px-4 py-2 border-b border-green-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                isTransmitting ? 'bg-red-500 animate-pulse' : 
                isReceiving ? 'bg-yellow-400 animate-pulse' : 
                'bg-green-500 animate-pulse'
              }`} />
              <span className={`text-[10px] font-bold tracking-wider ${
                isTransmitting ? 'text-red-400' : 
                isReceiving ? 'text-yellow-400' : 
                'text-green-400'
              }`}>
                {isTransmitting ? 'TRANSMITTING' : isReceiving ? `RECEIVING: ${receivingFrom}` : 'STANDBY'}
              </span>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-2 py-1 rounded bg-gray-800 text-gray-400 text-[9px] tracking-wider hover:bg-red-900/30 hover:text-red-400 transition-colors"
            >
              EXIT
            </button>
          </div>
        </div>

        {/* Room Code Display */}
        <div className="px-4 py-3 bg-gray-900/80 border-b border-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] text-gray-500 tracking-widest">ROOM CODE</div>
              <div className="text-xl font-bold text-amber-400 tracking-[0.3em]">{roomCode}</div>
            </div>
            <button
              onClick={copyRoomCode}
              className="px-3 py-2 bg-gray-800 rounded-lg text-[9px] text-gray-400 tracking-wider hover:bg-gray-700 active:scale-95 transition-all"
            >
              📋 COPY
            </button>
          </div>
        </div>

        {/* Connected Units */}
        <div className="px-4 py-2 border-b border-gray-800/30">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-gray-500 tracking-widest">CONNECTED UNITS</span>
            <span className="text-[9px] text-green-400">{peer.peers.length + 1} ONLINE</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="px-2 py-0.5 bg-green-950/50 border border-green-900/30 rounded text-[9px] text-green-400 tracking-wider">
              {myCallsign.toUpperCase()} (YOU)
            </span>
            {peer.peers.map(p => (
              <span key={p.peerId} className="px-2 py-0.5 bg-blue-950/30 border border-blue-900/30 rounded text-[9px] text-blue-400 tracking-wider">
                {p.callsign || 'UNIT'}
              </span>
            ))}
          </div>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 text-xs text-center animate-pulse">
                MONITORING CHANNEL...<br />
                <span className="text-[10px]">Hold PTT to talk to your team</span>
              </p>
            </div>
          )}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`p-2 rounded-lg border ${
                msg.callsign === 'SYSTEM'
                  ? 'bg-gray-800/30 border-gray-700/30'
                  : msg.isIncoming
                  ? 'bg-blue-950/20 border-blue-900/30'
                  : 'bg-green-950/20 border-green-900/30'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold tracking-wider ${
                  msg.callsign === 'SYSTEM' ? 'text-gray-400' :
                  msg.isIncoming ? 'text-blue-400' : 'text-green-400'
                }`}>
                  {msg.isIncoming ? '⬇' : msg.callsign === 'SYSTEM' ? '⚙' : '⬆'} {msg.callsign}
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
                <span className="text-[10px] text-yellow-400 tracking-wider">
                  INCOMING FROM {receivingFrom}...
                </span>
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
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer"
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
            onMouseUp={handleReleasePTT}
            onMouseLeave={handleReleasePTT}
            onTouchStart={(e) => { e.preventDefault(); handlePushToTalk(); }}
            onTouchEnd={(e) => { e.preventDefault(); handleReleasePTT(); }}
            disabled={isReceiving || !peer.isConnected}
            className={`w-full py-5 rounded-xl font-bold text-lg tracking-wider transition-all duration-150 ${
              isTransmitting
                ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] scale-95 border-2 border-red-400'
                : isReceiving
                ? 'bg-yellow-900/30 text-yellow-400 border-2 border-yellow-800/50 cursor-not-allowed'
                : 'bg-gradient-to-b from-gray-700 to-gray-800 text-green-400 border-2 border-green-900/50 active:scale-95 active:bg-green-900 active:border-green-500 shadow-lg'
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
                RECEIVING FROM {receivingFrom}
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
            HOLD TO TALK • RELEASE TO LISTEN • ONE TALKS ALL LISTEN
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
