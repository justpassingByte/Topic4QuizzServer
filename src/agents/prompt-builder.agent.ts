import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';
import { PROMPT_BUILDER_PROMPT } from './prompts/prompt-builder.prompt';

export interface PromptBuilderConfig {
  maxTokens?: number;
  temperature?: number;
  format?: 'json' | 'text';
  includeExamples?: boolean;
  promptStyle?: {
    tone?: 'formal' | 'casual';
    detail?: 'concise' | 'detailed';
    focus?: string[];
  };
  adaptivePrompting?: {
    enabled: boolean;
    maxAttempts?: number;
    learningRate?: number;
  };
}

export interface PromptBuilderResult {
  prompt: string;
  metadata: {
    topicComplexity: 'basic' | 'intermediate' | 'advanced';
    estimatedQuestionCount: number;
    suggestedTimeLimit?: number;
    promptVersion: number;
    adaptations?: {
      type: string;
      reason: string;
      impact: number;
    }[];
  };
}

export interface PromptFeedback {
  score: number;
  issues: string[];
  suggestions: string[];
  successfulElements?: string[];
  failedElements?: string[];
}

export interface PromptBuilderOptions {
  maxTokens?: number;
  temperature?: number;
  format?: 'json' | 'text';
  includeExamples?: boolean;
  promptStyle?: {
    tone?: 'formal' | 'casual';
    detail?: 'concise' | 'detailed';
    focus?: string[];
  };
}

export class PromptBuilderAgent {
  private promptHistory: Map<string, { prompt: string; feedback: PromptFeedback[]; }>;
  private promptVersions: Map<string, number>;

  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService
  ) {
    this.promptHistory = new Map();
    this.promptVersions = new Map();
  }

  async buildPrompt(topic: string, context: any, options: PromptBuilderOptions = {}): Promise<PromptBuilderResult> {
    console.log(`Building prompt for topic "${topic}"...`);
    
    try {
      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.PROMPT_BUILDER);
      
      // Default prompt text in case of errors
      const defaultPrompt = `Generate a quiz about "${topic}" with multiple choice and coding questions.`;
      
      const promptText = `${PROMPT_BUILDER_PROMPT}

Topic: ${topic}

Context Analysis:
${JSON.stringify(context, null, 2)}

Prompt Builder Options:
${JSON.stringify(options, null, 2)}`;

      const response = await this.modelAdapterService.generateText({
        ...modelConfig,
        maxTokens: 2000,
        temperature: 0.5,
        prompt: promptText
      });

      const result = this.modelAdapterService.parseJSON<PromptBuilderResult>(response.content);

      // Return result or fallback
      if (result) {
        return {
          metadata: {
            ...result.metadata,
            promptVersion: result.metadata?.promptVersion || 1,
            topicComplexity: result.metadata?.topicComplexity || 'intermediate'
          },
          prompt: result.prompt || defaultPrompt
        };
      } else {
        // Return a fallback result if parsing fails
        return {
          metadata: {
            promptVersion: 1,
            topicComplexity: 'intermediate',
            estimatedQuestionCount: 5,
            suggestedTimeLimit: 10
          },
          prompt: defaultPrompt
        };
      }
    } catch (error) {
      console.error('Failed to parse prompt builder response:', error);
      throw new Error('Invalid prompt builder response format');
    }
  }

  async provideFeedback(topic: string, feedback: PromptFeedback): Promise<void> {
    const history = this.promptHistory.get(topic) || { prompt: PROMPT_BUILDER_PROMPT, feedback: [] };
    history.feedback.push(feedback);
    this.promptHistory.set(topic, history);

    if (feedback.score < 0.7) {
      await this.adaptPrompt(topic, feedback);
    }
  }

  private async adaptPrompt(topic: string, feedback: PromptFeedback): Promise<void> {
    const history = this.promptHistory.get(topic);
    if (!history) return;

    const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.PROMPT_BUILDER);
    const adaptationPrompt = `Analyze the following prompt and feedback to create an improved version:

Current Prompt:
${history.prompt}

Feedback:
${JSON.stringify(feedback, null, 2)}

Previous Adaptations:
${history.feedback.map(f => f.suggestions.join('\n')).join('\n')}

Generate an improved prompt that addresses the feedback while maintaining successful elements.`;

    const response = await this.modelAdapterService.generateText({
      ...modelConfig,
      maxTokens: 2000,
      temperature: 0.5,
      prompt: adaptationPrompt
    });

    history.prompt = response.content;
    this.promptVersions.set(topic, (this.promptVersions.get(topic) || 0) + 1);
  }

  private async getAdaptedPrompt(topic: string, defaultPrompt: string): Promise<string> {
    const history = this.promptHistory.get(topic);
    return history?.prompt || defaultPrompt;
  }

  private getPromptVersion(topic: string): number {
    return this.promptVersions.get(topic) || 1;
  }

  private getFormattedFeedbackHistory(topic: string): string {
    const history = this.promptHistory.get(topic);
    if (!history || history.feedback.length === 0) {
      return 'No previous feedback available.';
    }

    return history.feedback
      .map((f, i) => `
Attempt ${i + 1}:
Score: ${f.score}
Issues: ${f.issues.join(', ')}
Successful Elements: ${f.successfulElements?.join(', ') || 'None'}
Suggestions: ${f.suggestions.join(', ')}`)
      .join('\n');
  }
}