import { QuizTemplate } from '../../interfaces/quiz.interface';

export const sampleQuizTemplates: QuizTemplate[] = [
  {
    id: 'template1',
    name: 'Basic Programming Quiz',
    description: 'A quiz about fundamental programming concepts',
    difficulty: 'intermediate',
    topicAreas: ['programming', 'computer-science'],
    questionTypes: ['multiple-choice', 'true-false'],
    numberOfQuestions: 10,
    timeLimit: 30, // minutes
    passingScore: 70,
    language: 'en',
    created: new Date('2024-01-01'),
    updated: new Date('2024-01-01')
  },
  {
    id: 'template2',
    name: 'JavaScript Fundamentals',
    description: 'Test your JavaScript knowledge',
    difficulty: 'beginner',
    topicAreas: ['javascript', 'web-development'],
    questionTypes: ['multiple-choice', 'coding'],
    numberOfQuestions: 15,
    timeLimit: 45,
    passingScore: 60,
    language: 'en',
    created: new Date('2024-01-02'),
    updated: new Date('2024-01-02')
  }
]; 