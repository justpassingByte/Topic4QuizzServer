export interface EvaluationCriteria {
  coverage: number;      // 0-1: How well the questions cover the topic
  difficulty: number;    // 0-1: How appropriate the difficulty level is
  uniqueness: number;    // 0-1: How unique and diverse the questions are
  clarity: number;       // 0-1: How clear and understandable the questions are
  practicality: number;  // 0-1: How practical and applicable the questions are
  quality: number;       // 0-1: Overall quality score including accuracy and best practices
}

export interface QuizEvaluation {
  quizId: string;
  score: number;
  feedback: EvaluationCriteria;
  issues: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    questionId?: string;
  }>;
  suggestions: string[];
  timestamp: Date;
}

export interface EvaluationResult {
  overallScore: number;
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  };
  metadata: {
    criteriaUsed: string[];
    suggestedImprovements: string[];
    timestamp: string;
  };
  questionEvaluations: Array<{
    questionId: string;
    score: number;
    issues: string[];
    suggestions: string[];
  }>;
}

export interface EvaluationConfig {
  strictMode: boolean;
  evaluationCriteria: {
    technicalAccuracy: boolean;
    difficultyBalance: boolean;
    clarity: boolean;
    coverage: boolean;
  };
} 