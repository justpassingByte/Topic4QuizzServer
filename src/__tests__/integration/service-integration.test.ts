import { UserService } from '../../services/user.service';
import { QuizEvaluationService } from '../../services/quiz-evaluation.service';
import { QuizResult } from '../../models/user.model';
import { Question, Quiz } from '../../interfaces/quiz.interface';
import { DatabaseService } from '../../services/database.service';

// Mock database to avoid actual DB connection
jest.mock('../../services/database.service');

describe('Service Integration Tests', () => {
  let userService: UserService;
  let quizEvaluationService: QuizEvaluationService;
  let mockQuiz: Quiz;
  let mockUserAnswers: Record<string, any>;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock database connection
    (DatabaseService as jest.Mock).mockImplementation(() => ({
      ensureConnection: jest.fn().mockResolvedValue(undefined),
      client: {
        db: () => ({
          collection: () => ({
            createIndex: jest.fn().mockResolvedValue(undefined),
            insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
            find: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                toArray: jest.fn().mockResolvedValue([])
              })
            }),
            findOne: jest.fn().mockResolvedValue(null)
          })
        })
      },
      withRetry: (fn: () => any) => fn()
    }));

    // Setup services
    userService = new UserService();
    userService.init = jest.fn().mockResolvedValue(undefined);
    await userService.init();
    
    quizEvaluationService = new QuizEvaluationService();
    
    // Setup mock quiz
    mockQuiz = {
      id: 'quiz-1',
      templateId: 'template-1',
      name: 'JavaScript Basics Quiz',
      description: 'Test your JavaScript knowledge',
      questions: [
        {
          id: 'q1',
          type: 'multiple-choice',
          question: 'What is JavaScript?',
          options: ['Language', 'Database', 'OS', 'Browser'],
          correctAnswer: 'Language',
          difficulty: 'beginner',
          topics: ['javascript'],
          created: new Date(),
          updated: new Date()
        },
        {
          id: 'q2',
          type: 'multiple-choice',
          question: 'Which is not a JavaScript data type?',
          options: ['string', 'number', 'boolean', 'float'],
          correctAnswer: 'float',
          difficulty: 'basic',
          topics: ['javascript'],
          created: new Date(),
          updated: new Date()
        }
      ],
      timeLimit: 10,
      passingScore: 70,
      created: new Date(),
      updated: new Date()
    };
    
    // Setup mock user answers
    mockUserAnswers = {
      q1: 'Language',
      q2: 'float'
    };
    
    // Mock user service methods
    userService.saveQuizResult = jest.fn().mockResolvedValue(undefined);
    userService.getUserQuizResults = jest.fn().mockResolvedValue([]);
    userService.getUserStatistics = jest.fn().mockImplementation(async () => {
      return {
        totalQuizzesCompleted: 1,
        averageScore: 100,
        topicPerformance: {
          javascript: {
            completed: 1,
            averageScore: 100,
            strengths: ['concepts'],
            weaknesses: []
          }
        },
        recommendedDifficulty: 'intermediate',
        quizzesCompletedOverTime: [{ date: new Date().toISOString().split('T')[0], count: 1 }],
        lastActive: new Date()
      };
    });
  });

  describe('Quiz Completion Workflow', () => {
    it('should evaluate quiz and save results to user profile', async () => {
      // 1. Evaluate the quiz
      const evaluationResult = quizEvaluationService.evaluateQuizAttempt(
        mockQuiz.questions, 
        mockUserAnswers
      );
      
      expect(evaluationResult.score).toBe(100); // Both answers are correct
      expect(evaluationResult.correctAnswers).toBe(2);
      
      // 2. Create quiz result
      const quizResult: QuizResult = {
        userId: 'user-1',
        quizId: mockQuiz.id,
        score: evaluationResult.score,
        topic: 'javascript',
        difficulty: 'basic',
        completedAt: new Date(),
        answers: evaluationResult.feedback?.map(fb => ({
          questionId: fb.questionId,
          userAnswer: fb.userAnswer,
          correct: fb.correct
        })) || []
      };
      
      // 3. Save the result
      await userService.saveQuizResult(quizResult);
      
      // 4. Verify saveQuizResult was called with correct data
      expect(userService.saveQuizResult).toHaveBeenCalledWith(quizResult);
      
      // 5. Get updated user statistics
      const userStats = await userService.getUserStatistics('user-1');
      
      // 6. Verify statistics reflect this quiz
      expect(userStats).toBeDefined();
      expect(userStats?.totalQuizzesCompleted).toBe(1);
      expect(userStats?.topicPerformance).toHaveProperty('javascript');
    });
    
    it('should calculate time bonus for timed quizzes', async () => {
      // 1. Evaluate the timed quiz
      const timeTaken = 5; // 5 minutes
      const evaluationResult = quizEvaluationService.evaluateTimedQuizAttempt(
        mockQuiz,
        mockUserAnswers,
        timeTaken
      );
      
      // 2. Verify time bonus was applied
      expect(evaluationResult.score).toBe(100);
      expect(evaluationResult.timeBonus).toBeGreaterThan(0);
      expect(evaluationResult.finalScore).toBeGreaterThan(evaluationResult.score);
      
      // 3. Create quiz result with time bonus
      const quizResult: QuizResult = {
        userId: 'user-1',
        quizId: mockQuiz.id,
        score: evaluationResult.finalScore || evaluationResult.score,
        topic: 'javascript',
        difficulty: 'basic',
        completedAt: new Date(),
        answers: evaluationResult.feedback?.map(fb => ({
          questionId: fb.questionId,
          userAnswer: fb.userAnswer,
          correct: fb.correct
        })) || []
      };
      
      // 4. Save the result
      await userService.saveQuizResult(quizResult);
      
      // 5. Verify saveQuizResult was called with correct data including time bonus
      expect(userService.saveQuizResult).toHaveBeenCalledWith(
        expect.objectContaining({
          score: expect.any(Number)
        })
      );
    });
  });
}); 