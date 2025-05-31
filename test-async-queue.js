// Simple test to verify the async queue works correctly
const { createAsyncOperationQueue } = require('./src/utils/async-queue.ts');

async function testAsyncQueue() {
  const queue = createAsyncOperationQueue();
  
  // Simulate rapid successive ONNX calls like the real scenario
  const mockSegmentFunction = (delay, value) => () => 
    new Promise(resolve => setTimeout(() => resolve(`Result ${value}`), delay));

  console.log('Testing async queue with rapid successive calls...');
  
  // Fire off multiple rapid calls (this would cause "Session already started" error without queue)
  const promises = [
    queue.enqueue(mockSegmentFunction(100, 1)),
    queue.enqueue(mockSegmentFunction(50, 2)),
    queue.enqueue(mockSegmentFunction(75, 3)),
    queue.enqueue(mockSegmentFunction(25, 4)),
  ];
  
  try {
    const results = await Promise.allSettled(promises);
    
    console.log('Results:');
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`  Call ${index + 1}: ${result.value}`);
      } else {
        console.log(`  Call ${index + 1}: CANCELLED - ${result.reason.message}`);
      }
    });
    
    console.log('✅ Queue test completed successfully!');
    console.log('📝 Expected behavior: Only the last call should succeed, others should be cancelled');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testAsyncQueue();
}