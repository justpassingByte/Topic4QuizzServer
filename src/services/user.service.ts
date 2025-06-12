import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database.service';
import { User, QuizResult, UserStatistics, TopicRecommendation } from '../models/user.model';
import { QuizSession } from '../models/quiz.model';

export class UserService extends DatabaseService {
  private usersCollection!: Collection<User>;
  private quizResultsCollection!: Collection<QuizResult>;
  private quizCollection!: Collection<QuizSession>;

  constructor() {
    super();
  }

  async init(): Promise<void> {
    await this.ensureConnection();
    const db = this.client.db();
    this.usersCollection = db.collection('users');
    this.quizResultsCollection = db.collection('quizResults');
    this.quizCollection = db.collection('sessions');
    
    await this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    await this.usersCollection.createIndex({ id: 1 }, {
      unique: true,
      partialFilterExpression: { id: { $type: "string" } }
    });

    await this.quizResultsCollection.createIndex({ userId: 1 });
    await this.quizResultsCollection.createIndex({ completedAt: -1 });
  }

  async getUserQuizResults(userId: string): Promise<QuizResult[]> {
    await this.ensureConnection();
    const results = await this.withRetry(() => 
      this.quizResultsCollection.find({ userId }).sort({ completedAt: -1 }).toArray()
    );
    return results.map(doc => ({
      userId: doc.userId,
      quizId: doc.quizId,
      score: doc.score,
      topic: doc.topic,
      difficulty: doc.difficulty,
      completedAt: doc.completedAt,
      answers: doc.answers
    }));
  }

  async calculateUserStatistics(userId: string): Promise<UserStatistics> {
    const quizResults = await this.getUserQuizResults(userId);
    
    if (quizResults.length === 0) {
      return {
        totalQuizzesCompleted: 0,
        averageScore: 0,
        topicPerformance: {},
        recommendedDifficulty: 'basic',
        quizzesCompletedOverTime: [],
        lastActive: new Date()
      };
    }

    // Calculate total and average scores
    const totalScore = quizResults.reduce((sum, result) => sum + result.score, 0);
    const averageScore = totalScore / quizResults.length;

    // Calculate topic performance
    const topicPerformance: Record<string, {
      completed: number;
      averageScore: number;
      strengths: string[];
      weaknesses: string[];
    }> = {};

    quizResults.forEach(result => {
      if (!topicPerformance[result.topic]) {
        topicPerformance[result.topic] = {
          completed: 0,
          averageScore: 0,
          strengths: [],
          weaknesses: []
        };
      }

      const topic = topicPerformance[result.topic];
      topic.completed++;
      topic.averageScore = (topic.averageScore * (topic.completed - 1) + result.score) / topic.completed;

      // Analyze strengths and weaknesses
      result.answers.forEach(answer => {
        const concept = answer.questionId.split('_')[0];
        if (answer.correct && !topic.strengths.includes(concept)) {
          topic.strengths.push(concept);
        } else if (!answer.correct && !topic.weaknesses.includes(concept)) {
          topic.weaknesses.push(concept);
        }
      });
    });

    // Determine recommended difficulty
    let recommendedDifficulty: 'basic' | 'intermediate' | 'advanced' = 'basic';
    if (averageScore >= 90) {
      recommendedDifficulty = 'advanced';
    } else if (averageScore >= 70) {
      recommendedDifficulty = 'intermediate';
    }

    // Calculate quizzes completed over time
    const quizzesCompletedOverTime = quizResults
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
      .map((result, index) => ({
        date: result.completedAt.toISOString().split('T')[0],
        count: index + 1
      }));

    return {
      totalQuizzesCompleted: quizResults.length,
      averageScore,
      topicPerformance,
      recommendedDifficulty,
      quizzesCompletedOverTime,
      lastActive: quizResults[quizResults.length - 1].completedAt
    };
  }

  async getUserTopicResults(userId: string, topic: string): Promise<QuizResult[]> {
    const results = await this.withRetry(() => 
      this.quizResultsCollection.find({ userId, topic }).sort({ completedAt: -1 }).toArray()
    );
    return results.map(doc => ({
      userId: doc.userId,
      quizId: doc.quizId,
      score: doc.score,
      topic: doc.topic,
      difficulty: doc.difficulty,
      completedAt: doc.completedAt,
      answers: doc.answers
    }));
  }

  async createUser(username: string, email: string, favoriteTopics: string[] = []): Promise<User> {
    const user: User = {
      id: uuidv4(),
      username,
      email,
      preferences: {
        favoriteTopics
      },
      createdAt: new Date()
    };
    
    await this.withRetry(() => this.usersCollection.insertOne(user));
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
  
  private async getSessionsByTopic(topic: string): Promise<QuizSession[]> {
    try {
      await this.ensureConnection();
      // Uses regex to search case-insensitive
      const sessions = await this.quizCollection.find({ 
        topic: { $regex: new RegExp(topic, 'i') } 
      }).toArray();
      return sessions;
    } catch (error) {
      console.error(`Error getting sessions by topic ${topic}:`, error);
      return [];
    }
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