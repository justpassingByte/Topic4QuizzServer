import { config } from 'dotenv';
import { ModelProvider } from './model-adapter.service';

// Load environment variables
config();

export enum AgentType {
  CONTEXT_ANALYZER = 'CONTEXT_ANALYZER',
  RESEARCH_AGENT = 'RESEARCH_AGENT',
  SEARCH_ANALYSIS_AGENT = 'SEARCH_ANALYSIS_AGENT',
  PROMPT_BUILDER = 'PROMPT_BUILDER',
  QUIZ_GENERATOR = 'QUIZ_GENERATOR',
  QUIZ_EVALUATOR = 'QUIZ_EVALUATOR',
  
}

export enum ModelFamily {
  LLAMA = 'llama',
  MISTRAL = 'mistral',
  QWEN = 'qwen',
  BERT = 'bert',
  GPT = 'gpt',
  OTHER = 'other'
}

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
}

// Add available models configuration
export const AVAILABLE_QUIZ_MODELS = {
  LLAMA_32: {
    provider: ModelProvider.HUGGINGFACE,
    model: 'meta-llama/Llama-3.2-8B-Instruct',
    maxTokens: 3000,
    temperature: 0.7
  },
  MIXTRAL: {
    provider: ModelProvider.HUGGINGFACE,
    model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    maxTokens: 2048,
    temperature: 0.7
  },
  MISTRAL: {
    provider: ModelProvider.HUGGINGFACE,
    model: 'mistralai/Mistral-7B-Instruct-v0.2',
    maxTokens: 2048,
    temperature: 0.7
  },
  QWEN_OMNI: {
    provider: ModelProvider.HUGGINGFACE,
    model: 'Qwen/Qwen1.5-7B-Chat',
    maxTokens: 2048,
    temperature: 0.7
  }
};

export class ModelConfigService {
  private modelConfigs: Map<AgentType, ModelConfig>;
  
  constructor() {
    this.modelConfigs = new Map();
    this.initializeConfigs();
  }

  private initializeConfigs(): void {
    // Context Analyzer - Dùng Mixtral vì tốt hơn trong việc phân tích ngữ cảnh
    this.modelConfigs.set(
      AgentType.CONTEXT_ANALYZER, 
      {
        ...AVAILABLE_QUIZ_MODELS.MIXTRAL,
        temperature: 0.3,
        maxTokens: 1500
      }
    );
    
    // Research Agent - Sử dụng Serper cho tìm kiếm
    this.modelConfigs.set(
      AgentType.RESEARCH_AGENT,
      {
        provider: ModelProvider.SERPER,
        model: 'serper-search',
        maxTokens: 500
      }
    );
    
    // Search Analysis Agent - Use Mixtral for analyzing search results
    this.modelConfigs.set(
      AgentType.SEARCH_ANALYSIS_AGENT,
      {
        ...AVAILABLE_QUIZ_MODELS.MIXTRAL,
        temperature: 0.3, // Lower temperature for more focused analysis
        maxTokens: 2048
      }
    );
    
    // Prompt Builder - Dùng Llama 3.2 3B Instruct để tạo prompt
    this.modelConfigs.set(
      AgentType.PROMPT_BUILDER,
      {
        provider: ModelProvider.HUGGINGFACE,
        model: process.env.PROMPT_BUILDER_MODEL || 'meta-llama/Llama-3.2-3B-Instruct'
      }
    );
    
    // Quiz Generator - Use Mixtral for better JSON generation
    this.modelConfigs.set(
      AgentType.QUIZ_GENERATOR,
      {
        ...AVAILABLE_QUIZ_MODELS.MIXTRAL,
        temperature: 0.5, // Lower temperature for better JSON structure
        maxTokens: 3000
      }
    );
    
    // Quiz Evaluator - Dùng Mixtral để đánh giá chất lượng
    this.modelConfigs.set(
      AgentType.QUIZ_EVALUATOR,
      {
        ...AVAILABLE_QUIZ_MODELS.MIXTRAL,
        temperature: 0.3 // Lower temperature for more consistent evaluation
      }
    );
  }

  public getModelConfigForAgent(agentType: AgentType): ModelConfig {
    const config = this.modelConfigs.get(agentType);
    if (!config) {
      throw new Error(`No model configuration found for agent type: ${agentType}`);
    }
    return config;
  }

  public setModelForAgent(agentType: AgentType, provider: ModelProvider, model: string): void {
    const currentConfig = this.modelConfigs.get(agentType);
    this.modelConfigs.set(agentType, { 
      ...currentConfig,
      provider, 
      model 
    });
  }

  public setQuizGeneratorModel(modelKey: keyof typeof AVAILABLE_QUIZ_MODELS): void {
    const modelConfig = AVAILABLE_QUIZ_MODELS[modelKey];
    if (!modelConfig) {
      throw new Error(`Invalid model key: ${modelKey}. Available models: ${Object.keys(AVAILABLE_QUIZ_MODELS).join(', ')}`);
    }
    this.modelConfigs.set(AgentType.QUIZ_GENERATOR, modelConfig);
  }

  public getAvailableQuizModels(): typeof AVAILABLE_QUIZ_MODELS {
    return AVAILABLE_QUIZ_MODELS;
  }
} 
