import { useRef, useState, useCallback, useEffect } from 'react';
import Peer, { MediaConnection, DataConnection } from 'peerjs';

export interface PeerInfo {
  peerId: string;
  callsign: string;
  connected: boolean;
}

export interface UsePeerConnectionReturn {
  myPeerId: string | null;
  peers: PeerInfo[];
  isConnected: boolean;
  isHost: boolean;
  createRoom: (callsign: string) => Promise<string>;
  joinRoom: (roomCode: string, callsign: string) => Promise<void>;
  leaveRoom: () => void;
  sendAudioStream: (stream: MediaStream) => void;
  stopAudioStream: () => void;
  onIncomingAudio: (callback: (stream: MediaStream, callsign: string) => void) => void;
  onIncomingAudioEnd: (callback: (callsign: string) => void) => void;
  error: string | null;
}

export function usePeerConnection(): UsePeerConnectionReturn {
  const peerRef = useRef<Peer | null>(null);
  const mediaConnectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  const dataConnectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const myStreamRef = useRef<MediaStream | null>(null);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const incomingAudioCallbackRef = useRef<((stream: MediaStream, callsign: string) => void) | null>(null);
  const incomingAudioEndCallbackRef = useRef<((callsign: string) => void) | null>(null);
  const callsignRef = useRef<string>('');
  const peerCallsignsRef = useRef<Map<string, string>>(new Map());
  const isHostRef = useRef(false);

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
        console.error('Failed to broadcast peer list:', e);
      }
    });
  }, []);

  const updatePeersState = useCallback(() => {
    const peerList: PeerInfo[] = [];
    peerCallsignsRef.current.forEach((callsign, peerId) => {
      peerList.push({ peerId, callsign, connected: true });
    });
    setPeers(peerList);
  }, []);

  const setupDataConnection = useCallback((conn: DataConnection) => {
    conn.on('open', () => {
      console.log('Data connection opened with:', conn.peer);
      // Send our callsign
      conn.send({ type: 'callsign', callsign: callsignRef.current });
      
      // If we're host, broadcast updated peer list
      if (isHostRef.current) {
        setTimeout(() => broadcastPeerList(), 500);
      }
    });

    conn.on('data', (data: any) => {
      if (data.type === 'callsign') {
        peerCallsignsRef.current.set(conn.peer, data.callsign);
        updatePeersState();
      } else if (data.type === 'transmission-end') {
        if (incomingAudioEndCallbackRef.current) {
          incomingAudioEndCallbackRef.current(data.callsign);
        }
      } else if (data.type === 'peer-list' && !isHostRef.current) {
        // We received a peer list from the host - connect to all peers we're not connected to
        if (data.peers && Array.isArray(data.peers)) {
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
      console.log(`Peer disconnected: ${callsign}`);
      
      // If host, rebroadcast updated list
      if (isHostRef.current) {
        setTimeout(() => broadcastPeerList(), 1000);
      }
    });

    conn.on('error', (err) => {
      console.error('Data connection error:', conn.peer, err);
    });
  }, [broadcastPeerList, updatePeersState]);

  const connectToPeerDirect = useCallback((peerId: string) => {
    const peer = peerRef.current;
    if (!peer || peer.id === peerId) return;
    if (dataConnectionsRef.current.has(peerId)) return;

    const dataConn = peer.connect(peerId, { reliable: true, serialization: 'json' });
    dataConnectionsRef.current.set(peerId, dataConn);
    setupDataConnection(dataConn);
  }, [setupDataConnection]);

  const setupPeerEvents = useCallback((peer: Peer) => {
    peer.on('open', (id) => {
      setMyPeerId(id);
      setIsConnected(true);
      setError(null);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        setError('Room code already in use.');
      } else if (err.type === 'peer-unavailable') {
        setError('Room not found. Check the code.');
      } else if (err.type === 'network' || err.type === 'server-error') {
        setError('Network error. Check your connection.');
      } else {
        setError(`Error: ${err.type}`);
      }
    });

    peer.on('disconnected', () => {
      console.log('Peer disconnected from signaling server, reconnecting...');
      setTimeout(() => {
        if (peerRef.current && !peerRef.current.destroyed) {
          try { peerRef.current.reconnect(); } catch(e) {}
        }
      }, 2000);
    });

    // Handle incoming calls (audio streams from other peers)
    peer.on('call', (call) => {
      const callerCallsign = peerCallsignsRef.current.get(call.peer) || 'Unknown';
      
      // Answer the call (we receive audio)
      call.answer();
      
      call.on('stream', (remoteStream) => {
        console.log('Receiving audio from:', callerCallsign);
        if (incomingAudioCallbackRef.current) {
          incomingAudioCallbackRef.current(remoteStream, callerCallsign);
        }
      });

      call.on('close', () => {
        console.log('Call closed from:', callerCallsign);
        mediaConnectionsRef.current.delete(call.peer);
      });

      call.on('error', (err) => {
        console.error('Incoming call error:', err);
      });
    });

    // Handle incoming data connections
    peer.on('connection', (conn) => {
      dataConnectionsRef.current.set(conn.peer, conn);
      setupDataConnection(conn);
    });
  }, [setupDataConnection]);

  const createRoom = useCallback(async (callsign: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const roomCode = generateRoomCode();
      callsignRef.current = callsign;
      setIsHost(true);
      isHostRef.current = true;

      const peer = new Peer(`army-radio-${roomCode}`, {
        debug: 0,
      });

      peerRef.current = peer;
      setupPeerEvents(peer);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 15000);

      peer.on('open', () => {
        clearTimeout(timeout);
        setMyPeerId(peer.id);
        setIsConnected(true);
        resolve(roomCode);
      });

      peer.on('error', (err) => {
        clearTimeout(timeout);
        if (err.type === 'unavailable-id') {
          peer.destroy();
          // Retry with new code
          createRoom(callsign).then(resolve).catch(reject);
        } else {
          setError(err.message);
          reject(err);
        }
      });
    });
  }, [setupPeerEvents]);

  const joinRoom = useCallback(async (roomCode: string, callsign: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      callsignRef.current = callsign;
      setIsHost(false);
      isHostRef.current = false;

      const peer = new Peer(undefined as any, {
        debug: 0,
      });

      peerRef.current = peer;
      setupPeerEvents(peer);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out. Room may not exist.'));
      }, 12000);

      peer.on('open', () => {
        setMyPeerId(peer.id);
        setIsConnected(true);

        // Connect to the host
        const hostId = `army-radio-${roomCode.toUpperCase()}`;
        const dataConn = peer.connect(hostId, { reliable: true, serialization: 'json' });
        dataConnectionsRef.current.set(hostId, dataConn);
        
        setupDataConnection(dataConn);

        dataConn.on('open', () => {
          clearTimeout(timeout);
          // Add host to peers list
          peerCallsignsRef.current.set(hostId, 'HOST');
          updatePeersState();
          resolve();
        });

        dataConn.on('error', (err) => {
          clearTimeout(timeout);
          setError('Could not connect to room.');
          reject(err);
        });
      });

      peer.on('error', (err) => {
        clearTimeout(timeout);
        if (err.type === 'peer-unavailable') {
          setError('Room not found. Check the code.');
        } else {
          setError(`Connection error: ${err.type}`);
        }
        reject(err);
      });
    });
  }, [setupPeerEvents, setupDataConnection, updatePeersState]);

  const sendAudioStream = useCallback((stream: MediaStream) => {
    myStreamRef.current = stream;
    const peer = peerRef.current;
    if (!peer) return;

    // Call all connected peers with our audio stream
    dataConnectionsRef.current.forEach((_, peerId) => {
      try {
        // Close existing media connection if any
        const existing = mediaConnectionsRef.current.get(peerId);
        if (existing) {
          existing.close();
        }
        
        const mediaConn = peer.call(peerId, stream);
        mediaConnectionsRef.current.set(peerId, mediaConn);
        
        mediaConn.on('error', (err) => {
          console.error('Media call error to', peerId, err);
        });
      } catch (e) {
        console.error('Failed to call peer:', peerId, e);
      }
    });
  }, []);

  const stopAudioStream = useCallback(() => {
    // Stop microphone tracks
    if (myStreamRef.current) {
      myStreamRef.current.getTracks().forEach(track => track.stop());
      myStreamRef.current = null;
    }

    // Close all media connections and notify peers
    mediaConnectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch(e) {}
    });
    mediaConnectionsRef.current.clear();

    // Send transmission-end signal via data connections
    dataConnectionsRef.current.forEach((conn) => {
      try {
        conn.send({ type: 'transmission-end', callsign: callsignRef.current });
      } catch(e) {}
    });
  }, []);

  const onIncomingAudio = useCallback((callback: (stream: MediaStream, callsign: string) => void) => {
    incomingAudioCallbackRef.current = callback;
  }, []);

  const onIncomingAudioEnd = useCallback((callback: (callsign: string) => void) => {
    incomingAudioEndCallbackRef.current = callback;
  }, []);

  const leaveRoom = useCallback(() => {
    // Stop all streams
    if (myStreamRef.current) {
      myStreamRef.current.getTracks().forEach(track => track.stop());
      myStreamRef.current = null;
    }

    // Close all media connections
    mediaConnectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch(e) {}
    });
    mediaConnectionsRef.current.clear();

    // Close all data connections
    dataConnectionsRef.current.forEach((conn) => {
      try { conn.close(); } catch(e) {}
    });
    dataConnectionsRef.current.clear();

    // Destroy peer
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch(e) {}
      peerRef.current = null;
    }

    setPeers([]);
    setMyPeerId(null);
    setIsConnected(false);
    setIsHost(false);
    isHostRef.current = false;
    peerCallsignsRef.current.clear();
    setError(null);
  }, []);

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
    isConnected,
    isHost,
    createRoom,
    joinRoom,
    leaveRoom,
    sendAudioStream,
    stopAudioStream,
    onIncomingAudio,
    onIncomingAudioEnd,
    error,
  };
}
