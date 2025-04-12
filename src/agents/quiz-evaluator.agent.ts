import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';
import { QUIZ_EVALUATOR_PROMPT } from './prompts/quiz-evaluator.prompt';
import { Quiz, Question } from '../models/quiz.model';
import { MemoryService } from '../services/memory.service';

export interface QuizEvaluatorConfig {
  maxTokens?: number;
  temperature?: number;
  strictMode?: boolean;
  evaluationCriteria?: {
    technicalAccuracy?: boolean;
    difficultyBalance?: boolean;
    clarity?: boolean;
    coverage?: boolean;
    promptQuality?: boolean;
  };
}

export interface QuestionEvaluation {
  questionId: string;
  score: number;
  issues: string[];
  suggestions: string[];
  promptEffectiveness?: number;
}

export interface EvaluationResult {
  overallScore: number;
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    promptSpecificFeedback?: {
      effectiveness: number;
      improvements: string[];
      successfulPatterns: string[];
    };
  };
  questionEvaluations: QuestionEvaluation[];
  metadata: {
    criteriaUsed: string[];
    suggestedImprovements: string[];
    timestamp: string;
    promptAnalysis?: {
      clarity: number;
      specificity: number;
      contextRelevance: number;
    };
  };
}

export class QuizEvaluatorAgent {
  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService,
    private readonly memory: MemoryService
  ) {}

  async evaluate(quiz: Quiz, config: QuizEvaluatorConfig = {}): Promise<EvaluationResult> {
    try {
      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.QUIZ_EVALUATOR);
      
      const defaultConfig: QuizEvaluatorConfig = {
        maxTokens: 2000,
        temperature: 0.3,
        strictMode: true,
        evaluationCriteria: {
          technicalAccuracy: true,
          difficultyBalance: true,
          clarity: true,
          coverage: true,
          promptQuality: true
        }
      };

      const finalConfig = { ...defaultConfig, ...config };
      
      const prompt = `${QUIZ_EVALUATOR_PROMPT}

Quiz to evaluate:
${JSON.stringify(quiz, null, 2)}

Evaluation Configuration:
${JSON.stringify(finalConfig, null, 2)}

Additional Instructions:
- Analyze prompt effectiveness for each question
- Identify successful prompt patterns
- Suggest specific prompt improvements
- Rate prompt clarity and specificity`;

      const response = await this.modelAdapterService.generateText({
        ...modelConfig,
        maxTokens: finalConfig.maxTokens,
        temperature: finalConfig.temperature,
        prompt
      });

      const result = this.modelAdapterService.parseJSON<EvaluationResult>(response.content);
      
      if (result) {
        return this.enhanceEvaluationResult(result);
      } else {
        return this.createDefaultEvaluationResult("Could not process detailed evaluation");
      }
    } catch (error) {
      console.error('Failed to parse quiz evaluation response:', error);
      return this.createDefaultEvaluationResult("Error processing evaluation");
    }
  }

  private enhanceEvaluationResult(result: EvaluationResult): EvaluationResult {
    // Add prompt-specific analysis if not present
    if (!result.feedback.promptSpecificFeedback) {
      result.feedback.promptSpecificFeedback = {
        effectiveness: this.calculatePromptEffectiveness(result),
        improvements: this.extractPromptImprovements(result),
        successfulPatterns: this.extractSuccessfulPatterns(result)
      };
    }

    // Add prompt analysis to metadata if not present
    if (!result.metadata.promptAnalysis) {
      result.metadata.promptAnalysis = {
        clarity: this.calculatePromptClarity(result),
        specificity: this.calculatePromptSpecificity(result),
        contextRelevance: this.calculateContextRelevance(result)
      };
    }

    return result;
  }

  private calculatePromptEffectiveness(result: EvaluationResult): number {
    const baseScore = result.overallScore;
    const clarityImpact = result.questionEvaluations.every(q => q.issues.length === 0) ? 0.2 : 0;
    const specificityImpact = result.feedback.strengths.length > result.feedback.weaknesses.length ? 0.1 : 0;
    
    return Math.min(1, baseScore + clarityImpact + specificityImpact);
  }

  private extractPromptImprovements(result: EvaluationResult): string[] {
    const improvements = new Set<string>();
    
    // Collect improvements from question evaluations
    result.questionEvaluations.forEach(qe => {
      qe.suggestions.forEach(s => improvements.add(s));
    });

    // Add general improvements
    result.feedback.suggestions.forEach(s => improvements.add(s));

    return Array.from(improvements);
  }

  private extractSuccessfulPatterns(result: EvaluationResult): string[] {
    return result.feedback.strengths
      .filter(s => s.includes('question') || s.includes('prompt'))
      .map(s => `- ${s}`);
  }

  private calculatePromptClarity(result: EvaluationResult): number {
    const unclearQuestions = result.questionEvaluations.filter(
      qe => qe.issues.some(i => i.toLowerCase().includes('unclear'))
    ).length;
    
    return 1 - (unclearQuestions / result.questionEvaluations.length);
  }

  private calculatePromptSpecificity(result: EvaluationResult): number {
    const specificityIssues = result.questionEvaluations.filter(
      qe => qe.issues.some(i => i.toLowerCase().includes('specific'))
    ).length;
    
    return 1 - (specificityIssues / result.questionEvaluations.length);
  }

  private calculateContextRelevance(result: EvaluationResult): number {
    const relevanceScore = result.feedback.strengths.filter(
      s => s.toLowerCase().includes('context') || s.toLowerCase().includes('relevant')
    ).length * 0.2;
    
    return Math.min(1, 0.6 + relevanceScore);
  }

  async evaluateForFeedback(quiz: Quiz, config: QuizEvaluatorConfig = {}): Promise<{
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    promptFeedback?: {
      effectiveness: number;
      improvements: string[];
    };
  }> {
    try {
      const evaluationResult = await this.evaluate(quiz, config);
      return {
        ...evaluationResult.feedback,
        promptFeedback: {
          effectiveness: evaluationResult.feedback.promptSpecificFeedback?.effectiveness || 0.5,
          improvements: evaluationResult.feedback.promptSpecificFeedback?.improvements || []
        }
      };
    } catch (error) {
      console.error('Failed to evaluate quiz for feedback:', error);
      return {
        strengths: [],
        weaknesses: [],
        suggestions: [],
        promptFeedback: {
          effectiveness: 0.5,
          improvements: []
        }
      };
    }
  }

  private createDefaultEvaluationResult(errorReason: string): EvaluationResult {
    return {
      overallScore: 0.5,
      feedback: {
        strengths: ["Basic evaluation performed"],
        weaknesses: [errorReason],
        suggestions: ["Try again with more detailed quiz"],
        promptSpecificFeedback: {
          effectiveness: 0.5,
          improvements: ["Improve prompt structure"],
          successfulPatterns: []
        }
      },
      questionEvaluations: [],
      metadata: {
        criteriaUsed: [],
        suggestedImprovements: ["improve quiz structure"],
        timestamp: new Date().toISOString(),
        promptAnalysis: {
          clarity: 0.5,
          specificity: 0.5,
          contextRelevance: 0.5
        }
      }
    };
  }

  async provideFeedback(topic: string, quiz: Quiz, config: QuizEvaluatorConfig = {}): Promise<void> {
    try {
      // Get evaluation feedback
      const feedback = await this.evaluateForFeedback(quiz, config);
      
      // Create feedback data
      const feedbackData = {
        timestamp: new Date(),
        feedback: {
          score: feedback.promptFeedback?.effectiveness || 0.5,
          issues: feedback.weaknesses,
          suggestions: feedback.suggestions,
          successfulElements: feedback.strengths
        },
        prompt: quiz.prompt || ''
      };

      // Store feedback in memory
      await this.memory.storePromptFeedback(topic, feedbackData);
      
      console.log(`Stored feedback for topic: ${topic}`);
    } catch (error) {
      console.error('Failed to provide feedback:', error);
      throw error;
    }
  }
} 