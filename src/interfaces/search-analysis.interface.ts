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

export interface WebSearchResult {
    title: string;
    link: string;
    snippet: string;
    source?: string;
    publishedDate?: string;
  }
  
  export interface AIAnalysisOutput {
    mainSummary: string;
    importantPoints: string[];
    topicRelevanceScore: number;
    sourceQuality?: {
      credibility: number;
      recency: number;
      diversity: number;
    };
    recommendations?: string[];
  }
  
  export interface SearchAnalysisConfig {
    maxTokens?: number;
    temperature?: number;
    searchResultLimit?: number;
    language?: string;
    region?: string;
    includeSourceMetrics?: boolean;
  }
  export interface ResearchData {
    mainContent: string;
    concepts: Array<{
      name: string;
      description: string;
    }>;
    references?: Array<{
      title: string;
      url: string;
    }>;
  }
  
  export interface ResearchConfig {
    maxTokens?: number;
    temperature?: number;
    includeReferences?: boolean;
  }