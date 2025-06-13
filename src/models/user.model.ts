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
  userId: string;
  quizId: string;
  score: number;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  completedAt: Date;
  answers: Array<{
    questionId: string;
    userAnswer: any;
    correct: boolean;
    timeTaken?: number;
  }>;
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
  quizzesCompletedOverTime: Array<{
    date: string;
    count: number;
  }>;
  lastActive: Date;
}

export interface TopicRecommendation {
  topic: string;
  relevanceScore: number;
  basedOn: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
} 