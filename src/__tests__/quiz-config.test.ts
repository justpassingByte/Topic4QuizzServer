import { validateQuizConfig, mergeAndValidateConfig, defaultQuizConfig } from '../config/quiz.config';
import { QuizGenerationConfig } from '../models/quiz.model';

describe('Quiz Configuration', () => {
  describe('validateQuizConfig', () => {
    it('should validate a correct configuration', () => {
      const config: Partial<QuizGenerationConfig> = {
        multipleChoiceCount: 7,
        codingQuestionCount: 3,
        difficultyDistribution: {
          basic: 7,
          intermediate: 2,
          advanced: 1
        },
        typeDistribution: {
          multipleChoice: 7,
          coding: 3
        },
        includeHints: true,
        maxAttempts: 3
      };

      const { isValid, errors } = validateQuizConfig(config);
      expect(isValid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('should reject negative question counts', () => {
      const config: Partial<QuizGenerationConfig> = {
        multipleChoiceCount: -1,
        codingQuestionCount: 3
      };

      const { isValid, errors } = validateQuizConfig(config);
      expect(isValid).toBe(false);
      expect(errors).toContain('multipleChoiceCount must be a positive integer');
    });

    it('should reject non-integer question counts', () => {
      const config: Partial<QuizGenerationConfig> = {
        multipleChoiceCount: 7.5,
        codingQuestionCount: 3
      };

      const { isValid, errors } = validateQuizConfig(config);
      expect(isValid).toBe(false);
      expect(errors).toContain('multipleChoiceCount must be a positive integer');
    });

    it('should validate difficulty distribution', () => {
      const config: Partial<QuizGenerationConfig> = {
        multipleChoiceCount: 7,
        codingQuestionCount: 3,
        difficultyDistribution: {
          basic: -1,
          intermediate: 2,
          advanced: 1
        }
      };

      const { isValid, errors } = validateQuizConfig(config);
      expect(isValid).toBe(false);
      expect(errors).toContain('basic difficulty count must be a positive integer');
    });
  });

  describe('mergeAndValidateConfig', () => {
    it('should use default config when no user config provided', () => {
      const config = mergeAndValidateConfig({});
      expect(config).toEqual(defaultQuizConfig);
    });

    it('should merge user config with defaults', () => {
      const userConfig: Partial<QuizGenerationConfig> = {
        multipleChoiceCount: 5,
        includeHints: false
      };

      const config = mergeAndValidateConfig(userConfig);
      expect(config.multipleChoiceCount).toBe(5);
      expect(config.includeHints).toBe(false);
      expect(config.codingQuestionCount).toBe(defaultQuizConfig.codingQuestionCount);
    });

    it('should throw error for invalid merged config', () => {
      const userConfig: Partial<QuizGenerationConfig> = {
        multipleChoiceCount: -1
      };

      expect(() => mergeAndValidateConfig(userConfig)).toThrow('Invalid configuration values');
    });

    it('should handle type conversion for numeric values', () => {
      const userConfig = {
        multipleChoiceCount: '5',
        codingQuestionCount: '2',
        maxAttempts: '3'
      } as any;

      const config = mergeAndValidateConfig(userConfig);
      expect(config.multipleChoiceCount).toBe(5);
      expect(config.codingQuestionCount).toBe(2);
      expect(config.maxAttempts).toBe(3);
    });
  });
}); 