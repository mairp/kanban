type SSEController = ReadableStreamDefaultController<Uint8Array>;

const clients = new Set<SSEController>();
const encoder = new TextEncoder();

export function addClient(ctrl: SSEController) {
  clients.add(ctrl);
}

export function removeClient(ctrl: SSEController) {
  clients.delete(ctrl);
}

export function broadcast(event: string = 'board-changed') {
  const data = encoder.encode(`data: ${event}\n\n`);
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(data);
    } catch {
      clients.delete(ctrl);
    }
  }
}
