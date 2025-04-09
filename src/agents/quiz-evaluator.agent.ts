import { ModelConfigService } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { AgentType } from '../services/model-config.service';
import { QUIZ_EVALUATOR_PROMPT } from './prompts/quiz-evaluator.prompt';
import { Quiz, Question } from '../models/quiz.model';

export interface QuizEvaluatorConfig {
  maxTokens?: number;
  temperature?: number;
  strictMode?: boolean;
  evaluationCriteria?: {
    technicalAccuracy?: boolean;
    difficultyBalance?: boolean;
    clarity?: boolean;
    coverage?: boolean;
  };
}

export interface QuestionEvaluation {
  questionId: string;
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface EvaluationResult {
  overallScore: number;
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  };
  questionEvaluations: QuestionEvaluation[];
  metadata: {
    criteriaUsed: string[];
    suggestedImprovements: string[];
    timestamp: string;
  };
}

export class QuizEvaluatorAgent {
  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly modelAdapterService: ModelAdapterService
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
          coverage: true
        }
      };

      const finalConfig = { ...defaultConfig, ...config };
      
      const prompt = `${QUIZ_EVALUATOR_PROMPT}

Quiz to evaluate:
${JSON.stringify(quiz, null, 2)}

Evaluation Configuration:
${JSON.stringify(finalConfig, null, 2)}`;

      const response = await this.modelAdapterService.generateText({
        ...modelConfig,
        maxTokens: finalConfig.maxTokens,
        temperature: finalConfig.temperature,
        prompt
      });

      const result = this.modelAdapterService.parseJSON<EvaluationResult>(response.content);
      
      if (result) {
        return result;
      } else {
        // Return a basic evaluation result if parsing failed
        return this.createDefaultEvaluationResult("Could not process detailed evaluation");
      }
    } catch (error) {
      console.error('Failed to parse quiz evaluation response:', error);
      
      // Return a basic result on error
      return this.createDefaultEvaluationResult("Error processing evaluation");
    }
  }

  /**
   * Evaluate quiz and return feedback that can be used to improve next generation
   * @param quiz Quiz to evaluate
   * @param config Evaluation configuration
   * @returns Feedback for next generation
   */
  async evaluateForFeedback(quiz: Quiz, config: QuizEvaluatorConfig = {}): Promise<{
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  }> {
    try {
      const evaluationResult = await this.evaluate(quiz, config);
      return evaluationResult.feedback;
    } catch (error) {
      console.error('Failed to evaluate quiz for feedback:', error);
      return {
        strengths: [],
        weaknesses: [],
        suggestions: []
      };
    }
  }

  /**
   * Create a default evaluation result when processing fails
   */
  private createDefaultEvaluationResult(errorReason: string): EvaluationResult {
    return {
      overallScore: 0.5,
      feedback: {
        strengths: ["Basic evaluation performed"],
        weaknesses: [errorReason],
        suggestions: ["Try again with more detailed quiz"]
      },
      questionEvaluations: [],
      metadata: {
        criteriaUsed: [],
        suggestedImprovements: ["improve quiz structure"],
        timestamp: new Date().toISOString()
      }
    };
  }
} 