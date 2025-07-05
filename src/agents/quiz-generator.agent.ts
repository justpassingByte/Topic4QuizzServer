import { v4 as uuidv4 } from 'uuid';
import { ModelConfigService, AgentType } from '../services/model-config.service';
import { ModelAdapterService } from '../services/model-adapter.service';
import { 
  Quiz,
  QuizGenerationConfig, 
  Question,
  MultipleChoiceQuestion,
  CodingQuestion,
  Choice,
  Difficulty
} from '../models/quiz.model';
import { PromptBuilderAgent } from './prompt-builder.agent';
import { parseJSON } from '../utils/json-parser.util';

interface RawQuestion {
  id?: string;
  question: string;
  type: 'multiple-choice' | 'coding';
  difficulty: Difficulty;
  explanation: string;
  correctAnswer?: string | number;
  correctIndex?: number;
  choices?: string[];
  hints?: string[];
  solutionTemplate?: string;
}

export class QuizGeneratorAgent {
  private lastGeneratedPrompt: string | null = null;
  private promptBuilder: PromptBuilderAgent;

  constructor(
    private readonly modelAdapterService: ModelAdapterService,
    private readonly modelConfigService: ModelConfigService
  ) {
    this.promptBuilder = new PromptBuilderAgent(modelAdapterService, modelConfigService);
  }

  private transformQuestion(question: RawQuestion): Question {
    const baseQuestion = {
      id: question.id || uuidv4(),
      text: question.question,
      difficulty: question.difficulty,
      explanation: question.explanation
    };

    if (question.type === 'multiple-choice') {
      let answers = [];
      if (Array.isArray((question as any).options)) {
        answers = (question as any).options.map((opt: string, idx: number) => ({
          id: `${baseQuestion.id}_${idx}`,
          text: opt,
          correct: (typeof (question as any).correctAnswer === 'number')
            ? idx === (question as any).correctAnswer
            : idx === (question as any).correctIndex
        }));
      } else if (Array.isArray(question.choices)) {
        answers = question.choices.map((choice, index) => ({
          id: `${baseQuestion.id}_${index}`,
          text: choice,
          correct: typeof question.correctAnswer === 'number'
            ? index === question.correctAnswer
            : index === question.correctIndex
        }));
      }
      const mcQuestion: MultipleChoiceQuestion = {
        ...baseQuestion,
        type: 'multiple-choice',
        answers
      };
      return mcQuestion;
    } else {
      const codingQuestion: CodingQuestion = {
        ...baseQuestion,
        type: 'coding',
        solution: question.correctAnswer as string || '',
        hints: question.hints || [],
        solutionTemplate: question.solutionTemplate || ''
      };
      return codingQuestion;
    }
  }

  async generate(topic: string, config: QuizGenerationConfig, prompt?: string): Promise<Quiz> {
    if (!topic || typeof topic !== 'string') {
      throw new Error('Invalid topic provided');
    }

    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config provided');
    }

    try {
      let quizPrompt = prompt;
      if (!quizPrompt) {
        const promptResult = await this.promptBuilder.buildQuizPrompt(topic, {
          questionCount: config.questionCount || (config.multipleChoiceCount + config.codingQuestionCount),
          difficultyDistribution: {
            basic: config.difficultyDistribution.basic,
            intermediate: config.difficultyDistribution.intermediate,
            advanced: config.difficultyDistribution.advanced
          },
          typeDistribution: {
            multipleChoice: config.typeDistribution.multipleChoice,
            coding: config.typeDistribution.coding
          },
          includeHints: config.includeHints,
          analysisResults: config.analysisResults ? {
            mainSummary: config.analysisResults.mainSummary ?? '',
            importantPoints: config.analysisResults.importantPoints ?? [],
            topicRelevanceScore: config.analysisResults.topicRelevanceScore ?? 0,
            sourceQuality: config.analysisResults.sourceQuality ?? {
              credibility: 0,
              recency: 0,
              diversity: 0
            },
            recommendations: config.analysisResults.recommendations ?? []
          } : undefined
        });
        quizPrompt = promptResult.prompt;
      }
      this.lastGeneratedPrompt = quizPrompt;
      // console.log('Generated quiz prompt:', this.lastGeneratedPrompt);

      const modelConfig = this.modelConfigService.getModelConfigForAgent(AgentType.QUIZ_GENERATOR);
      const formattedPrompt = `
Generate a quiz about ${topic} with the following requirements:

Web Search Result:
${config.analysisResults?.mainSummary && config.analysisResults.mainSummary.trim() !== '' ? config.analysisResults.mainSummary : 'No web search result available.'}

Web Key Concepts:
${Array.isArray(config.analysisResults?.importantPoints) && config.analysisResults.importantPoints.length > 0 ? config.analysisResults.importantPoints.map((point, index) => `${index + 1}. ${point}`).join('\n') : 'No key concepts found.'}

Requirements:
- Total Questions: ${config.questionCount}
- Multiple Choice: ${Math.round(config.typeDistribution.multipleChoice * 100)}%
- Coding Questions: ${Math.round(config.typeDistribution.coding * 100)}%
- Difficulty: Basic ${Math.round(config.difficultyDistribution.basic * 100)}%, Intermediate ${Math.round(config.difficultyDistribution.intermediate * 100)}%, Advanced ${Math.round(config.difficultyDistribution.advanced * 100)}%
${config.includeHints ? '- Include hints for all questions' : ''}

Response Format:
{
  "questions": [
    {
      "id": "string (optional)",
      "question": "string (required)",
      "type": "multiple-choice" | "coding",
      "difficulty": "basic" | "intermediate" | "advanced",
      "explanation": "string (required)",
      "correctAnswer": "string or number (required for coding questions)",
      "correctIndex": "number (required for multiple-choice)",
      "choices": ["string"] (required for multiple-choice, exactly 4 options),
      "hints": ["string"] (optional),
      "solutionTemplate": "string (optional, for coding questions)"
    }
  ]
}

Return ONLY valid JSON, no additional text or markdown.`;

      const response = await this.modelAdapterService.generateText({
        ...modelConfig,
        prompt: quizPrompt,
        maxTokens: 3000,
        temperature: 0.7
      });

      if (!response?.content) {
        throw new Error('No response from model');
      }

      // console.log('Raw model response:', response.content);

      const parsedResponse = parseJSON(response.content) as any;
      if (!parsedResponse?.questions?.length) {
        throw new Error('Invalid response format: missing questions array');
      }

      const questions = parsedResponse.questions.map((q: RawQuestion) => this.transformQuestion(q));
      // console.log(`Transformed ${questions.length} questions`);

      return {
        id: uuidv4(),
        prompt: this.lastGeneratedPrompt,
        questions,
        createdAt: new Date(),
        config,
        metadata: {
          difficulty: config.difficulty || 'intermediate',
          totalQuestions: questions.length,
          generatedAt: new Date().toISOString(),
          estimatedTime: this.calculateEstimatedTime(questions)
        }
      };

    } catch (error) {
      console.error('Error generating quiz:', error);
      throw error;
    }
  }

  private calculateEstimatedTime(questions: Question[]): number {
    const MULTIPLE_CHOICE_TIME = 2; // minutes
    const CODING_QUESTION_TIME = 5; // minutes

    return questions.reduce((total, question) => {
      return total + (question.type === 'coding' ? CODING_QUESTION_TIME : MULTIPLE_CHOICE_TIME);
    }, 0);
  }
}
