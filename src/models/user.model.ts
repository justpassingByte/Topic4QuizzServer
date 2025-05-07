export interface User {
  id: string;
  username: string;
  email: string;
  preferences: {
    favoriteTopics: string[];
    difficultyPreference?: 'basic' | 'intermediate' | 'advanced';
  };
  createdAt: Date;
  updatedAt?: Date;
}

export interface QuizResult {
  id: string;
  userId: string;
  quizId: string;
  topic: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  difficultyBreakdown: {
    basic: {
      correct: number;
      total: number;
    };
    intermediate: {
      correct: number;
      total: number;
    };
    advanced: {
      correct: number;
      total: number;
    };
  };
  completedAt: Date;
}

export interface UserStatistics {
  totalQuizzesCompleted: number;
  averageScore: number;
  topicPerformance: {
    [topic: string]: {
      completed: number;
      averageScore: number;
      strengths: string[];
      weaknesses: string[];
    }
  };
  recommendedDifficulty: 'basic' | 'intermediate' | 'advanced';
  quizzesCompletedOverTime: {
    date: string;
    count: number;
  }[];
  lastActive: Date;
}

export interface TopicRecommendation {
  topic: string;
  relevanceScore: number;
  basedOn: string[];
  difficulty: 'basic' | 'intermediate' | 'advanced';
} 