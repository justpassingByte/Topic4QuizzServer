import request from 'supertest';
import { app } from '../../app';
import { DatabaseService } from '../../services/database.service';
import { UserService } from '../../services/user.service';
import { QuizService } from '../../services/quiz.service';

// Use real services but mock database
jest.mock('../../services/database.service');

describe('End-to-End Quiz Flow', () => {
  let userService: UserService;
  let quizService: QuizService;
  let userId: string;
  let quizId: string;

  beforeAll(async () => {
    // Setup mock database
    (DatabaseService as jest.Mock).mockImplementation(() => ({
      ensureConnection: jest.fn().mockResolvedValue(undefined),
      client: {
        db: () => ({
          collection: () => ({
            createIndex: jest.fn().mockResolvedValue(undefined),
            insertOne: jest.fn().mockImplementation((doc) => {
              return { insertedId: doc.id || 'mock-id' };
            }),
            find: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([])
              })
            }),
            findOne: jest.fn().mockImplementation((query) => {
              if (query.id === userId) {
                return { 
                  id: userId, 
                  username: 'testuser', 
                  email: 'test@example.com' 
                };
              }
              if (query.id === quizId) {
                return {
                  id: quizId,
                  name: 'JavaScript Quiz',
                  description: 'Test your JavaScript knowledge',
                  questions: [
                    {
                      id: 'q1',
                      type: 'multiple-choice',
                      question: 'What is JavaScript?',
                      options: ['Language', 'Database', 'OS', 'Browser'],
                      correctAnswer: 'Language',
                      difficulty: 'beginner'
                    }
                  ],
                  timeLimit: 10,
                  passingScore: 70
                };
              }
              return null;
            }),
            updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
            deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
          })
        })
      },
      withRetry: (fn: () => any) => fn()
    }));

    // Initialize services
    userService = new UserService();
    userService.init = jest.fn().mockResolvedValue(undefined);
    await userService.init();
    
    quizService = new QuizService();
    
    // Generate test IDs
    userId = 'user-e2e-test';
    quizId = 'quiz-e2e-test';
  });

  describe('Complete Quiz Flow', () => {
    it('should register a new user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        favoriteTopics: ['javascript']
      };
      
      const res = await request(app)
        .post('/api/users')
        .send(userData);
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      userId = res.body.id; // Store the actual user ID
    });

    it('should create a new quiz', async () => {
      const quizData = {
        name: 'JavaScript Basics',
        description: 'Test your JavaScript knowledge',
        questions: [
          {
            type: 'multiple-choice',
            question: 'What is JavaScript?',
            options: ['Language', 'Database', 'OS', 'Browser'],
            correctAnswer: 'Language',
            difficulty: 'beginner'
          }
        ],
        timeLimit: 10,
        passingScore: 70
      };
      
      const res = await request(app)
        .post('/api/quizzes')
        .send(quizData);
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      quizId = res.body.id; // Store the actual quiz ID
    });

    it('should retrieve the quiz', async () => {
      const res = await request(app).get(`/api/quizzes/${quizId}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', quizId);
      expect(res.body).toHaveProperty('questions');
      expect(res.body.questions).toHaveLength(1);
    });

    it('should submit quiz answers and get results', async () => {
      const answers = {
        userId: userId,
        answers: {
          q1: 'Language'
        },
        timeTaken: 5
      };
      
      const res = await request(app)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(answers);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('score', 100); // Should be correct
      expect(res.body).toHaveProperty('timeBonus');
      expect(res.body).toHaveProperty('finalScore');
    });

    it('should retrieve user statistics', async () => {
      const res = await request(app).get(`/api/users/${userId}/statistics`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalQuizzesCompleted');
      expect(res.body).toHaveProperty('averageScore');
      expect(res.body).toHaveProperty('topicPerformance');
    });
  });

  describe('Error Handling Flow', () => {
    it('should handle invalid quiz submission', async () => {
      const invalidAnswers = {
        userId: userId,
        answers: {
          q1: 'InvalidAnswer'
        },
        timeTaken: 5
      };
      
      const res = await request(app)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(invalidAnswers);
      
      expect(res.status).toBe(200); // Still returns 200 even for wrong answers
      expect(res.body).toHaveProperty('score', 0); // Score should be 0
    });

    it('should handle non-existent quiz', async () => {
      const res = await request(app).get('/api/quizzes/nonexistent');
      
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle non-existent user', async () => {
      const res = await request(app).get('/api/users/nonexistent/statistics');
      
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });
}); 