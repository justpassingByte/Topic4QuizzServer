export interface ResearchAgentConfig {
  maxTokens?: number;
  temperature?: number;
  searchDepth?: 'basic' | 'comprehensive';
  includeExamples?: boolean;
  includeSources?: boolean;
  maxResourcesPerType?: number;
  depth?: 'basic' | 'intermediate' | 'advanced';
  focus?: string[];
  minConfidence?: number;
} 