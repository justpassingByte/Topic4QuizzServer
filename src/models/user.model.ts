export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  score?: number;
  preferences: {
    favoriteTopics: string[];
    difficultyPreference?: 'basic' | 'intermediate' | 'advanced';
  };
  createdAt: Date;
  updatedAt?: Date;
  quizResults?: QuizResult[];
}

export interface QuizResult {
  userId: string;
  quizId: string;
  score: number;
  topicSlug: string;
  topicName: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
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
    [topicSlug: string]: {
      topic: string;
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
  difficulty: 'basic' | 'intermediate' | 'advanced';
} 