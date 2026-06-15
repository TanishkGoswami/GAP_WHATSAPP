import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function initSocket(server: any) {
    ioInstance = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });
    return ioInstance;
}

export function getIO(): Server {
    if (!ioInstance) {
        throw new Error('Socket.io has not been initialized. Call initSocket first.');
    }
    return ioInstance;
}
