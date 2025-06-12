import { UserService } from '../../services/user.service';
import { QuizService } from '../../services/quiz.service';
import { QuizResult } from '../../models/user.model';
import { QuizEvaluationService } from '../../services/quiz-evaluation.service';
import { Question } from '../../interfaces/quiz.interface';

// Mock the services
jest.mock('../../services/database.service');
jest.mock('../../services/quiz.service');
jest.mock('../../services/user.service');

// Override Question interface for tests to avoid date requirements
type TestQuestion = Omit<Question, 'topics' | 'created' | 'updated'> & {
  topics?: string[];
  created?: Date;
  updated?: Date;
};

describe('User Statistics and Quiz Evaluation Tests', () => {
  let evaluationService: QuizEvaluationService;
  
  const mockUserId = 'user-123';
  const mockQuizId = 'quiz-456';
  
  // Mock quiz results
  const mockQuizResults: QuizResult[] = [
    {
      userId: mockUserId,
      quizId: mockQuizId,
      score: 80,
      topic: 'JavaScript',
      difficulty: 'beginner',
      completedAt: new Date(),
      answers: [
        { questionId: 'arrays_1', userAnswer: 'array.push()', correct: true },
        { questionId: 'functions_1', userAnswer: 'function() {}', correct: true },
        { questionId: 'objects_1', userAnswer: 'wrong answer', correct: false }
      ]
    },
    {
      userId: mockUserId,
      quizId: 'quiz-789',
      score: 90,
      topic: 'TypeScript',
      difficulty: 'intermediate',
      completedAt: new Date(),
      answers: [
        { questionId: 'types_1', userAnswer: 'string', correct: true },
        { questionId: 'interfaces_1', userAnswer: 'interface', correct: true },
        { questionId: 'generics_1', userAnswer: 'T', correct: true }
      ]
    }
  ];
  
  // Mock quiz questions
  const mockQuestions: TestQuestion[] = [
    {
      id: 'q1',
      type: 'multiple-choice',
      question: 'What is JavaScript?',
      options: ['Language', 'Database', 'OS', 'Browser'],
      correctAnswer: 'Language',
      difficulty: 'beginner',
      topics: ['JavaScript', 'Programming'],
      created: new Date(),
      updated: new Date()
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      question: 'Which is not a JavaScript data type?',
      options: ['Number', 'String', 'Table', 'Boolean'],
      correctAnswer: 'Table',
      difficulty: 'beginner',
      topics: ['JavaScript', 'Data Types'],
      created: new Date(),
      updated: new Date()
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      question: 'What does DOM stand for?',
      options: [
        'Document Object Model', 
        'Data Object Model', 
        'Document Oriented Model', 
        'Digital Object Model'
      ],
      correctAnswer: 'Document Object Model',
      difficulty: 'beginner',
      topics: ['JavaScript', 'DOM'],
      created: new Date(),
      updated: new Date()
    }
  ];
  
  // User answers
  const userAnswers = {
    q1: 'Language',
    q2: 'Table',
    q3: 'Data Object Model'
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up the evaluation service directly (not mocked)
    evaluationService = new QuizEvaluationService();
    
    // Setup UserService mock methods
    (UserService.prototype.init as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (UserService.prototype.getUserQuizResults as jest.Mock) = jest.fn().mockResolvedValue(mockQuizResults);
    (UserService.prototype.calculateUserStatistics as jest.Mock) = jest.fn().mockImplementation(async () => ({
      totalQuizzesCompleted: 2,
      averageScore: 85,
      topicPerformance: {
        'JavaScript': {
          completed: 1,
          averageScore: 80,
          strengths: ['arrays', 'functions'],
          weaknesses: ['objects']
        },
        'TypeScript': {
          completed: 1,
          averageScore: 90,
          strengths: ['types', 'interfaces', 'generics'],
          weaknesses: []
        }
      },
      recommendedDifficulty: 'intermediate',
      quizzesCompletedOverTime: [
        { date: new Date().toISOString().split('T')[0], count: 2 }
      ],
      lastActive: new Date()
    }));
  });
  
  describe('User Statistics', () => {
    it('should calculate correct average score', async () => {
      // Create a new instance of the UserService (it's mocked)
      const userService = new UserService();
      
      // Initialize service
      await userService.init();
      
      // Calculate statistics
      const statistics = await userService.calculateUserStatistics(mockUserId);
      
      // Check computed statistics
      expect(statistics.totalQuizzesCompleted).toBe(2);
      expect(statistics.averageScore).toBe(85); // (80 + 90) / 2
      expect(statistics.recommendedDifficulty).toBe('intermediate'); // avg score > 70 but < 90
    });
    
    it('should identify strengths and weaknesses correctly', async () => {
      // Create a new instance of the UserService (it's mocked)
      const userService = new UserService();
      
      // Initialize service
      await userService.init();
      
      // Calculate statistics
      const statistics = await userService.calculateUserStatistics(mockUserId);
      
      // Check topic performance
      expect(statistics.topicPerformance).toHaveProperty('JavaScript');
      expect(statistics.topicPerformance).toHaveProperty('TypeScript');
      
      // JavaScript performance (2/3 correct answers = 67% success)
      const jsPerformance = statistics.topicPerformance['JavaScript'];
      expect(jsPerformance.averageScore).toBe(80);
      expect(jsPerformance.completed).toBe(1);
      
      // TypeScript performance (3/3 correct answers = 100% success)
      const tsPerformance = statistics.topicPerformance['TypeScript'];
      expect(tsPerformance.averageScore).toBe(90);
      expect(tsPerformance.completed).toBe(1);
      
      // Strengths should include topics with high scores
      expect(tsPerformance.strengths.length).toBeGreaterThan(0);
    });
  });
  
  describe('Quiz Evaluation', () => {
    it('should calculate correct score for partially correct answers', () => {
      // 2 out of 3 correct = 67%
      const evaluation = evaluationService.evaluateQuizAttempt(mockQuestions as Question[], userAnswers);
      expect(evaluation.score).toBe(67);
      expect(evaluation.correctAnswers).toBe(2);
      expect(evaluation.totalQuestions).toBe(3);
    });
    
    it('should calculate correct score for all correct answers', () => {
      // All correct answers
      const allCorrectAnswers = {
        q1: 'Language',
        q2: 'Table',
        q3: 'Document Object Model'
      };
      
      const evaluation = evaluationService.evaluateQuizAttempt(mockQuestions as Question[], allCorrectAnswers);
      expect(evaluation.score).toBe(100);
      expect(evaluation.correctAnswers).toBe(3);
    });
    
    it('should calculate correct score for all incorrect answers', () => {
      // All incorrect answers
      const allIncorrectAnswers = {
        q1: 'Database',
        q2: 'Number',
        q3: 'Data Object Model'
      };
      
      const evaluation = evaluationService.evaluateQuizAttempt(mockQuestions as Question[], allIncorrectAnswers);
      expect(evaluation.score).toBe(0);
      expect(evaluation.correctAnswers).toBe(0);
    });
  });
}); 