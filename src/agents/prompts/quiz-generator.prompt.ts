export interface QuizGeneratorTemplate {
  base: string;
  questionTypes: {
    [key: string]: {
      structure: string;
      examples: string[];
      weight: number;
    };
  };
  difficultyLevels: {
    [key: string]: {
      description: string;
      criteria: string[];
      weight: number;
    };
  };
  formatInstructions: string;
  subtopicInstructions: string;
  feedbackInstructions?: string;
}

export const QUIZ_GENERATOR_TEMPLATE: QuizGeneratorTemplate = {
  base: `Create multiple-choice quiz questions for the given main topic. Do NOT use subtopics. All questions must be directly about the main topic.`,

  questionTypes: {
    multipleChoice: {
      structure: `Multiple Choice: Question with 4 options, one correct answer.`,
      examples: [
        `Example: "Which React Hook is used for side effects?" Options: ["useState", "useEffect", "useContext", "useReducer"], Correct: 1, Explanation: "useEffect is for side effects."`
      ],
      weight: 1.0
    }
  },

  difficultyLevels: {
    basic: {
      description: "Fundamental concepts",
      criteria: [
        "Core concept understanding",
        "Simple implementations"
      ],
      weight: 0.4
    },
    intermediate: {
      description: "Applied knowledge",
      criteria: [
        "Combined concepts",
        "Multi-step solutions"
      ],
      weight: 0.4
    },
    advanced: {
      description: "Complex scenarios",
      criteria: [
        "Advanced patterns",
        "Optimization"
      ],
      weight: 0.2
    }
  },

  subtopicInstructions: '',

  feedbackInstructions: `Use the provided feedback to improve question quality. Adjust question complexity, clarity, or content based on feedback.`,

  formatInstructions: `RETURN ONLY JSON. NO TEXT BEFORE OR AFTER. Use this structure:

{
  "questions": [
    {
      "type": "multiple-choice",
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "difficulty": "basic",
      "explanation": "Why A is correct",
      "hints": []
    }
  ]
}`
};

export function buildDynamicQuizPrompt(
  template: QuizGeneratorTemplate,
  config: {
    topicSlug: string;
    questionCount?: number;
    difficultyDistribution?: {
      basic?: number;
      intermediate?: number;
      advanced?: number;
    };
    focusAreas?: string[];
    includeHints?: boolean;
    feedback?: {
      strengths?: string[];
      weaknesses?: string[];
      suggestions?: string[];
    };
  }
): string {
  const {
    topicSlug,
    questionCount = 10,
    difficultyDistribution = {
      basic: 0.4,
      intermediate: 0.4,
      advanced: 0.2
    },
    focusAreas = [],
    includeHints = true,
    feedback
  } = config;

  let prompt = template.base;

  // Add topic slug and question count
  prompt += `\n\nMain Topic: ${topicSlug}\nNumber of Questions: ${questionCount}`;

  // Add difficulty distribution
  prompt += `\n\nDifficulty Distribution: basic ${Math.round((difficultyDistribution.basic || 0.4) * 100)}%, intermediate ${Math.round((difficultyDistribution.intermediate || 0.4) * 100)}%, advanced ${Math.round((difficultyDistribution.advanced || 0.2) * 100)}%`;

  // Chỉ còn multiple-choice
  prompt += `\n\nQuestion Type: multiple-choice 100% (Question with 4 options, one correct answer)`;

  // Add focus areas if specified
  if (focusAreas.length > 0) {
    prompt += `\n\nFocus Areas: ${focusAreas.join(', ')}`;
  }

  // Include hint instruction if enabled
  if (includeHints) {
    prompt += `\n\nALWAYS include hints for multiple-choice questions if possible.`;
  }

  // Add feedback if available
  if (feedback && template.feedbackInstructions) {
    prompt += `\n\n${template.feedbackInstructions}`;
    
    if (feedback.strengths && feedback.strengths.length > 0) {
      prompt += `\n\nStrengths: ${feedback.strengths.join(', ')}`;
    }
    
    if (feedback.weaknesses && feedback.weaknesses.length > 0) {
      prompt += `\n\nWeaknesses to improve: ${feedback.weaknesses.join(', ')}`;
    }
    
    if (feedback.suggestions && feedback.suggestions.length > 0) {
      prompt += `\n\nSuggestions: ${feedback.suggestions.join(', ')}`;
    }
  }

  // Add format instructions
  prompt += `\n\n${template.formatInstructions}`;

  return prompt;
}

export const QUIZ_GENERATOR_PROMPT = buildDynamicQuizPrompt(QUIZ_GENERATOR_TEMPLATE, {
  topicSlug: "Programming Fundamentals"
}); 