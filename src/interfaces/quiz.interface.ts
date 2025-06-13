export interface QuizTemplate {
  id: string;
  name: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  topicAreas: string[];
  questionTypes: ('multiple-choice' | 'true-false' | 'coding')[];
  numberOfQuestions: number;
  timeLimit: number;
  passingScore: number;
  language: string;
  created: Date;
  updated: Date;
}

interface TestCase {
  input: any[];
  expected: any;
}

export interface Question {
  id: string;
  type: 'multiple-choice' | 'true-false' | 'coding';
  question: string;
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  topics: string[];
  testCases?: TestCase[];
  created: Date;
  updated: Date;
}

export interface Quiz {
  id: string;
  templateId: string;
  name: string;
  description: string;
  questions: Question[];
  created: Date;
  updated: Date;
  timeLimit: number;
  passingScore: number;
} 