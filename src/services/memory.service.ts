import { MongoClient, Collection, MongoClientOptions, MongoError } from 'mongodb';
import { Quiz, QuizSession, PromptHistory, PromptFeedback, ResearchData, QuizEvaluation } from '../models/quiz.model';
import { EvaluationResult } from '../models/evaluation.model';
import { User, QuizResult, UserStatistics, TopicRecommendation } from '../models/user.model';
import { v4 as uuidv4 } from 'uuid';

export class MemoryService {
  private client: MongoClient;
  private quizCollection!: Collection<QuizSession>;
  private promptCollection!: Collection<PromptHistory>;
  private quizzesCollection!: Collection<Quiz>;
  private usersCollection!: Collection<User>;
  private quizResultsCollection!: Collection<QuizResult>;
  private isConnected: boolean = false;
  private isInitialized: boolean = false;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

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

  private async initializeConnection(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.client.connect();
      this.isConnected = true;
      
      const db = this.client.db();
      this.quizCollection = db.collection('sessions');
      this.promptCollection = db.collection('prompts');
      this.quizzesCollection = db.collection('quizzes');
      this.usersCollection = db.collection('users');
      this.quizResultsCollection = db.collection('quizResults');
      
      await this.initializeCollections();
      this.isInitialized = true;
      // console.log('Connected to MongoDB and initialized collections successfully');
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  private async initializeCollections(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const db = this.client.db();
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      if (!collectionNames.includes('prompts')) {
        await db.createCollection('prompts');
        // console.log('Created prompts collection');
      }

      if (!collectionNames.includes('sessions')) {
        await db.createCollection('sessions');
        // console.log('Created sessions collection');
      }

      if (!collectionNames.includes('quizzes')) {
        await db.createCollection('quizzes');
        // console.log('Created quizzes collection');
      }

      // Bỏ hoàn toàn các lệnh dropIndexes để tránh lỗi xung đột index

      await this.promptCollection.createIndex(
        { topic: 1 },
        { 
          unique: true,
          partialFilterExpression: { topic: { $type: "string" } }
        }
      );

      await this.quizCollection.createIndex(
        { id: 1 },
        { 
          unique: true,
          partialFilterExpression: { id: { $type: "string" } }
        }
      );

      await this.quizCollection.createIndex({ topic: 1 });

      await this.quizzesCollection.createIndex(
        { id: 1 },
        { 
          unique: true,
          partialFilterExpression: { id: { $type: "string" } }
        }
      );

      await this.quizzesCollection.createIndex({ topic: 1 });

      // Create indexes for user collections
      await this.usersCollection.createIndex({ id: 1 }, { unique: true });
      await this.usersCollection.createIndex({ email: 1 }, { unique: true });
      await this.usersCollection.createIndex({ "preferences.favoriteTopics": 1 });
      
      await this.quizResultsCollection.createIndex({ userId: 1 });
      await this.quizResultsCollection.createIndex({ quizId: 1 });
      await this.quizResultsCollection.createIndex({ topic: 1 });
      await this.quizResultsCollection.createIndex({ completedAt: 1 });

      // console.log('Collections and indexes initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing collections:', error);
      throw error;
    }
  }

  private async ensureConnection(): Promise<void> {
    if (this.isConnected) return;
    
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        if (!this.isInitialized) {
          await this.initializeConnection();
          return;
        }

        await this.client.connect();
        this.quizCollection = this.client.db().collection<QuizSession>('sessions');
        this.promptCollection = this.client.db().collection<PromptHistory>('prompts');
        this.quizzesCollection = this.client.db().collection<Quiz>('quizzes');
        this.usersCollection = this.client.db().collection<User>('users');
        this.quizResultsCollection = this.client.db().collection<QuizResult>('quizResults');
        this.isConnected = true;
        // console.log('Reconnected to MongoDB successfully');
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
      // console.log('Disconnected from MongoDB');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
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

  async saveSession(session: QuizSession): Promise<void> {
    await this.withRetry(() => this.quizCollection.insertOne(session));
  }

  async getSession(id: string): Promise<QuizSession | null> {
    return await this.withRetry(() => this.quizCollection.findOne({ id }));
  }

  async findSimilarQuizzes(topic: string): Promise<Quiz[]> {
    const sessions = await this.withRetry(() => 
      this.quizCollection
        .find({
          $or: [
            { topic: { $regex: topic, $options: 'i' } },
            { similarTopics: { $in: [new RegExp(topic, 'i')] } }
          ]
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()
    );

    return sessions.map(session => session.quiz);
  }

  async getTopicHistory(topic: string): Promise<{
    topic: string;
    quizCount: number;
    lastQuizDate: Date;
  }[]> {
    const pipeline = [
      {
        $match: {
          $or: [
            { topic: { $regex: topic, $options: 'i' } },
            { similarTopics: { $in: [new RegExp(topic, 'i')] } }
          ]
        }
      },
      {
        $group: {
          _id: '$topic',
          quizCount: { $sum: 1 },
          lastQuizDate: { $max: '$createdAt' }
        }
      },
      {
        $project: {
          _id: 0,
          topic: '$_id',
          quizCount: 1,
          lastQuizDate: 1
        }
      },
      {
        $sort: { lastQuizDate: -1 }
      }
    ];

    return await this.withRetry(() => 
      this.quizCollection.aggregate(pipeline).toArray()
    ) as { topic: string; quizCount: number; lastQuizDate: Date; }[];
  }

  async createSession(topic: string, quiz: Quiz, similarTopics: string[] = []): Promise<QuizSession> {
    const session: QuizSession = {
      id: uuidv4(),
      topic,
      quiz,
      createdAt: new Date(),
      similarTopics
    };

    await this.saveSession(session);
    return session;
  }

  async updateSession(sessionId: string, updates: Partial<QuizSession>): Promise<void> {
    await this.withRetry(() =>
      this.quizCollection.updateOne(
        { id: sessionId },
        { 
          $set: {
            ...updates,
            updatedAt: new Date()
          }
        }
      )
    );
  }

  async saveSubtopics(sessionId: string, subtopics: string[]): Promise<void> {
    await this.withRetry(() =>
      this.quizCollection.updateOne(
        { id: sessionId },
        { 
          $set: {
            subtopics,
            updatedAt: new Date()
          }
        }
      )
    );
  }

  async savePromptHistory(topic: string, history: PromptHistory): Promise<void> {
    try {
      await this.ensureConnection();
      // console.log(`Saving prompt history for topic: ${topic}`);
      
      const result = await this.promptCollection.updateOne(
        { topic },
        {
          $set: {
            ...history,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      // console.log(`Prompt history saved successfully. Modified: ${result.modifiedCount}, Upserted: ${result.upsertedCount}`);
    } catch (error) {
      console.error('Error saving prompt history:', error);
      throw error;
    }
  }

  async getPromptHistory(topic: string): Promise<PromptHistory | null> {
    try {
      await this.ensureConnection();
      // console.log(`Fetching prompt history for topic: ${topic}`);
      
      const history = await this.promptCollection.findOne({ topic });
      // console.log(`Prompt history found: ${!!history}`);
      
      return history;
    } catch (error) {
      console.error('Error getting prompt history:', error);
      throw error;
    }
  }

  async storePromptFeedback(topic: string, feedbackData: {
    timestamp: Date;
    feedback: {
      score: number;
      issues: string[];
      suggestions: string[];
      successfulElements: string[];
    };
    prompt: string;
  }): Promise<void> {
    try {
      await this.ensureConnection();
      console.log(`=== Evaluation Feedback for Topic: ${topic} ===`);
      console.log('Score:', feedbackData.feedback.score);
      console.log('Issues:', feedbackData.feedback.issues);
      console.log('Successful Elements:', feedbackData.feedback.successfulElements);
      console.log('Suggestions:', feedbackData.feedback.suggestions);
      console.log('Timestamp:', feedbackData.timestamp);
      console.log('=== End of Evaluation Feedback ===\n');

      const history = await this.getPromptHistory(topic);
      const updatedHistory: PromptHistory = history || {
        topic,
        attempts: 0,
        successfulPrompts: [],
        failedPrompts: [],
        averageScore: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const formattedFeedback = {
        strengths: feedbackData.feedback.successfulElements,
        weaknesses: feedbackData.feedback.issues,
        suggestions: feedbackData.feedback.suggestions
      };

      const promptEntry = {
        prompt: feedbackData.prompt,
        score: feedbackData.feedback.score,
        feedback: formattedFeedback,
        timestamp: feedbackData.timestamp
      };

      if (feedbackData.feedback.score >= 0.7) {
        updatedHistory.successfulPrompts.push(promptEntry);
        console.log('✅ Evaluation Result: Successful (Score >= 0.7)');
      } else {
        updatedHistory.failedPrompts.push(promptEntry);
        console.log('❌ Evaluation Result: Failed (Score < 0.7)');
      }

      updatedHistory.attempts += 1;
      const allScores = [
        ...updatedHistory.successfulPrompts.map(p => p.score),
        ...updatedHistory.failedPrompts.map(p => p.score)
      ];
      updatedHistory.averageScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      updatedHistory.updatedAt = new Date();

      console.log('📊 Evaluation Statistics:');
      console.log(`Total Attempts: ${updatedHistory.attempts}`);
      console.log(`Average Score: ${updatedHistory.averageScore.toFixed(2)}`);
      console.log(`Success Rate: ${(updatedHistory.successfulPrompts.length / updatedHistory.attempts * 100).toFixed(2)}%`);

      await this.promptCollection.updateOne(
        { topic },
        { $set: updatedHistory },
        { upsert: true }
      );

    } catch (error) {
      console.error('Error storing prompt feedback:', error);
      throw error;
    }
  }

  async getTopPerformingPrompts(topic: string, limit: number = 5): Promise<Array<{
    prompt: any;
    score: number;
    usageCount: number;
  }>> {
    const history = await this.getPromptHistory(topic);
    if (!history) return [];

    const allPrompts = [
      ...history.successfulPrompts,
      ...history.failedPrompts
    ];

    // Group prompts by their structure and calculate average score
    const promptMap = new Map<string, {
      prompt: any;
      totalScore: number;
      count: number;
    }>();

    allPrompts.forEach(p => {
      const key = JSON.stringify(p.prompt);
      const existing = promptMap.get(key) || {
        prompt: p.prompt,
        totalScore: 0,
        count: 0
      };

      existing.totalScore += p.score;
      existing.count += 1;
      promptMap.set(key, existing);
    });

    // Convert to array and sort by average score
    return Array.from(promptMap.values())
      .map(p => ({
        prompt: p.prompt,
        score: p.totalScore / p.count,
        usageCount: p.count
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async analyzePromptPerformance(topic: string): Promise<{
    totalAttempts: number;
    averageScore: number;
    successRate: number;
    commonIssues: Array<{
      issue: string;
      frequency: number;
    }>;
    improvements: Array<{
      type: string;
      impact: number;
    }>;
  }> {
    const history = await this.getPromptHistory(topic);
    if (!history) {
      return {
        totalAttempts: 0,
        averageScore: 0,
        successRate: 0,
        commonIssues: [],
        improvements: []
      };
    }

    const allPrompts = [
      ...history.successfulPrompts,
      ...history.failedPrompts
    ];

    // Calculate metrics
    const totalAttempts = allPrompts.length;
    const averageScore = allPrompts.reduce((acc, p) => acc + p.score, 0) / totalAttempts;
    const successRate = history.successfulPrompts.length / totalAttempts;

    // Analyze common issues
    const issueMap = new Map<string, number>();
    allPrompts.forEach(p => {
      p.feedback.weaknesses.forEach(issue => {
        issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
      });
    });

    const commonIssues = Array.from(issueMap.entries())
      .map(([issue, count]) => ({
        issue,
        frequency: count / totalAttempts
      }))
      .sort((a, b) => b.frequency - a.frequency);

    // Analyze improvements
    const improvements = this.analyzeImprovements(allPrompts);

    return {
      totalAttempts,
      averageScore,
      successRate,
      commonIssues,
      improvements
    };
  }

  private analyzeImprovements(prompts: Array<{
    prompt: any;
    score: number;
    feedback: {
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
    };
  }>): Array<{
    type: string;
    impact: number;
  }> {
    const improvementMap = new Map<string, {
      totalImpact: number;
      count: number;
    }>();

    // Analyze sequential pairs of prompts to identify improvements
    for (let i = 1; i < prompts.length; i++) {
      const prevPrompt = prompts[i - 1];
      const currPrompt = prompts[i];
      const scoreDiff = currPrompt.score - prevPrompt.score;

      if (scoreDiff > 0) {
        // Identify what changed between prompts
        const changes = this.identifyChanges(prevPrompt.prompt, currPrompt.prompt);
        changes.forEach(change => {
          const existing = improvementMap.get(change) || {
            totalImpact: 0,
            count: 0
          };
          existing.totalImpact += scoreDiff;
          existing.count += 1;
          improvementMap.set(change, existing);
        });
      }
    }

    return Array.from(improvementMap.entries())
      .map(([type, data]) => ({
        type,
        impact: data.totalImpact / data.count
      }))
      .sort((a, b) => b.impact - a.impact);
  }

  private identifyChanges(prevPrompt: any, currPrompt: any): string[] {
    const changes: string[] = [];

    // Compare prompt structures
    if (currPrompt.style !== prevPrompt.style) {
      changes.push('style_change');
    }
    if (currPrompt.includeExamples !== prevPrompt.includeExamples) {
      changes.push('examples_change');
    }
    if (JSON.stringify(currPrompt.focus) !== JSON.stringify(prevPrompt.focus)) {
      changes.push('focus_change');
    }
    if (currPrompt.detail !== prevPrompt.detail) {
      changes.push('detail_level_change');
    }

    return changes;
  }

  // Thêm phương thức để lấy tất cả các session
  async getAllSessions(): Promise<any[]> {
    try {
      await this.ensureConnection();
      const sessions = await this.quizCollection.find({}).toArray();
      return sessions;
    } catch (error) {
      console.error('Error getting all sessions:', error);
      return [];
    }
  }
  
  // Thêm phương thức để lấy quiz theo topic
  async getSessionsByTopic(topic: string): Promise<any[]> {
    try {
      await this.ensureConnection();
      // Sử dụng regex để tìm kiếm không phân biệt chữ hoa/thường
      const sessions = await this.quizCollection.find({ 
        topic: { $regex: new RegExp(topic, 'i') } 
      }).toArray();
      return sessions;
    } catch (error) {
      console.error(`Error getting sessions by topic ${topic}:`, error);
      return [];
    }
  }
  
  // Thêm phương thức để lấy quiz theo subtopic
  async getSessionsBySubtopic(subtopic: string): Promise<any[]> {
    try {
      await this.ensureConnection();
      // Tìm kiếm trong similarTopics (subtopics)
      const sessions = await this.quizCollection.find({ 
        $or: [
          { similarTopics: { $regex: new RegExp(subtopic, 'i') } },
          // Hoặc tìm trong nội dung subtopics nếu được lưu dưới dạng mảng đối tượng
          { 'quiz.metadata.subtopics.name': { $regex: new RegExp(subtopic, 'i') } }
        ]
      }).toArray();
      return sessions;
    } catch (error) {
      console.error(`Error getting sessions by subtopic ${subtopic}:`, error);
      return [];
    }
  }

  // New methods for quiz management
  async saveQuiz(quiz: Quiz): Promise<void> {
    if (!quiz.id) {
      quiz.id = uuidv4(); // Ensure quiz has an ID
    }
    await this.withRetry(() => this.quizzesCollection.insertOne(quiz));
  }

  async getQuiz(id: string): Promise<Quiz | null> {
    if (!id) return null;
    return await this.withRetry(() => this.quizzesCollection.findOne({ id }));
  }

  async getAllQuizzes(): Promise<Quiz[]> {
    return await this.withRetry(() => 
      this.quizzesCollection.find({
        id: { $exists: true, $type: "string" }
      }).toArray()
    );
  }

  async getQuizzesByTopic(topic: string): Promise<Quiz[]> {
    if (!topic) return [];
    return await this.withRetry(() => 
      this.quizzesCollection
        .find({ 
          topic: { $regex: topic, $options: 'i' },
          id: { $exists: true, $type: "string" }
        })
        .toArray()
    );
  }

  async updateQuiz(id: string, updates: Partial<Quiz>): Promise<void> {
    if (!id) return;
    await this.withRetry(() =>
      this.quizzesCollection.updateOne(
        { id },
        { 
          $set: {
            ...updates,
            updatedAt: new Date()
          }
        }
      )
    );
  }

  // User management methods
  async createUser(username: string, email: string, hashedPassword: string, favoriteTopics: string[] = []): Promise<User> {
    await this.ensureConnection();
    const user: User = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      preferences: {
        favoriteTopics,
      },
      createdAt: new Date(),
    };
    await this.usersCollection.insertOne(user);
    return user;
  }
  
  async getUserById(id: string): Promise<User | null> {
    return await this.withRetry(() => this.usersCollection.findOne({ id }));
  }
  
  async getUserByEmail(email: string): Promise<User | null> {
    return await this.withRetry(() => this.usersCollection.findOne({ email }));
  }
  
  async updateUserPreferences(userId: string, preferences: Partial<User['preferences']>): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) return;
    
    const updatedPreferences = {
      favoriteTopics: [...(user.preferences.favoriteTopics || [])],
      ...preferences
    };
    
    await this.withRetry(() => 
      this.usersCollection.updateOne(
        { id: userId },
        { 
          $set: {
            "preferences": updatedPreferences,
            "updatedAt": new Date()
          }
        }
      )
    );
  }
  
  async addFavoriteTopics(userId: string, topics: string[]): Promise<void> {
    await this.withRetry(() => 
      this.usersCollection.updateOne(
        { id: userId },
        { 
          $addToSet: { "preferences.favoriteTopics": { $each: topics } },
          $set: { "updatedAt": new Date() }
        }
      )
    );
  }
  
  async removeFavoriteTopics(userId: string, topics: string[]): Promise<void> {
    await this.withRetry(() => 
      this.usersCollection.updateOne(
        { id: userId },
        { 
          $pull: { "preferences.favoriteTopics": { $in: topics } },
          $set: { "updatedAt": new Date() }
        }
      )
    );
  }
  
  async getQuizzesByUserPreferences(userId: string): Promise<QuizSession[]> {
    const user = await this.getUserById(userId);
    if (!user || !user.preferences.favoriteTopics.length) {
      return [];
    }
    
    return await this.withRetry(() => 
      this.quizCollection.find({
        $or: [
          { topic: { $in: user.preferences.favoriteTopics } },
          { "similarTopics": { $in: user.preferences.favoriteTopics } }
        ]
      }).toArray()
    );
  }
  
  // Quiz results management
  async saveQuizResult(result: QuizResult): Promise<void> {
    await this.withRetry(() => this.quizResultsCollection.insertOne(result));
  }
  
  async getUserQuizResults(userId: string): Promise<QuizResult[]> {
    return await this.withRetry(() => 
      this.quizResultsCollection.find({ userId }).sort({ completedAt: -1 }).toArray()
    );
  }
  
  async getUserTopicResults(userId: string, topic: string): Promise<QuizResult[]> {
    return await this.withRetry(() => 
      this.quizResultsCollection.find({ userId, topic }).sort({ completedAt: -1 }).toArray()
    );
  }
  
  async getUserStatistics(userId: string): Promise<UserStatistics | null> {
    const results = await this.getUserQuizResults(userId);
    if (!results || results.length === 0) {
      return null;
    }
    
    // Calculate overall statistics
    const totalQuizzes = results.length;
    const totalScore = results.reduce((sum, result) => sum + result.score, 0);
    const averageScore = totalScore / totalQuizzes;
    
    // Calculate topic performance
    const topicPerformance: UserStatistics['topicPerformance'] = {};
    
    // Group by topic
    results.forEach(result => {
      if (!topicPerformance[result.topic]) {
        topicPerformance[result.topic] = {
          completed: 0,
          averageScore: 0,
          strengths: [],
          weaknesses: []
        };
      }
      
      topicPerformance[result.topic].completed += 1;
      const topicScores = topicPerformance[result.topic];
      const currentTotal = topicScores.averageScore * (topicPerformance[result.topic].completed - 1);
      topicPerformance[result.topic].averageScore = 
        (currentTotal + result.score) / topicPerformance[result.topic].completed;
    });
    
    // Determine strengths and weaknesses for each topic
    Object.keys(topicPerformance).forEach(topic => {
      const performance = topicPerformance[topic];
      
      // Topics with scores > 80% are strengths
      if (performance.averageScore >= 0.8) {
        performance.strengths.push('High proficiency');
      }
      
      // Topics with scores < 60% are weaknesses
      if (performance.averageScore < 0.6) {
        performance.weaknesses.push('Needs improvement');
      }
    });
    
    // Recommend difficulty based on recent performance
    const recentResults = results.slice(0, 5);
    const recentAverage = recentResults.reduce((sum, result) => sum + result.score, 0) / recentResults.length;
    
    let recommendedDifficulty: UserStatistics['recommendedDifficulty'] = 'intermediate';
    if (recentAverage >= 0.8) {
      recommendedDifficulty = 'advanced';
    } else if (recentAverage < 0.6) {
      recommendedDifficulty = 'basic';
    }
    
    // Calculate quizzes over time
    const dateMap = new Map<string, number>();
    results.forEach(result => {
      const dateStr = result.completedAt.toISOString().split('T')[0]; // YYYY-MM-DD
      const current = dateMap.get(dateStr) || 0;
      dateMap.set(dateStr, current + 1);
    });
    
    const quizzesCompletedOverTime = Array.from(dateMap.entries()).map(([date, count]) => ({
      date,
      count
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    return {
      totalQuizzesCompleted: totalQuizzes,
      averageScore,
      topicPerformance,
      recommendedDifficulty,
      quizzesCompletedOverTime,
      lastActive: results[0].completedAt
    };
  }
  
  async getSimilarTopics(topic: string, limit: number = 5): Promise<string[]> {
    // Get sessions with this topic
    const sessions = await this.getSessionsByTopic(topic);
    if (!sessions || sessions.length === 0) {
      return [];
    }
    
    // Collect all similar topics
    const similarTopicsMap = new Map<string, number>();
    
    sessions.forEach(session => {
      if (session.similarTopics && session.similarTopics.length > 0) {
        session.similarTopics.forEach((similarTopic: string) => {
          if (similarTopic !== topic) {
            const current = similarTopicsMap.get(similarTopic) || 0;
            similarTopicsMap.set(similarTopic, current + 1);
          }
        });
      }
    });
    
    // Sort by frequency and return the top ones
    return Array.from(similarTopicsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(entry => entry[0]);
  }
  
  async getTopicRecommendations(userId: string, limit: number = 5): Promise<TopicRecommendation[]> {
    const user = await this.getUserById(userId);
    if (!user) return [];
    
    const userTopics = user.preferences.favoriteTopics;
    if (!userTopics || userTopics.length === 0) {
      // If user has no favorite topics, return popular topics
      return await this.getPopularTopics(limit);
    }
    
    // Get similar topics for each user topic
    const recommendations = new Map<string, TopicRecommendation>();
    
    for (const topic of userTopics) {
      const similarTopics = await this.getSimilarTopics(topic, 3);
      
      for (const similarTopic of similarTopics) {
        if (!userTopics.includes(similarTopic)) {
          const existing = recommendations.get(similarTopic);
          
          if (existing) {
            existing.relevanceScore += 1;
            if (!existing.basedOn.includes(topic)) {
              existing.basedOn.push(topic);
            }
          } else {
            recommendations.set(similarTopic, {
              topic: similarTopic,
              relevanceScore: 1,
              basedOn: [topic],
              difficulty: 'intermediate' // Default difficulty
            });
          }
        }
      }
    }
    
    // Sort by relevance score and return the top recommendations
    return Array.from(recommendations.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }
  
  async getPopularTopics(limit: number = 5): Promise<TopicRecommendation[]> {
    // Aggregation to find most common topics from sessions
    const topicCounts = await this.withRetry(() => 
      this.quizCollection.aggregate([
        { $group: { _id: "$topic", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
      ]).toArray()
    );
    
    return topicCounts.map(item => ({
      topic: item._id,
      relevanceScore: item.count,
      basedOn: ["popular"],
      difficulty: 'intermediate'
    }));
  }
} 