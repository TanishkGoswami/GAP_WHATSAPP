import { useState, useEffect } from 'react';
import { io } from "socket.io-client";
import { CheckCircle, Loader2 } from 'lucide-react';
import QRCode from "react-qr-code";
import { useAuth } from '../context/AuthContext';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Connect to backend
const socket = io(BACKEND_BASE, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
});

const WhatsAppLogin = () => {
    const { memberProfile } = useAuth();
    const [qrCode, setQrCode] = useState('');
    const [status, setStatus] = useState('idle'); // idle | scanning | connected | ready | logging_out
    const [sessionId, setSessionId] = useState('');
    const [isRequested, setIsRequested] = useState(false);
    const [connectedAccount, setConnectedAccount] = useState('');

    useEffect(() => {
        const storedSession = localStorage.getItem('whatsapp_session_id') || `session_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('whatsapp_session_id', storedSession);
        setSessionId(storedSession);
        if (!socket.connected) {
            socket.connect();
        }

        if (socket.connected) {
            setStatus('ready');
            socket.emit('join_session', storedSession);
        }

        socket.on('connect', () => {
            console.log('Connected to WebSocket server');
            setStatus('ready');
            socket.emit('join_session', storedSession);
        });

        socket.on('qr', (qr) => {
            setQrCode(qr);
            setStatus('scanning');
        });

        socket.on('status', (s) => {
            console.log('Status Update:', s);
            if (s === 'connected') {
                setStatus('connected');
            } else if (s === 'ready' || s === 'disconnected') {
                setStatus('ready');
                setQrCode('');
                setIsRequested(false);
            } else {
                setStatus(s);
            }
        });

        socket.on('connected_account', (acc) => {
            setConnectedAccount(acc);
        });

        socket.on('session_not_found', () => {
            setStatus('ready');
        });

        socket.on('error', (err) => {
            console.error("Socket error", err);
        });

        return () => {
            socket.off('connect');
            socket.off('qr');
            socket.off('status');
            socket.off('connected_account');
            socket.off('session_not_found');
            socket.off('error');
            socket.disconnect();
        };
    }, []);

    const handleGenerateQR = () => {
        if (!isRequested || status === 'ready') {
            setIsRequested(true);
            setStatus('scanning');
            setQrCode('');
            socket.emit('request_qr', sessionId, memberProfile?.organization_id);
        }
    };

    const handleLogout = async () => {
        if (window.confirm('Are you sure you want to logout? This will disconnect this account.')) {
            setStatus('logging_out');
            socket.emit('logout', sessionId);
            
            // Clear local state
            setConnectedAccount('');
            setQrCode('');
            setIsRequested(false);
            
            // Call REST as fallback
            try {
                await fetch(`${BACKEND_BASE}/api/wa/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId })
                });
            } catch (err) {
                console.error("REST logout failed:", err);
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-sm border border-gray-100 max-w-sm mx-auto w-full">
            <div className="mb-6 text-center">
                <h3 className="text-lg font-semibold text-gray-900">
                    {status === 'connected' ? 'Account Connected' : 
                     status === 'logging_out' ? 'Logging out...' : 'Scan to Connect'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                    {status === 'connected' 
                        ? 'Your WhatsApp is linked and active.' 
                        : status === 'logging_out'
                        ? 'Clearing your session...'
                        : 'Open WhatsApp > Linked Devices > Link a Device'}
                </p>
            </div>

            <div className="relative flex items-center justify-center w-64 h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 overflow-hidden">
                {(status === 'idle' || status === 'logging_out') && (
                    <div className="flex flex-col items-center text-gray-400 p-4 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <span className="text-sm font-medium">
                            {status === 'logging_out' ? 'Cleaning up...' : 'Connecting to server...'}
                        </span>
                    </div>
                )}

                {status === 'ready' && (
                    <div className="flex flex-col items-center text-gray-600 p-4 text-center animate-in fade-in transition-all">
                        <button
                            onClick={handleGenerateQR}
                            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md active:scale-95"
                        >
                            Generate QR Code
                        </button>
                    </div>
                )}

                {status === 'scanning' && !qrCode && (
                    <div className="flex flex-col items-center text-gray-400">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <span className="text-sm">Generating QR...</span>
                    </div>
                )}

                {status === 'scanning' && qrCode && (
                    <div className="p-2 bg-white rounded-lg shadow-sm animate-in zoom-in duration-300">
                        <QRCode
                            value={qrCode}
                            size={220}
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            viewBox={`0 0 256 256`}
                        />
                    </div>
                )}

                {status === 'connected' && (
                    <div className="flex flex-col items-center text-green-600 animate-in fade-in zoom-in duration-300">
                        <CheckCircle className="h-16 w-16 mb-4" />
                        <span className="font-semibold text-lg text-center">Connected!</span>
                        {connectedAccount && (
                            <span className="text-sm text-gray-500 mt-2">+{connectedAccount}</span>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-8 w-full flex flex-col gap-3">
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                    <div className={`h-2 w-2 rounded-full ${
                        status === 'idle' || status === 'logging_out' ? 'bg-yellow-400' :
                        status === 'ready' ? 'bg-blue-400' :
                        status === 'scanning' ? 'bg-orange-400' :
                        'bg-green-400'
                    }`} />
                    <span className="capitalize">{status === 'scanning' ? 'Waiting for Scan' : status}</span>
                </div>

                {status === 'connected' && (
                    <button
                        onClick={handleLogout}
                        className="w-full py-2 px-4 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors mt-2"
                    >
                        Disconnect / Logout
                    </button>
                )}
            </div>
            
            <div className="mt-4 text-[10px] text-gray-300 font-mono text-center">
                SID: {sessionId}
            </div>
        </div>
    );
};

export default WhatsAppLogin;
