import { QuizGenerationConfig } from '../models/quiz.model';

// Default configuration with fixed counts - total 10 questions
export const defaultQuizConfig: QuizGenerationConfig = {
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

// Configuration presets for different levels with fixed counts
export const difficultyPresets: Record<string, QuizGenerationConfig> = {
  beginner: {
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
  },
  intermediate: {
    multipleChoiceCount: 7,
    codingQuestionCount: 3,
    difficultyDistribution: {
      basic: 5,
      intermediate: 3,
      advanced: 2
    },
    typeDistribution: {
      multipleChoice: 7,
      coding: 3
    },
    includeHints: true,
    maxAttempts: 2
  },
  advanced: {
    multipleChoiceCount: 7,
    codingQuestionCount: 3,
    difficultyDistribution: {
      basic: 3,
      intermediate: 4,
      advanced: 3
    },
    typeDistribution: {
      multipleChoice: 7,
      coding: 3
    },
    includeHints: false,
    maxAttempts: 2
  }
};

// Validation function for quiz configuration
export const validateQuizConfig = (config: Partial<QuizGenerationConfig>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Helper function to validate positive integers
  const isPositiveInteger = (value: number): boolean => {
    return Number.isInteger(value) && value > 0;
  };

  // Get total questions
  const multipleChoiceCount = Math.floor(Number(config.multipleChoiceCount ?? defaultQuizConfig.multipleChoiceCount));
  const codingQuestionCount = Math.floor(Number(config.codingQuestionCount ?? defaultQuizConfig.codingQuestionCount));
  const totalQuestions = multipleChoiceCount + codingQuestionCount;

  // Basic validations
  if (!isPositiveInteger(multipleChoiceCount)) {
    errors.push('multipleChoiceCount must be a positive integer');
    return { isValid: false, errors };
  }
  if (!isPositiveInteger(codingQuestionCount)) {
    errors.push('codingQuestionCount must be a positive integer');
    return { isValid: false, errors };
  }

  // Get difficulty distribution with default values
  const diffDist = config.difficultyDistribution ?? defaultQuizConfig.difficultyDistribution;
  const basic = Math.floor(Number(diffDist.basic));
  const intermediate = Math.floor(Number(diffDist.intermediate));
  const advanced = Math.floor(Number(diffDist.advanced));
  
  // Validate difficulty distribution
  if (!isPositiveInteger(basic)) {
    errors.push('basic difficulty count must be a positive integer');
    return { isValid: false, errors };
  }
  if (!isPositiveInteger(intermediate)) {
    errors.push('intermediate difficulty count must be a positive integer');
    return { isValid: false, errors };
  }
  if (!isPositiveInteger(advanced)) {
    errors.push('advanced difficulty count must be a positive integer');
    return { isValid: false, errors };
  }
  
  const totalDifficulty = basic + intermediate + advanced;
  if (totalDifficulty !== totalQuestions) {
    errors.push(`Difficulty distribution total (${totalDifficulty}) must match total question count (${totalQuestions})`);
    return { isValid: false, errors };
  }

  // Validate maxAttempts
  const maxAttempts = Math.floor(Number(config.maxAttempts ?? defaultQuizConfig.maxAttempts));
  if (!isPositiveInteger(maxAttempts)) {
    errors.push('maxAttempts must be a positive integer');
    return { isValid: false, errors };
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Function to merge user config with defaults and validate
export const mergeAndValidateConfig = (userConfig: Partial<QuizGenerationConfig> = {}): QuizGenerationConfig => {
  // If only topic is provided, use default config as is
  if (Object.keys(userConfig).length === 0) {
    return defaultQuizConfig;
  }

  // Get values from userConfig or use defaults and ensure they are integers
  const multipleChoiceCount = Math.floor(Number(userConfig.multipleChoiceCount ?? defaultQuizConfig.multipleChoiceCount));
  const codingQuestionCount = Math.floor(Number(userConfig.codingQuestionCount ?? defaultQuizConfig.codingQuestionCount));

  // Create merged config with explicit number conversions
  const mergedConfig: QuizGenerationConfig = {
    multipleChoiceCount,
    codingQuestionCount,
    difficultyDistribution: {
      basic: 7,
      intermediate: 2,
      advanced: 1
    },
    typeDistribution: {
      multipleChoice: multipleChoiceCount,
      coding: codingQuestionCount
    },
    includeHints: Boolean(userConfig.includeHints ?? defaultQuizConfig.includeHints),
    maxAttempts: Math.floor(Number(userConfig.maxAttempts ?? defaultQuizConfig.maxAttempts))
  };

  // Validate the merged config
  const validation = validateQuizConfig(mergedConfig);
  if (!validation.isValid) {
    throw new Error(`Invalid configuration values: ${validation.errors.join(', ')}`);
  }

  return mergedConfig;
};

// Helper function to ensure numbers are positive integers
export const sanitizeNumber = (value: number): number => {
  return Math.max(1, Math.round(value));
};

// Function to sanitize configuration values
export const sanitizeConfig = (config: Partial<QuizGenerationConfig>): Partial<QuizGenerationConfig> => {
  const sanitized: Partial<QuizGenerationConfig> = { ...config };

  if (config.multipleChoiceCount !== undefined) {
    sanitized.multipleChoiceCount = sanitizeNumber(config.multipleChoiceCount);
  }
  if (config.codingQuestionCount !== undefined) {
    sanitized.codingQuestionCount = sanitizeNumber(config.codingQuestionCount);
  }
  if (config.maxAttempts !== undefined) {
    sanitized.maxAttempts = sanitizeNumber(config.maxAttempts);
  }

  if (config.difficultyDistribution) {
    sanitized.difficultyDistribution = {
      basic: sanitizeNumber(config.difficultyDistribution.basic),
      intermediate: sanitizeNumber(config.difficultyDistribution.intermediate),
      advanced: sanitizeNumber(config.difficultyDistribution.advanced)
    };
  }

  return sanitized;
};

// Get quiz config for different levels
export const getQuizConfigForLevel = (level: 'beginner' | 'intermediate' | 'advanced'): QuizGenerationConfig => {
  return difficultyPresets[level];
};

// Helper function to adjust difficulty based on performance
export function adjustDifficultyBasedOnScore(
  config: QuizGenerationConfig,
  score: number
): QuizGenerationConfig {
  const newConfig = { ...config };
  
  if (score < 0.4) {
    // Make easier
    newConfig.difficultyDistribution = {
      basic: Math.min(0.8, config.difficultyDistribution.basic + 0.2),
      intermediate: Math.max(0.2, config.difficultyDistribution.intermediate - 0.1),
      advanced: Math.max(0, config.difficultyDistribution.advanced - 0.1)
    };
  } else if (score > 0.8) {
    // Make harder
    newConfig.difficultyDistribution = {
      basic: Math.max(0, config.difficultyDistribution.basic - 0.2),
      intermediate: Math.min(0.6, config.difficultyDistribution.intermediate + 0.1),
      advanced: Math.min(0.4, config.difficultyDistribution.advanced + 0.1)
    };
  }

  return newConfig;
} 