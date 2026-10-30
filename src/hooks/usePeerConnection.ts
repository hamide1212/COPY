import { useRef, useState, useCallback, useEffect } from 'react';
import Peer, { MediaConnection, DataConnection } from 'peerjs';

export interface PeerInfo {
  peerId: string;
  callsign: string;
  connected: boolean;
}

export type ConnectionStatus = 
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'waiting-for-peers'
  | 'error';

export interface UsePeerConnectionReturn {
  myPeerId: string | null;
  peers: PeerInfo[];
  status: ConnectionStatus;
  isHost: boolean;
  createRoom: (callsign: string) => Promise<string>;
  joinRoom: (roomCode: string, callsign: string) => Promise<void>;
  leaveRoom: () => void;
  sendAudioStream: (stream: MediaStream) => void;
  stopAudioStream: () => void;
  onIncomingAudio: (callback: (stream: MediaStream, callsign: string) => void) => void;
  onIncomingAudioEnd: (callback: (callsign: string) => void) => void;
  error: string | null;
  debugLog: string[];
}

// Multiple ICE servers for better connectivity across networks
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export function usePeerConnection(): UsePeerConnectionReturn {
  const peerRef = useRef<Peer | null>(null);
  const mediaConnectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  const dataConnectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const myStreamRef = useRef<MediaStream | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const incomingAudioCallbackRef = useRef<((stream: MediaStream, callsign: string) => void) | null>(null);
  const incomingAudioEndCallbackRef = useRef<((callsign: string) => void) | null>(null);
  const callsignRef = useRef<string>('');
  const peerCallsignsRef = useRef<Map<string, string>>(new Map());
  const isHostRef = useRef(false);

  const log = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog(prev => [...prev.slice(-19), `[${timestamp}] ${msg}`]);
    console.log(`[ArmyRadio] ${msg}`);
  }, []);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const broadcastPeerList = useCallback(() => {
    if (!isHostRef.current) return;
    const peerList = Array.from(peerCallsignsRef.current.entries()).map(([peerId, callsign]) => ({
      peerId,
      callsign,
    }));

    dataConnectionsRef.current.forEach((conn) => {
      try {
        conn.send({ type: 'peer-list', peers: peerList });
      } catch (e) {
        log(`Failed to broadcast peer list: ${e}`);
      }
    });
  }, [log]);

  const updatePeersState = useCallback(() => {
    const peerList: PeerInfo[] = [];
    peerCallsignsRef.current.forEach((callsign, peerId) => {
      peerList.push({ peerId, callsign, connected: true });
    });
    setPeers(peerList);
  }, []);

  const setupDataConnection = useCallback((conn: DataConnection) => {
    conn.on('open', () => {
      log(`Data connection opened with: ${conn.peer}`);
      conn.send({ type: 'callsign', callsign: callsignRef.current });
      
      if (isHostRef.current) {
        setTimeout(() => broadcastPeerList(), 500);
      }
    });

    conn.on('data', (data: any) => {
      if (data.type === 'callsign') {
        peerCallsignsRef.current.set(conn.peer, data.callsign);
        log(`Peer identified as: ${data.callsign}`);
        updatePeersState();
      } else if (data.type === 'transmission-end') {
        if (incomingAudioEndCallbackRef.current) {
          incomingAudioEndCallbackRef.current(data.callsign);
        }
      } else if (data.type === 'peer-list' && !isHostRef.current) {
        if (data.peers && Array.isArray(data.peers)) {
          log(`Received peer list with ${data.peers.length} peers`);
          data.peers.forEach((p: { peerId: string; callsign: string }) => {
            if (p.peerId !== peerRef.current?.id && !dataConnectionsRef.current.has(p.peerId)) {
              connectToPeerDirect(p.peerId);
            }
          });
        }
      }
    });

    conn.on('close', () => {
      const callsign = peerCallsignsRef.current.get(conn.peer) || 'Unknown';
      peerCallsignsRef.current.delete(conn.peer);
      dataConnectionsRef.current.delete(conn.peer);
      mediaConnectionsRef.current.delete(conn.peer);
      updatePeersState();
      log(`Peer disconnected: ${callsign}`);
      
      if (isHostRef.current) {
        setTimeout(() => broadcastPeerList(), 1000);
      }
    });

    conn.on('error', (err) => {
      log(`Data connection error: ${err}`);
    });
  }, [broadcastPeerList, updatePeersState, log]);

  const connectToPeerDirect = useCallback((peerId: string) => {
    const peer = peerRef.current;
    if (!peer || peer.id === peerId) return;
    if (dataConnectionsRef.current.has(peerId)) return;

    log(`Connecting to peer: ${peerId}`);
    const dataConn = peer.connect(peerId, { reliable: true, serialization: 'json' });
    dataConnectionsRef.current.set(peerId, dataConn);
    setupDataConnection(dataConn);
  }, [setupDataConnection, log]);

  const setupPeerEvents = useCallback((peer: Peer) => {
    peer.on('open', (id) => {
      log(`Peer opened with ID: ${id}`);
      setMyPeerId(id);
      setStatus('connected');
      setError(null);
    });

    peer.on('error', (err) => {
      log(`Peer error: ${err.type} - ${err.message}`);
      if (err.type === 'unavailable-id') {
        setError('Room code already in use. Try again.');
      } else if (err.type === 'peer-unavailable') {
        setError('Room not found. Check the code and try again.');
      } else if (err.type === 'network' || err.type === 'server-error') {
        setError('Network error. Check your internet connection.');
      } else if (err.type === 'disconnected') {
        setError('Disconnected from server. Trying to reconnect...');
      } else if (err.type === 'browser-incompatible') {
        setError('Your browser does not support WebRTC. Try Chrome.');
      } else {
        setError(`Error: ${err.type}. ${err.message || ''}`);
      }
      setStatus('error');
    });

    peer.on('disconnected', () => {
      log('Disconnected from signaling server, reconnecting...');
      setStatus('connecting');
      setTimeout(() => {
        if (peerRef.current && !peerRef.current.destroyed) {
          try { 
            peerRef.current.reconnect(); 
            log('Reconnect attempt initiated');
          } catch(e) {
            log(`Reconnect failed: ${e}`);
          }
        }
      }, 2000);
    });

    peer.on('call', (call) => {
      const callerCallsign = peerCallsignsRef.current.get(call.peer) || 'Unknown';
      log(`Incoming call from: ${callerCallsign}`);
      
      call.answer();
      
      call.on('stream', (remoteStream) => {
        log(`Receiving audio stream from: ${callerCallsign}`);
        if (incomingAudioCallbackRef.current) {
          incomingAudioCallbackRef.current(remoteStream, callerCallsign);
        }
      });

      call.on('close', () => {
        log(`Call closed from: ${callerCallsign}`);
        mediaConnectionsRef.current.delete(call.peer);
      });

      call.on('error', (err) => {
        log(`Incoming call error: ${err}`);
      });
    });

    peer.on('connection', (conn) => {
      log(`Incoming connection from: ${conn.peer}`);
      dataConnectionsRef.current.set(conn.peer, conn);
      setupDataConnection(conn);
    });
  }, [setupDataConnection, log]);

  const createRoom = useCallback(async (callsign: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const roomCode = generateRoomCode();
      callsignRef.current = callsign;
      setIsHost(true);
      isHostRef.current = true;
      setStatus('connecting');
      log(`Creating room with code: ${roomCode}`);

      const peer = new Peer(`army-radio-${roomCode}`, {
        debug: 1,
        config: {
          iceServers: ICE_SERVERS,
        },
      });

      peerRef.current = peer;
      setupPeerEvents(peer);

      const timeout = setTimeout(() => {
        setStatus('error');
        setError('Connection timeout. The signaling server may be down.');
        reject(new Error('Connection timeout'));
      }, 20000);

      peer.on('open', () => {
        clearTimeout(timeout);
        setMyPeerId(peer.id);
        setStatus('waiting-for-peers');
        log(`Room created successfully: ${roomCode}`);
        resolve(roomCode);
      });

      peer.on('error', (err) => {
        clearTimeout(timeout);
        if (err.type === 'unavailable-id') {
          log('Room code taken, retrying...');
          peer.destroy();
          createRoom(callsign).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }, [setupPeerEvents, log]);

  const joinRoom = useCallback(async (roomCode: string, callsign: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      callsignRef.current = callsign;
      setIsHost(false);
      isHostRef.current = false;
      setStatus('connecting');
      log(`Joining room: ${roomCode}`);

      const peer = new Peer(undefined as any, {
        debug: 1,
        config: {
          iceServers: ICE_SERVERS,
        },
      });

      peerRef.current = peer;
      setupPeerEvents(peer);

      const timeout = setTimeout(() => {
        setStatus('error');
        setError('Connection timed out. Room may not exist or server is unreachable.');
        reject(new Error('Connection timed out'));
      }, 15000);

      peer.on('open', () => {
        setMyPeerId(peer.id);
        log(`Connected to signaling server as: ${peer.id}`);

        const hostId = `army-radio-${roomCode.toUpperCase()}`;
        log(`Connecting to host: ${hostId}`);
        
        const dataConn = peer.connect(hostId, { reliable: true, serialization: 'json' });
        dataConnectionsRef.current.set(hostId, dataConn);
        
        setupDataConnection(dataConn);

        dataConn.on('open', () => {
          clearTimeout(timeout);
          peerCallsignsRef.current.set(hostId, 'HOST');
          updatePeersState();
          setStatus('waiting-for-peers');
          log(`Successfully joined room: ${roomCode}`);
          resolve();
        });

        dataConn.on('error', (err) => {
          clearTimeout(timeout);
          log(`Failed to connect to host: ${err}`);
          setStatus('error');
          setError('Could not connect to room host. Room may not exist.');
          reject(err);
        });
      });

      peer.on('error', (err) => {
        clearTimeout(timeout);
        if (err.type === 'peer-unavailable') {
          setStatus('error');
          setError('Room not found. Check the code and make sure the host is online.');
        } else {
          setStatus('error');
          setError(`Connection error: ${err.type}`);
        }
        reject(err);
      });
    });
  }, [setupPeerEvents, setupDataConnection, updatePeersState, log]);

  const sendAudioStream = useCallback((stream: MediaStream) => {
    myStreamRef.current = stream;
    const peer = peerRef.current;
    if (!peer) {
      log('Cannot send audio: no peer');
      return;
    }

    log(`Sending audio to ${dataConnectionsRef.current.size} peers`);

    dataConnectionsRef.current.forEach((_, peerId) => {
      try {
        const existing = mediaConnectionsRef.current.get(peerId);
        if (existing) {
          try { existing.close(); } catch(e) {}
        }
        
        const mediaConn = peer.call(peerId, stream);
        mediaConnectionsRef.current.set(peerId, mediaConn);
        log(`Calling peer: ${peerId}`);
        
        mediaConn.on('error', (err) => {
          log(`Media call error to ${peerId}: ${err}`);
        });
      } catch (e) {
        log(`Failed to call peer ${peerId}: ${e}`);
      }
    });
  }, [log]);

  const stopAudioStream = useCallback(() => {
    log('Stopping audio stream');
    
    if (myStreamRef.current) {
      myStreamRef.current.getTracks().forEach(track => track.stop());
      myStreamRef.current = null;
    }

    mediaConnectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch(e) {}
    });
    mediaConnectionsRef.current.clear();

    dataConnectionsRef.current.forEach((conn) => {
      try {
        conn.send({ type: 'transmission-end', callsign: callsignRef.current });
      } catch(e) {}
    });
  }, [log]);

  const onIncomingAudio = useCallback((callback: (stream: MediaStream, callsign: string) => void) => {
    incomingAudioCallbackRef.current = callback;
  }, []);

  const onIncomingAudioEnd = useCallback((callback: (callsign: string) => void) => {
    incomingAudioEndCallbackRef.current = callback;
  }, []);

  const leaveRoom = useCallback(() => {
    log('Leaving room');
    
    if (myStreamRef.current) {
      myStreamRef.current.getTracks().forEach(track => track.stop());
      myStreamRef.current = null;
    }

    mediaConnectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch(e) {}
    });
    mediaConnectionsRef.current.clear();

    dataConnectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch(e) {}
    });
    dataConnectionsRef.current.clear();

    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch(e) {}
      peerRef.current = null;
    }

    setPeers([]);
    setMyPeerId(null);
    setStatus('idle');
    setIsHost(false);
    isHostRef.current = false;
    peerCallsignsRef.current.clear();
    setError(null);
  }, [log]);

  useEffect(() => {
    return () => {
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch(e) {}
      }
      if (myStreamRef.current) {
        myStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    myPeerId,
    peers,
    status,
    isHost,
    createRoom,
    joinRoom,
    leaveRoom,
    sendAudioStream,
    stopAudioStream,
    onIncomingAudio,
    onIncomingAudioEnd,
    error,
    debugLog,
  };
}
