import { Request, Response } from 'express';

export interface SSEClient {
  send: (data: any) => void;
  close: () => void;
}

export const setupSSE = (req: Request, res: Response): SSEClient => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Disable compression for SSE
  res.setHeader('Content-Encoding', 'none');
  
  // Send initial connection message
  res.write(':ok\n\n');
  
  // Keep connection alive
  const keepAliveInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 30000);
  
  // Clean up on close
  req.on('close', () => {
    clearInterval(keepAliveInterval);
  });
  
  return {
    send: (data: any) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        console.error('[SSE] Failed to send data:', error);
      }
    },
    close: () => {
      clearInterval(keepAliveInterval);
      res.end();
    }
  };
};