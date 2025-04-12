import { Difficulty } from './quiz.model';

export interface ResearchAgentConfig {
  maxTokens?: number;
  temperature?: number;
  searchDepth?: 'basic' | 'comprehensive';
  includeExamples?: boolean;
  includeSources?: boolean;
  maxResourcesPerType?: number;
  depth?: Difficulty;
  focus?: string[];
  minConfidence?: number;
} 