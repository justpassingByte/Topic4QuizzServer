export interface DifficultyDistribution {
  basic: number;
  intermediate: number;
  advanced: number;
}

export interface QuizConfig {
  multipleChoiceCount: number;
  codingQuestionCount: number;
  difficultyDistribution: DifficultyDistribution;
  maxAttempts?: number;
  includeHints?: boolean;
}

export interface Choice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface BaseQuestion {
  id: string;
  text: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  explanation: string;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple-choice';
  choices: Choice[];
}

export interface CodingQuestion extends BaseQuestion {
  type: 'coding';
  solutionTemplate?: string;
  hints?: string[];
  solution: string;
}

export type Question = MultipleChoiceQuestion | CodingQuestion;

export interface QuizMetadata {
  difficulty: 'basic' | 'intermediate' | 'advanced';
  totalQuestions: number;
  generatedAt: string;
  estimatedTime?: number;
}

export interface Quiz {
  id: string;
  questions: Array<MultipleChoiceQuestion | CodingQuestion>;
  createdAt: Date;
  config: QuizGenerationConfig;
  metadata: {
    difficulty: 'basic' | 'intermediate' | 'advanced';
    totalQuestions: number;
    generatedAt: string;
    estimatedTime: number;
  };
}

export interface QuizSession {
  id: string;
  quiz: Quiz;
  topic: string;
  createdAt: Date;
  updatedAt?: Date;
  similarTopics?: string[];
  evaluation?: QuizEvaluation;
}

export interface ResearchData {
  concepts?: Array<{
    name: string;
    description: string;
    examples: string[];
  }>;
  bestPractices?: string[];
  commonMistakes?: string[];
  realWorldApplications?: string[];
  resources?: string[];
  metadata?: {
    researchTime: string;
    topicComplexity: 'basic' | 'intermediate' | 'advanced';
    coverageScore: number;
    generatedFallback?: boolean;
  };
}

export interface QuizGenerationConfig {
  multipleChoiceCount: number;
  codingQuestionCount: number;
  difficultyDistribution: {
    basic: number;
    intermediate: number;
    advanced: number;
  };
  typeDistribution: {
    multipleChoice: number;
    coding: number;
  };
  includeHints: boolean;
  maxAttempts: number;
}

export interface PromptFeedback {
  prompt: any;
  score: number;
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  };
}

export interface PromptHistory {
  attempts: number;
  successfulPrompts: PromptFeedback[];
  failedPrompts: PromptFeedback[];
  averageScore: number;
}

export interface QuizEvaluation {
  quizId: string;
  score: number;
  feedback: {
    coverage: number;
    difficulty: number;
    uniqueness: number;
    clarity: number;
    practicality: number;
    quality: number;
  };
  issues: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    questionId?: string;
  }>;
  suggestions: string[];
  timestamp: Date;
}

export interface QuizGenerationMetadata {
  attempts: number;
  context: {
    keyPoints: string[];
    concepts: string[];
    difficulty: 'basic' | 'intermediate' | 'advanced';
    prerequisites: string[];
    suggestedTopics: string[];
    estimatedTime: number;
  };
  researchSummary: string;
  promptVersion: number;
} 