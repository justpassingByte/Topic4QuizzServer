import { config } from 'dotenv';

// Load environment variables
config();

interface KeyUsage {
  lastUsed: number;
  requestCount: number;
}

export class ApiKeyService {
  private apiKeys: string[];
  private currentKeyIndex: number;
  private keyUsage: Map<string, KeyUsage>;
  private readonly RATE_LIMIT_WINDOW: number;
  private readonly MAX_REQUESTS_PER_WINDOW: number;

  constructor() {
    // Load HuggingFace API keys
    const envKeys = process.env.HUGGINGFACE_API_KEYS || '';
    console.log('Loading HuggingFace API keys:', envKeys ? 'Keys found' : 'No keys found');
    this.apiKeys = envKeys.split(',').map(key => key.trim()).filter(Boolean);
    console.log('Number of API keys loaded:', this.apiKeys.length);
    
    if (this.apiKeys.length === 0) {
      // Try individual key variables as fallback
      for (let i = 1; i <= 5; i++) {
        const key = process.env[`HUGGINGFACE_API_KEY_${i}`];
        if (key) {
          this.apiKeys.push(key.trim());
          console.log(`Found individual key ${i}`);
        }
      }
    }

    if (this.apiKeys.length === 0) {
      throw new Error('No HuggingFace API keys configured. Please set HUGGINGFACE_API_KEYS in .env file');
    }

    this.currentKeyIndex = 0;
    this.keyUsage = new Map();
    this.RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000');
    this.MAX_REQUESTS_PER_WINDOW = parseInt(process.env.MAX_REQUESTS_PER_WINDOW || '50');

    // Initialize usage tracking for all keys
    this.apiKeys.forEach(key => {
      this.keyUsage.set(key, {
        lastUsed: 0,
        requestCount: 0
      });
    });
  }

  public getCurrentKey(): string {
    const key = this.apiKeys[this.currentKeyIndex];
    if (!this.isKeyAvailable(key)) {
      return this.getNextAvailableKey();
    }
    return key;
  }

  private getNextAvailableKey(): string {
    const startIndex = this.currentKeyIndex;
    let attempts = 0;

    while (attempts < this.apiKeys.length) {
      this.rotateKey();
      const currentKey = this.apiKeys[this.currentKeyIndex];
      
      if (this.isKeyAvailable(currentKey)) {
        this.updateKeyUsage(currentKey);
        return currentKey;
      }

      attempts++;
    }

    // If no keys are available, find the key that will be available soonest
    let minWaitKey = this.apiKeys[0];
    let minWaitTime = this.getKeyWaitTime(minWaitKey);

    this.apiKeys.forEach(key => {
      const waitTime = this.getKeyWaitTime(key);
      if (waitTime < minWaitTime) {
        minWaitKey = key;
        minWaitTime = waitTime;
      }
    });

    throw new Error(`All HuggingFace API keys are rate limited. Try again in ${Math.ceil(minWaitTime/1000)} seconds.`);
  }

  private isKeyAvailable(key: string): boolean {
    const usage = this.keyUsage.get(key);
    if (!usage) return true;

    const currentTime = Date.now();
    const timeSinceLastUse = currentTime - usage.lastUsed;

    // Reset request count if outside window
    if (timeSinceLastUse >= this.RATE_LIMIT_WINDOW) {
      usage.requestCount = 0;
      return true;
    }

    return usage.requestCount < this.MAX_REQUESTS_PER_WINDOW;
  }

  private updateKeyUsage(key: string): void {
    const usage = this.keyUsage.get(key) || { lastUsed: 0, requestCount: 0 };
    const currentTime = Date.now();

    // Reset count if outside window
    if (currentTime - usage.lastUsed >= this.RATE_LIMIT_WINDOW) {
      usage.requestCount = 1;
    } else {
      usage.requestCount++;
    }

    usage.lastUsed = currentTime;
    this.keyUsage.set(key, usage);
  }

  private getKeyWaitTime(key: string): number {
    const usage = this.keyUsage.get(key);
    if (!usage) return 0;

    const currentTime = Date.now();
    const timeSinceLastUse = currentTime - usage.lastUsed;

    if (timeSinceLastUse >= this.RATE_LIMIT_WINDOW) {
      return 0;
    }

    return this.RATE_LIMIT_WINDOW - timeSinceLastUse;
  }

  private rotateKey(): void {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
  }

  // Helper method for external use
  public getHuggingFaceClient() {
    const key = this.getCurrentKey();
    console.log('Using HuggingFace API key:', key.substring(0, 7) + '...');
    return {
      apiKey: key
    };
  }
} 