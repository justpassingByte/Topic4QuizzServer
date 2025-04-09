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
  base: `Create programming quiz questions for the given topic and subtopics. Each subtopic should have a proportional number of questions.`,

  questionTypes: {
    multipleChoice: {
      structure: `Multiple Choice: Question with 4 options, one correct answer.`,
      examples: [
        `Example: "Which React Hook is used for side effects?" Options: ["useState", "useEffect", "useContext", "useReducer"], Correct: 1, Explanation: "useEffect is for side effects."`
      ],
      weight: 0.6
    },
    coding: {
      structure: `Coding Question: Problem description, template if needed, solution approach, and hints.`,
      examples: [
        `Example: "Write a useState hook function." Solution: "function useCustomState(initialValue) {...}", Hints: ["Remember to return both state and setter", "Use closure to maintain state"]`
      ],
      weight: 0.4
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

  subtopicInstructions: `IMPORTANT: Distribute questions evenly across subtopics. Tag each question with its subtopic. Ensure questions test understanding of that subtopic's concepts.`,

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
      "subtopic": "Specific subtopic name",
      "hints": []
    },
    {
      "type": "coding",
      "question": "Coding problem",
      "correctAnswer": "function solution() {}",
      "difficulty": "intermediate",
      "explanation": "Solution approach",
      "hints": ["Hint 1", "Hint 2"],
      "subtopic": "Specific subtopic name"
    }
  ]
}`
};

export function buildDynamicQuizPrompt(
  template: QuizGeneratorTemplate,
  config: {
    topic: string;
    questionCount?: number;
    difficultyDistribution?: {
      basic?: number;
      intermediate?: number;
      advanced?: number;
    };
    typeDistribution?: {
      multipleChoice?: number;
      coding?: number;
    };
    focusAreas?: string[];
    includeHints?: boolean;
    subtopics?: string[];
    feedback?: {
      strengths?: string[];
      weaknesses?: string[];
      suggestions?: string[];
    };
  }
): string {
  const {
    topic,
    questionCount = 10,
    difficultyDistribution = {
      basic: 0.4,
      intermediate: 0.4,
      advanced: 0.2
    },
    typeDistribution = {
      multipleChoice: 0.6,
      coding: 0.4
    },
    focusAreas = [],
    includeHints = true,
    subtopics = [],
    feedback
  } = config;

  let prompt = template.base;

  // Add topic and question count
  prompt += `\n\nTopic: ${topic}\nRequired Questions: ${questionCount}`;

  // Add subtopics if available
  if (subtopics.length > 0) {
    prompt += `\n\nSUBTOPICS:\n${subtopics.map((subtopic, index) => `${index + 1}. ${subtopic}`).join('\n')}`;
    prompt += `\n\n${template.subtopicInstructions}`;
  }

  // Add difficulty distribution
  prompt += `\n\nDifficulty: basic ${Math.round((difficultyDistribution.basic || 0.4) * 100)}%, intermediate ${Math.round((difficultyDistribution.intermediate || 0.4) * 100)}%, advanced ${Math.round((difficultyDistribution.advanced || 0.2) * 100)}%`;

  // Add question type distribution
  prompt += `\n\nTypes: multiple-choice ${Math.round((typeDistribution.multipleChoice || 0.6) * 100)}%, coding ${Math.round((typeDistribution.coding || 0.4) * 100)}%`;

  // Add focus areas if specified
  if (focusAreas.length > 0) {
    prompt += `\n\nFocus Areas: ${focusAreas.join(', ')}`;
  }

  // Include hint instruction if enabled
  if (includeHints) {
    prompt += `\n\nALWAYS include hints for coding questions, and optionally for multiple-choice questions.`;
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
  topic: "Programming Fundamentals"
}); 