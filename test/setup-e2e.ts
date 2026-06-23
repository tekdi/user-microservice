import { DataSource } from 'typeorm';

// Global test setup for E2E tests
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Increase timeout for database operations
  jest.setTimeout(30000);
  
  console.log('E2E Test Environment Setup Complete');
});

afterAll(async () => {
  console.log('E2E Test Environment Cleanup Complete');
});

// Custom matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHavePerformanceUnder(received: number, threshold: number) {
    const pass = received < threshold;
    if (pass) {
      return {
        message: () => `expected ${received}ms not to be under ${threshold}ms`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received}ms to be under ${threshold}ms (performance threshold exceeded)`,
        pass: false,
      };
    }
  }
});

// Type declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toHavePerformanceUnder(threshold: number): R;
    }
  }
}