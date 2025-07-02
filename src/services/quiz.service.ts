import { Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database.service';
import { 
  Quiz, 
  QuizSession, 
  PromptHistory, 
  PromptFeedback, 
  ResearchData, 
  QuizEvaluation,
  QuizFeedback,
  QuizRevision,
  QuizUpdateSchedule
} from '../models/quiz.model';

export class QuizService extends DatabaseService {
  private quizCollection!: Collection<QuizSession>;
  private quizzesCollection!: Collection<Quiz>;
  private quizFeedbackCollection!: Collection<QuizFeedback>;
  private quizRevisionsCollection!: Collection<QuizRevision>;
  private quizUpdateSchedulesCollection!: Collection<QuizUpdateSchedule>;

  constructor() {
    super();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.ensureConnection();
    const db = this.client.db();
    this.quizCollection = db.collection('sessions');
    this.quizzesCollection = db.collection('quizzes');
    this.quizFeedbackCollection = db.collection('quizFeedback');
    this.quizRevisionsCollection = db.collection('quizRevisions');
    this.quizUpdateSchedulesCollection = db.collection('quizUpdateSchedules');
    
    await this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    const collectionsWithIndexes: { collection: Collection<any>; indexes: any[] }[] = [
      {
        collection: this.quizCollection,
        indexes: [
          { spec: { id: 1 }, options: { unique: true, partialFilterExpression: { id: { $type: "string" } } } },
          { spec: { topic: 1 }, options: {} }
        ]
      },
      {
        collection: this.quizzesCollection,
        indexes: [
          { spec: { id: 1 }, options: { unique: true, partialFilterExpression: { id: { $type: "string" } } } },
          { spec: { topic: 1 }, options: {} }
        ]
      },
      {
        collection: this.quizFeedbackCollection,
        indexes: [
          { spec: { quizId: 1 }, options: {} },
          { spec: { userId: 1 }, options: {} }
        ]
      },
      {
        collection: this.quizRevisionsCollection,
        indexes: [
          { spec: { quizId: 1 }, options: {} },
          { spec: { revisionNumber: 1 }, options: {} }
        ]
      },
      {
        collection: this.quizUpdateSchedulesCollection,
        indexes: [
          { spec: { quizId: 1 }, options: {} },
          { spec: { scheduledDate: 1 }, options: {} },
          { spec: { isCompleted: 1 }, options: {} }
        ]
      }
    ];

    for (const { collection, indexes } of collectionsWithIndexes) {
      for (const index of indexes) {
        try {
          await collection.createIndex(index.spec, index.options);
        } catch (error: any) {
          // Code 85: IndexOptionsConflict (index with same name but different options)
          // Code 86: IndexKeySpecsConflict (index with same options)
          if (error.code !== 85 && error.code !== 86) {
            console.error(`Error creating index for ${collection.collectionName}:`, error);
          }
        }
      }
    }
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

  // Thêm phương thức để lấy tất cả các session
  async getAllSessions(): Promise<QuizSession[]> {
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
  async getSessionsByTopic(topic: string): Promise<QuizSession[]> {
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
  async getSessionsBySubtopic(subtopic: string): Promise<QuizSession[]> {
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

  // Quiz feedback methods
  async submitQuizFeedback(feedback: Omit<QuizFeedback, 'id' | 'createdAt'>): Promise<QuizFeedback> {
    const newFeedback: QuizFeedback = {
      ...feedback,
      id: uuidv4(),
      createdAt: new Date()
    };
    
    await this.withRetry(() => this.quizFeedbackCollection.insertOne(newFeedback));
    
    // Calculate the average rating for the quiz
    await this.updateQuizRating(newFeedback.quizId);
    
    return newFeedback;
  }
  
  private async updateQuizRating(quizId: string): Promise<void> {
    // Get all feedback for this quiz
    const allFeedback = await this.getQuizFeedback(quizId);
    
    if (allFeedback.length === 0) return;
    
    // Calculate average ratings
    const averageOverall = allFeedback.reduce((sum, item) => sum + item.overallRating, 0) / allFeedback.length;
    const averageAccuracy = allFeedback.reduce((sum, item) => sum + item.contentAccuracy, 0) / allFeedback.length;
    const averageClarity = allFeedback.reduce((sum, item) => sum + item.questionClarity, 0) / allFeedback.length;
    
    // Update the quiz with rating information
    await this.withRetry(() =>
      this.quizzesCollection.updateOne(
        { id: quizId },
        { 
          $set: {
            ratings: {
              overallRating: averageOverall,
              contentAccuracy: averageAccuracy,
              questionClarity: averageClarity,
              feedbackCount: allFeedback.length,
              lastUpdated: new Date()
            },
            updatedAt: new Date()
          }
        }
      )
    );
  }
  
  async getQuizFeedback(quizId: string): Promise<QuizFeedback[]> {
    return await this.withRetry(() => 
      this.quizFeedbackCollection.find({ quizId }).sort({ createdAt: -1 }).toArray()
    );
  }
  
  async getFeedbackById(feedbackId: string): Promise<QuizFeedback | null> {
    return await this.withRetry(() => this.quizFeedbackCollection.findOne({ id: feedbackId }));
  }
  
  // Quiz revision methods
  async createQuizRevision(revision: Omit<QuizRevision, 'id' | 'createdAt'>): Promise<QuizRevision> {
    // Get current revision number
    const lastRevision = await this.withRetry(() => 
      this.quizRevisionsCollection.find({ quizId: revision.quizId })
        .sort({ revisionNumber: -1 })
        .limit(1)
        .toArray()
    );
    
    const revisionNumber = lastRevision.length > 0 ? lastRevision[0].revisionNumber + 1 : 1;
    
    const newRevision: QuizRevision = {
      ...revision,
      id: uuidv4(),
      revisionNumber,
      createdAt: new Date()
    };
    
    await this.withRetry(() => this.quizRevisionsCollection.insertOne(newRevision));
    
    // Mark any update schedule as completed if exists
    await this.withRetry(() =>
      this.quizUpdateSchedulesCollection.updateMany(
        { quizId: revision.quizId, isCompleted: false },
        { 
          $set: {
            isCompleted: true,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        }
      )
    );
    
    return newRevision;
  }
  
  async getQuizRevisions(quizId: string): Promise<QuizRevision[]> {
    return await this.withRetry(() => 
      this.quizRevisionsCollection.find({ quizId })
        .sort({ revisionNumber: -1 })
        .toArray()
    );
  }
  
  // Quiz update schedule methods
  async scheduleQuizUpdate(schedule: Omit<QuizUpdateSchedule, 'id' | 'createdAt' | 'isCompleted'>): Promise<QuizUpdateSchedule> {
    const newSchedule: QuizUpdateSchedule = {
      ...schedule,
      id: uuidv4(),
      isCompleted: false,
      createdAt: new Date()
    };
    
    await this.withRetry(() => this.quizUpdateSchedulesCollection.insertOne(newSchedule));
    return newSchedule;
  }
  
  async getQuizUpdateSchedules(isCompleted?: boolean): Promise<QuizUpdateSchedule[]> {
    const query = isCompleted !== undefined ? { isCompleted } : {};
    
    return await this.withRetry(() => 
      this.quizUpdateSchedulesCollection.find(query)
        .sort({ scheduledDate: 1 })
        .toArray()
    );
  }
  
  async getPendingUpdatesByTopic(topic: string): Promise<QuizUpdateSchedule[]> {
    return await this.withRetry(() => 
      this.quizUpdateSchedulesCollection.find({
        topic: { $regex: topic, $options: 'i' },
        isCompleted: false
      })
      .sort({ scheduledDate: 1 })
      .toArray()
    );
  }
  
  async completeQuizUpdate(scheduleId: string): Promise<void> {
    await this.withRetry(() =>
      this.quizUpdateSchedulesCollection.updateOne(
        { id: scheduleId },
        { 
          $set: {
            isCompleted: true,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        }
      )
    );
  }
  
  // Update a quiz question
  async updateQuizQuestion(
    quizId: string, 
    questionId: string, 
    updates: any, 
    changedBy: string,
    reason: string
  ): Promise<void> {
    // Get the original quiz
    const quiz = await this.getQuiz(quizId);
    if (!quiz) {
      throw new Error(`Quiz with ID ${quizId} not found`);
    }
    
    // Find the question to update
    const questionIndex = quiz.questions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) {
      throw new Error(`Question with ID ${questionId} not found in quiz ${quizId}`);
    }
    
    // Save the original question for revision tracking
    const originalQuestion = quiz.questions[questionIndex];
    
    // Prepare the revision changes
    const changes: Array<{
      questionId: string;
      fieldChanged: string;
      oldValue: string;
      newValue: string;
    }> = [];
    
    // Track each field change
    Object.keys(updates).forEach(field => {
      const oldValue = JSON.stringify(originalQuestion[field as keyof typeof originalQuestion]);
      const newValue = JSON.stringify(updates[field]);
      
      if (oldValue !== newValue) {
        changes.push({
          questionId,
          fieldChanged: field,
          oldValue,
          newValue
        });
      }
    });
    
    // Update the question
    quiz.questions[questionIndex] = {
      ...quiz.questions[questionIndex],
      ...updates
    };
    
    // Save the updated quiz
    await this.updateQuiz(quizId, { questions: quiz.questions });
    
    // Create revision record
    if (changes.length > 0) {
      await this.createQuizRevision({
        quizId,
        revisionNumber: 0, // This will be determined by the createQuizRevision method
        changedBy,
        changes,
        reason
      });
    }
  }
  
  // Method to get quizzes that need periodic reviews
  async getQuizzesNeedingReview(daysSinceLastUpdate: number = 90): Promise<Quiz[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastUpdate);
    
    return await this.withRetry(() => 
      this.quizzesCollection.find({
        $or: [
          { updatedAt: { $lt: cutoffDate } },
          { updatedAt: { $exists: false } }
        ]
      }).toArray()
    );
  }
} 