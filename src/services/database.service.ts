import { MongoClient, Collection, MongoClientOptions, MongoError } from 'mongodb';

export class DatabaseService {
  protected client: MongoClient;
  protected isConnected: boolean = false;
  protected isInitialized: boolean = false;
  protected readonly MAX_RETRIES = 3;
  protected readonly RETRY_DELAY = 1000; // 1 second

  constructor() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ask2test';
    const options: MongoClientOptions = {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true
    };
    
    this.client = new MongoClient(uri, options);
    this.initializeConnection();
  }

  protected async initializeConnection(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.client.connect();
      this.isConnected = true;
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  protected async ensureConnection(): Promise<void> {
    if (this.isConnected) return;
    
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        if (!this.isInitialized) {
          await this.initializeConnection();
          return;
        }

        await this.client.connect();
        this.isConnected = true;
        return;
      } catch (error) {
        retries++;
        console.error(`MongoDB connection attempt ${retries} failed:`, error);
        if (retries === this.MAX_RETRIES) {
          throw new Error(`Failed to connect to MongoDB after ${this.MAX_RETRIES} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }
  }

  async connect(): Promise<void> {
    await this.ensureConnection();
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      await this.client.close();
      this.isConnected = false;
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureConnection();
    
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        return await operation();
      } catch (error: unknown) {
        retries++;
        console.error(`Operation attempt ${retries} failed:`, error);
        
        if (error instanceof MongoError && error.name === 'MongoNetworkError') {
          this.isConnected = false;
          await this.ensureConnection();
        }
        
        if (retries === this.MAX_RETRIES) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }
    throw new Error('Operation failed after maximum retries');
  }
} 