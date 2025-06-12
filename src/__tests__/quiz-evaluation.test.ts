import { QuizEvaluationService } from '../services/quiz-evaluation.service';
import { Question, Quiz } from '../interfaces/quiz.interface';

describe('Quiz Evaluation', () => {
  let evaluationService: QuizEvaluationService;

  beforeEach(() => {
    evaluationService = new QuizEvaluationService();
  });

  describe('evaluateQuizAttempt', () => {
    it('should correctly evaluate multiple choice questions', () => {
      const questions: Question[] = [
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
        }
      ];

      const userAnswers = {
        q1: 'Language'
      };

      const result = evaluationService.evaluateQuizAttempt(questions, userAnswers);
      expect(result.score).toBe(100);
      expect(result.correctAnswers).toBe(1);
      expect(result.totalQuestions).toBe(1);
    });

    it('should correctly evaluate true-false questions', () => {
      const questions: Question[] = [
        {
          id: 'q1',
          type: 'true-false',
          question: 'JavaScript is a compiled language',
          options: ['True', 'False'],
          correctAnswer: 'False',
          difficulty: 'beginner',
          topics: ['javascript'],
          created: new Date(),
          updated: new Date()
        }
      ];

      const userAnswers = {
        q1: 'False'
      };

      const result = evaluationService.evaluateQuizAttempt(questions, userAnswers);
      expect(result.score).toBe(100);
      expect(result.correctAnswers).toBe(1);
    });

    it('should handle partially correct answers', () => {
      const questions: Question[] = [
        {
          id: 'q1',
          type: 'multiple-choice',
          question: 'Select all JavaScript data types',
          options: ['string', 'number', 'boolean', 'float'],
          correctAnswer: ['string', 'number', 'boolean'],
          difficulty: 'intermediate',
          topics: ['javascript'],
          created: new Date(),
          updated: new Date()
        }
      ];

      const userAnswers = {
        q1: ['string', 'number']
      };

      const result = evaluationService.evaluateQuizAttempt(questions, userAnswers);
      expect(result.score).toBe(67); // 2 out of 3 correct
      expect(result.partiallyCorrectAnswers).toBe(1);
    });

    it('should evaluate coding questions based on test cases', () => {
      const questions: Question[] = [
        {
          id: 'q1',
          type: 'coding',
          question: 'Write a function that adds two numbers',
          correctAnswer: 'function add(a, b) { return a + b; }',
          testCases: [
            { input: [1, 2], expected: 3 },
            { input: [0, 0], expected: 0 },
            { input: [-1, 1], expected: 0 }
          ],
          difficulty: 'beginner',
          topics: ['javascript'],
          created: new Date(),
          updated: new Date()
        }
      ];

      const userAnswers = {
        q1: 'function add(a, b) { return a + b; }'
      };

      const result = evaluationService.evaluateQuizAttempt(questions, userAnswers);
      expect(result.score).toBe(100);
      expect(result.testCasesPassed).toBe(3);
      expect(result.totalTestCases).toBe(3);
    });

    it('should provide detailed feedback for each question', () => {
      const questions: Question[] = [
        {
          id: 'q1',
          type: 'multiple-choice',
          question: 'What is JavaScript?',
          options: ['Language', 'Database', 'OS', 'Browser'],
          correctAnswer: 'Language',
          explanation: 'JavaScript is a programming language',
          difficulty: 'beginner',
          topics: ['javascript'],
          created: new Date(),
          updated: new Date()
        }
      ];

      const userAnswers = {
        q1: 'Database'
      };

      const result = evaluationService.evaluateQuizAttempt(questions, userAnswers);
      expect(result.score).toBe(0);
      expect(result.feedback).toBeDefined();
      expect(result.feedback![0]).toEqual({
        questionId: 'q1',
        correct: false,
        explanation: 'JavaScript is a programming language',
        userAnswer: 'Database',
        correctAnswer: 'Language'
      });
    });
  });

  describe('evaluateTimedQuizAttempt', () => {
    it('should calculate time-based scoring', () => {
      const quiz: Quiz = {
        id: 'quiz1',
        templateId: 'template1',
        name: 'JavaScript Basics',
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
          }
        ],
        timeLimit: 10,
        passingScore: 70,
        created: new Date(),
        updated: new Date()
      };

      const userAnswers = {
        q1: 'Language'
      };

      const timeTaken = 5; // minutes

      const result = evaluationService.evaluateTimedQuizAttempt(quiz, userAnswers, timeTaken);
      expect(result.score).toBe(100);
      expect(result.timeBonus).toBeGreaterThan(0);
      expect(result.finalScore).toBeGreaterThan(result.score);
    });
  });
}); 