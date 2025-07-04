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

export const AVAILABLE_GOOGLE_MODELS = {
  GEMINI_PRO: {
    provider: ModelProvider.GOOGLE,
    model: 'gemini-1.5-flash-latest',
    maxTokens: 3000,
    temperature: 0.7
  }
};

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
    // Default to Google Gemini Pro for all generative tasks
    const geminiConfig = AVAILABLE_GOOGLE_MODELS.GEMINI_PRO;

    // Context Analyzer
    this.modelConfigs.set(
      AgentType.CONTEXT_ANALYZER, 
      {
        ...geminiConfig,
        temperature: 0.3,
        maxTokens: 1500
      }
    );
    
    // Research Agent - Keep using Serper for search
    this.modelConfigs.set(
      AgentType.RESEARCH_AGENT,
      {
        provider: ModelProvider.SERPER,
        model: 'serper-search',
        maxTokens: 500
      }
    );
    
    // Search Analysis Agent
    this.modelConfigs.set(
      AgentType.SEARCH_ANALYSIS_AGENT,
      {
        ...geminiConfig,
        temperature: 0.3, // Lower temperature for more focused analysis
        maxTokens: 2048
      }
    );
    
    // Prompt Builder - Use Gemini
    this.modelConfigs.set(
      AgentType.PROMPT_BUILDER,
      {
        ...geminiConfig
      }
    );
    
    // Quiz Generator - Use Gemini
    this.modelConfigs.set(
      AgentType.QUIZ_GENERATOR,
      {
        ...geminiConfig,
        temperature: 0.5, // Lower temperature for better JSON structure
        maxTokens: 3000
      }
    );
    
    // Quiz Evaluator - Use Gemini
    this.modelConfigs.set(
      AgentType.QUIZ_EVALUATOR,
      {
        ...geminiConfig,
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
