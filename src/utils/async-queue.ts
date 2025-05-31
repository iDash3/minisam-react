/**
 * Async operation queue to prevent concurrent ONNX runtime calls
 * 
 * This utility ensures that only one ONNX inference operation runs at a time
 * to prevent "Session already started" errors from onnxruntime-web.
 */

export interface AsyncOperationQueue {
  enqueue<T>(operation: () => Promise<T>): Promise<T>;
  clear(): void;
  get isProcessing(): boolean;
  get queueLength(): number;
}

interface QueueItem<T = any> {
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

export function createAsyncOperationQueue(): AsyncOperationQueue {
  const queue: QueueItem[] = [];
  let isProcessing = false;

  async function processQueue(): Promise<void> {
    if (isProcessing || queue.length === 0) {
      return;
    }

    isProcessing = true;

    while (queue.length > 0) {
      const item = queue.shift()!;
      
      try {
        const result = await item.operation();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    isProcessing = false;
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Cancel previous operations by rejecting them
      // This implements a "latest wins" strategy for rapid successive calls
      while (queue.length > 0) {
        const cancelled = queue.shift()!;
        cancelled.reject(new Error('Operation cancelled by newer request'));
      }

      queue.push({ operation, resolve, reject });
      processQueue();
    });
  }

  function clear(): void {
    // Reject all pending operations
    while (queue.length > 0) {
      const item = queue.shift()!;
      item.reject(new Error('Queue cleared'));
    }
  }

  return {
    enqueue,
    clear,
    get isProcessing() { return isProcessing; },
    get queueLength() { return queue.length; }
  };
}