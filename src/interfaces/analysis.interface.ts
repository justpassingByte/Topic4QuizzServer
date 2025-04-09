export interface SearchAnalysis {
  summary: string;
  codingQuestions: Array<{
    question: string;
    answer: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }>;
  multipleChoiceQuestions: Array<{
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  }>;
  learningRecommendations: Array<{
    topic: string;
    description: string;
    resources?: string[];
  }>;
}

export interface AIAnalysisOutput {
  mainSummary: string;
  questions: Array<{
    type: 'coding' | 'multiple_choice';
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    question: string;
    hints?: string[];
    options?: string[];
    correctOption?: number;
    explanation?: string;
  }>;
  recommendations: string[];
} 