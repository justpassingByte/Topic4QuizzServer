import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';
import { PROMPT_BUILDER_PROMPT } from './prompts/prompt-builder.prompt';
import { MemoryService } from '../services/memory.service';
import { QuizGeneratorTemplate, QUIZ_GENERATOR_TEMPLATE } from './prompts/quiz-generator.prompt';

// Add interfaces for performance analysis
interface PerformanceAnalysis {
  totalAttempts: number;
  averageScore: number;
  successRate: number;
  commonIssues: Array<{
    issue: string;
    frequency: number;
  }>;
  improvements: Array<{
    type: string;
    impact: number;
  }>;
}

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

// Add this interface at the top of the file
interface MemoryServiceExtended extends MemoryService {
  getLatestFeedback(topic: string): Promise<PromptFeedback | null>;
}

export class PromptBuilderAgent {
  private lastGeneratedPrompts: Map<string, string>;
  private memory: MemoryServiceExtended;

  constructor(
    private readonly modelAdapterService: ModelAdapterService,
    private readonly modelConfigService: ModelConfigService
  ) {
    this.lastGeneratedPrompts = new Map();
    this.memory = new MemoryService() as MemoryServiceExtended;
  }

  async buildPrompt(topic: string, context: any, options: PromptBuilderConfig = {}): Promise<PromptBuilderResult> {
    console.log(`Building prompt for topic "${topic}"...`);
    
    try {
      // 1. Analyze historical performance
      const performance = await this.memory.analyzePromptPerformance(topic);
      const topPrompts = await this.memory.getTopPerformingPrompts(topic, 3);
      
      // 2. Build base prompt
      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.PROMPT_BUILDER);
      let basePrompt = PROMPT_BUILDER_PROMPT;

      // 3. Apply historical learnings
      if (performance && performance.totalAttempts > 0) {
        basePrompt = await this.enhancePromptWithLearnings(basePrompt, performance, topPrompts);
      }

      // 4. Generate improved prompt
      const promptText = await this.generateImprovedPrompt(topic, context, basePrompt, options);

      const response = await this.modelAdapterService.generateText({
        ...modelConfig,
        maxTokens: 3000,
        temperature: this.calculateOptimalTemperature(performance),
        prompt: `You are a quiz generation expert. Your task is to create a structured quiz prompt based on the following analysis and requirements.

Topic: ${topic}

Analysis Results:
${JSON.stringify(context.contextAnalysis, null, 2)}

Subtopic Analysis:
${JSON.stringify(context.subtopicAnalyses, null, 2)}

Requirements:
1. Use the analyzed concepts and relationships to create questions
2. Follow the topic hierarchy from main concepts to subtopics
3. Include practical examples from the analysis
4. Reference key concepts in questions
5. Use consistent terminology from the analysis

You MUST return a JSON object with this exact structure:
{
  "prompt": {
    "mainTopicInstructions": "string - how to create questions for main topic",
    "subtopicInstructions": "string - how to handle subtopics",
    "conceptIntegration": "string - how to use analyzed concepts",
    "difficultyGuidelines": "string - how to maintain difficulty balance",
    "evaluationCriteria": "string - what makes a good answer"
  },
  "metadata": {
    "topicComplexity": "basic" | "intermediate" | "advanced",
    "estimatedQuestionCount": number,
    "promptVersion": 1,
    "conceptCoverage": {
      "mainConcepts": ["list of main concepts to cover"],
      "relationships": ["key relationships to test"],
      "practicalApplications": ["real-world applications"]
    },
    "adaptations": [
      {
        "type": "string",
        "reason": "string",
        "impact": number
      }
    ]
  }
}

Return ONLY the JSON object, no additional text or markdown.`
      });

      // console.log('Raw model response:', response.content);
      let result: PromptBuilderResult;
      
      try {
        const parsed = this.modelAdapterService.parseJSON<any>(response.content);
        // console.log('Parsed response:', parsed);

        if (parsed?.prompt) {
          // Nếu response đúng format mới
          if (typeof parsed.prompt === 'object') {
            const promptText = `Generate a quiz about ${topic} with the following structure:

1. Main Topic Questions:
${parsed.prompt.mainTopicInstructions}

2. Subtopic Coverage:
${parsed.prompt.subtopicInstructions}

3. Concept Integration:
${parsed.prompt.conceptIntegration}

4. Difficulty Guidelines:
${parsed.prompt.difficultyGuidelines}

5. Evaluation Criteria:
${parsed.prompt.evaluationCriteria}`;

            result = {
              prompt: promptText,
          metadata: {
                ...parsed.metadata,
                promptVersion: 1,
                topicComplexity: parsed.metadata?.topicComplexity || 'intermediate',
                adaptations: parsed.metadata?.adaptations || []
              }
        };
      } else {
            // Nếu prompt là string
            result = {
              prompt: parsed.prompt,
          metadata: {
                ...parsed.metadata,
            promptVersion: 1,
                topicComplexity: parsed.metadata?.topicComplexity || 'intermediate',
                adaptations: parsed.metadata?.adaptations || []
              }
            };
          }
        } else {
          console.warn('Unexpected response format:', parsed);
          result = this.getFallbackResult(topic, context);
        }

        // Store the generated prompt
        this.lastGeneratedPrompts.set(topic, result.prompt);
        // console.log('Successfully stored prompt for topic:', topic);
        // console.log('Final prompt content:', result.prompt);
        
        return result;
      } catch (error) {
        console.error('Error processing model response:', error);
        return this.getFallbackResult(topic, context);
      }
    } catch (error) {
      console.error('Failed to build prompt:', error);
      return this.getFallbackResult(topic, context);
    }
  }

  private async enhancePromptWithLearnings(
    basePrompt: string, 
    performance: PerformanceAnalysis,
    topPrompts: Array<{ prompt: any; score: number; }>
  ): Promise<string> {
    let enhancedPrompt = basePrompt;

    // 1. Add successful patterns from top prompts
    if (topPrompts.length > 0) {
      const successPatterns = this.extractSuccessPatterns(topPrompts);
      enhancedPrompt += `\n\nSuccessful Patterns:\n${successPatterns.join('\n')}`;
    }

    // 2. Add issue prevention based on common issues
    if (performance.commonIssues?.length > 0) {
      const preventions = this.generateIssuePrevention(performance.commonIssues);
      enhancedPrompt += `\n\nIssue Prevention:\n${preventions}`;
    }

    // 3. Add improvements based on historical data
    if (performance.improvements?.length > 0) {
      const improvements = this.generateImprovements(performance.improvements);
      enhancedPrompt += `\n\nSuggested Improvements:\n${improvements}`;
    }

    return enhancedPrompt;
  }

  private async generateImprovedPrompt(
    topic: string,
    context: any,
    basePrompt: string,
    options: PromptBuilderConfig
  ): Promise<string> {
    return `${basePrompt}

Topic: ${topic}

Context Analysis:
${JSON.stringify(context, null, 2)}

Configuration:
${JSON.stringify(options, null, 2)}

Instructions:
1. Focus on clarity and specificity in questions
2. Ensure balanced difficulty distribution
3. Include practical, real-world examples
4. Maintain consistent terminology
5. Provide clear answer explanations`;
  }

  private calculateOptimalTemperature(performance: PerformanceAnalysis | null): number {
    if (!performance || performance.totalAttempts === 0) {
      return 0.5; // default temperature
    }

    // Adjust temperature based on success rate
    // Lower temperature for high success rate (more conservative)
    // Higher temperature for low success rate (more exploratory)
    const baseTemp = 0.5;
    const successRate = performance.successRate || 0;
    const adjustment = (1 - successRate) * 0.3; // max adjustment of 0.3
    return Math.min(Math.max(baseTemp + adjustment, 0.2), 0.8);
  }

  private extractSuccessPatterns(topPrompts: Array<{ prompt: any; score: number; }>): string[] {
    const patterns: string[] = [];
    topPrompts.forEach(({ prompt, score }) => {
      if (score >= 0.8) {
        patterns.push(`- High performing pattern (${score.toFixed(2)}): ${this.summarizePrompt(prompt)}`);
      }
    });
    return patterns;
  }

  private generateIssuePrevention(issues: Array<{ issue: string; frequency: number; }>): string {
    return issues
      .filter(({ frequency }) => frequency > 0.2) // Focus on frequent issues
      .map(({ issue }) => `- Prevent: ${issue}`)
      .join('\n');
  }

  private generateImprovements(improvements: Array<{ type: string; impact: number; }>): string {
    return improvements
      .filter(({ impact }) => impact > 0.3) // Focus on high-impact improvements
      .map(({ type, impact }) => `- Apply: ${type} (Impact: ${(impact * 100).toFixed(1)}%)`)
      .join('\n');
  }

  private summarizePrompt(prompt: any): string {
    // Convert prompt object to a concise summary
    if (typeof prompt === 'string') {
      return prompt.substring(0, 100) + '...';
    }
    return JSON.stringify(prompt).substring(0, 100) + '...';
  }

  private getAdaptations(performance: PerformanceAnalysis | null): Array<{ type: string; reason: string; impact: number; }> {
    if (!performance) return [];

    const adaptations: Array<{ type: string; reason: string; impact: number; }> = [];

    // Add adaptations based on performance metrics
    if (performance.successRate < 0.7) {
      adaptations.push({
        type: 'difficulty_adjustment',
        reason: 'Low success rate indicates need for better difficulty calibration',
        impact: 0.3
      });
    }

    // Add adaptations for common issues
    performance.commonIssues?.forEach(({ issue, frequency }) => {
      if (frequency > 0.3) {
        adaptations.push({
          type: 'issue_prevention',
          reason: `Frequent issue: ${issue}`,
          impact: frequency
        });
      }
    });

    return adaptations;
  }

  private getFallbackResult(topic: string, context: any): PromptBuilderResult {
    interface Concept {
      description: string;
    }
    
    interface SubtopicAnalysis {
      name: string;
      searchAnalysis: {
        mainSummary: string;
      };
    }

    const mainConcepts = (context?.contextAnalysis?.keyConcepts || []) as Concept[];
    const subtopics = (context?.subtopicAnalyses || []) as SubtopicAnalysis[];

    const promptText = `Generate a comprehensive quiz about ${topic} with the following requirements:

1. Main Concepts to Cover:
${mainConcepts.map((c: Concept) => `- ${c.description}`).join('\n')}

2. Subtopics to Include:
${subtopics.map((s: SubtopicAnalysis) => `- ${s.name}: ${s.searchAnalysis.mainSummary}`).join('\n')}

3. Requirements:
- Create multiple choice questions testing understanding
- Include clear explanations for each answer
- Ensure balanced difficulty distribution
- Focus on practical applications
- Maintain consistent terminology`;

    return {
      prompt: promptText,
      metadata: {
        topicComplexity: 'intermediate',
        estimatedQuestionCount: 10,
        promptVersion: 1,
        adaptations: []
      }
    };
  }

  async getLastGeneratedPrompt(topic: string): Promise<string> {
    const prompt = this.lastGeneratedPrompts.get(topic);
    if (!prompt) {
      console.warn(`No stored prompt found for topic: ${topic}`);
      return this.getFallbackResult(topic, {}).prompt;
    }
    return prompt;
  }

  async buildQuizPrompt(topic: string, config: {
    questionCount?: number;
    difficultyDistribution?: {
      basic: number;
      intermediate: number;
      advanced: number;
    };
    typeDistribution?: {
      multipleChoice: number;
      coding: number;
    };
    focusAreas?: string[];
    includeHints?: boolean;
    subtopics?: string[];
    analysisResults?: {
      mainSummary: string;
      importantPoints: string[];
      topicRelevanceScore: number;
      sourceQuality: {
        credibility: number;
        recency: number;
        diversity: number;
      };
      recommendations: string[];
    };
    feedback?: {
      strengths?: string[];
      weaknesses?: string[];
      suggestions?: string[];
    };
  } = {}) {
    try {
      // 1. Get historical performance and feedback
      const performance = await this.memory.analyzePromptPerformance(topic);
      // 2. Build base prompt with template
      const template = QUIZ_GENERATOR_TEMPLATE;
      let prompt = template.base;

      // 3. Add topic and context
      prompt += `\n\nTopic: ${topic}`;
      prompt += `\nRequired Questions: ${config.questionCount || 10}`;

      // 4. Add Analysis Results if available
      if (config.analysisResults) {
        prompt += '\n\nANALYSIS RESULTS:';
        prompt += `\nMain Summary: ${config.analysisResults.mainSummary}`;
        
        if (config.analysisResults.importantPoints?.length > 0) {
          prompt += '\n\nKey Concepts:';
          config.analysisResults.importantPoints.forEach((point, index) => {
            prompt += `\n${index + 1}. ${point}`;
          });
        }

        if (config.analysisResults.recommendations?.length > 0) {
          prompt += '\n\nRecommended Focus Areas:';
          config.analysisResults.recommendations.forEach((rec, index) => {
            prompt += `\n${index + 1}. ${rec}`;
          });
        }

        prompt += '\n\nSource Quality Metrics:';
        prompt += `\n- Credibility: ${(config.analysisResults.sourceQuality.credibility * 100).toFixed(0)}%`;
        prompt += `\n- Recency: ${(config.analysisResults.sourceQuality.recency * 100).toFixed(0)}%`;
        prompt += `\n- Diversity: ${(config.analysisResults.sourceQuality.diversity * 100).toFixed(0)}%`;
      }

      // 5. Add subtopics if available
      const subtopics = config.subtopics || [];
      if (subtopics.length > 0) {
        prompt += `\n\nSUBTOPICS:`;
        subtopics.forEach((subtopic, index) => {
          prompt += `\n${index + 1}. ${subtopic}`;
        });
        prompt += `\n\n${template.subtopicInstructions}`;
      }

      // 6. Add historical performance feedback if available
      if (performance && performance.totalAttempts > 0) {
        prompt += '\n\nEVALUATION FEEDBACK:';
        if (performance.commonIssues?.length > 0) {
          prompt += '\nPatterns to Avoid:';
          performance.commonIssues.forEach(({issue, frequency}) => {
            prompt += `\n- ${issue} (Frequency: ${(frequency * 100).toFixed(1)}%)`;
          });
        }
        if (performance.improvements?.length > 0) {
          prompt += '\nSuggested Improvements:';
          performance.improvements.forEach(({type, impact}) => {
            prompt += `\n- ${type} (Impact: ${(impact * 100).toFixed(1)}%)`;
          });
        }
      }

      // 7. Add difficulty distribution
      const defaultDifficultyDist = {
        basic: 0.4,
        intermediate: 0.4,
        advanced: 0.2
      };
      const difficultyDist = config.difficultyDistribution || defaultDifficultyDist;
      
      prompt += `\n\nDifficulty Distribution:`;
      prompt += `\n- Basic: ${Math.round(difficultyDist.basic * 100)}% (Fundamental concepts, simple implementations)`;
      prompt += `\n- Intermediate: ${Math.round(difficultyDist.intermediate * 100)}% (Combined concepts, multi-step solutions)`;
      prompt += `\n- Advanced: ${Math.round(difficultyDist.advanced * 100)}% (Advanced patterns, optimization)`;

      // 8. Add question type distribution
      const defaultTypeDist = {
        multipleChoice: 0.6,
        coding: 0.4
      };
      const typeDist = config.typeDistribution || defaultTypeDist;
      
      prompt += `\n\nQuestion Types:`;
      prompt += `\n- Multiple Choice: ${Math.round(typeDist.multipleChoice * 100)}% (Question with 4 options, one correct answer)`;
      prompt += `\n- Coding: ${Math.round(typeDist.coding * 100)}% (Problem description, solution approach, and hints)`;

      // 9. Add focus areas if specified
      const focusAreas = config.focusAreas || [];
      if (focusAreas.length > 0) {
        prompt += `\n\nFocus Areas: ${focusAreas.join(', ')}`;
      }

      // 10. Add hint instruction if enabled
      if (config.includeHints) {
        prompt += `\n\nALWAYS include hints for coding questions, and optionally for multiple-choice questions.`;
      }

      // 11. Add format instructions
      prompt += `\n\n${template.formatInstructions}`;

      // Store the generated prompt
      this.lastGeneratedPrompts.set(topic, prompt);

      return {
        prompt,
        metadata: {
          topicComplexity: this.analyzeComplexity(config),
          estimatedQuestionCount: config.questionCount || 10,
          promptVersion: 1,
          adaptations: this.getAdaptations(performance)
        }
      };
    } catch (error) {
      console.error('Failed to build quiz prompt:', error);
      return this.getFallbackResult(topic, config);
    }
  }

  private analyzeComplexity(config: any): 'basic' | 'intermediate' | 'advanced' {
    // Implement your logic to determine the complexity based on the configuration
    // This is a placeholder and should be replaced with the actual implementation
    return 'intermediate';
  }
}