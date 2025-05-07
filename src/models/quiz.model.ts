export type Difficulty = 'basic' | 'intermediate' | 'advanced';

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
  difficulty: Difficulty;
  explanation?: string;
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
  prompt: string;
  questions: Array<MultipleChoiceQuestion | CodingQuestion>;
  createdAt: Date;
  config: QuizGenerationConfig;
  metadata: {
    difficulty: 'basic' | 'intermediate' | 'advanced';
    totalQuestions: number;
    generatedAt: string;
    estimatedTime: number;
  };
  updatedAt?: Date;
}

export interface QuizSession {
  id: string;
  quiz: Quiz;
  topic: string;
  createdAt: Date;
  updatedAt?: Date;
  similarTopics?: string[];
  evaluation?: QuizEvaluation;
  promptHistory?: {
    attempts: number;
    successfulPrompts: PromptFeedback[];
    failedPrompts: PromptFeedback[];
    averageScore: number;
  };
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
  questionCount?: number;
  difficulty?: 'basic' | 'intermediate' | 'advanced';
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
  analysisResults?: {
    mainSummary?: string;
    importantPoints?: string[];
    topicRelevanceScore?: number;
    sourceQuality?: {
      credibility: number;
      recency: number;
      diversity: number;
    };
    recommendations?: string[];
  };
}

export interface PromptFeedback {
  prompt: any;
  score: number;
  timestamp: Date;
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  };
}

export interface PromptHistory {
  topic: string;
  attempts: number;
  successfulPrompts: PromptFeedback[];
  failedPrompts: PromptFeedback[];
  averageScore: number;
  createdAt: Date;
  updatedAt: Date;
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

export interface QuizFeedback {
  id: string;
  quizId: string;
  userId?: string;
  isFromAdmin: boolean;
  overallRating: number; // 1-5 scale
  contentAccuracy: number; // 1-5 scale
  questionClarity: number; // 1-5 scale
  comments: string;
  questionFeedback: Array<{
    questionId: string;
    isCorrect: boolean;
    comments: string;
    suggestedChanges?: string;
  }>;
  createdAt: Date;
  updatedAt?: Date;
}

export interface QuizRevision {
  id: string;
  quizId: string;
  revisionNumber: number;
  changedBy: string;
  changes: Array<{
    questionId: string;
    fieldChanged: string;
    oldValue: string;
    newValue: string;
  }>;
  reason: string;
  createdAt: Date;
}

export interface QuizUpdateSchedule {
  id: string;
  quizId: string;
  topic: string;
  scheduledDate: Date;
  reason: string;
  isCompleted: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
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

export interface SubtopicAnalysis {
  topic: string;
  difficulty?: 'basic' | 'intermediate' | 'advanced';
  searchAnalysis: {
    mainSummary?: string;
    importantPoints?: string[];
    topicRelevanceScore?: number;
    sourceQuality?: {
      credibility: number;
      recency: number;
      diversity: number;
    };
    recommendations?: string[];
  };
} 