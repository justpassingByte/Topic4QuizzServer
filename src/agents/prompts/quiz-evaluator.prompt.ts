export interface EvaluatorTemplate {
  base: string;
  evaluationCriteria: {
    [key: string]: {
      description: string;
      metrics: {
        name: string;
        weight: number;
        rubric: string[];
      }[];
    };
  };
  feedbackGuidelines: {
    structure: string;
    examples: string[];
  };
  formatInstructions: string;
}

export const QUIZ_EVALUATOR_TEMPLATE: EvaluatorTemplate = {
  base: `Evaluate the programming quiz for quality and effectiveness.`,

  evaluationCriteria: {
    technicalAccuracy: {
      description: "Technical correctness of questions and answers",
      metrics: [
        {
          name: "conceptAccuracy",
          weight: 0.4,
          rubric: [
            "Correct terminology",
            "Accurate concepts",
            "Valid code examples"
          ]
        },
        {
          name: "solutionValidity",
          weight: 0.3,
          rubric: [
            "Correct answer implementation",
            "Proper error handling"
          ]
        },
        {
          name: "explanationQuality",
          weight: 0.3,
          rubric: [
            "Clear reasoning",
            "Helpful examples"
          ]
        }
      ]
    },
    pedagogicalValue: {
      description: "Educational effectiveness",
      metrics: [
        {
          name: "difficultyAlignment",
          weight: 0.5,
          rubric: [
            "Appropriate challenge level",
            "Skill requirement match"
          ]
        },
        {
          name: "engagementValue",
          weight: 0.5,
          rubric: [
            "Real-world relevance",
            "Practical application"
          ]
        }
      ]
    },
    structuralQuality: {
      description: "Format and structure",
      metrics: [
        {
          name: "clarity",
          weight: 0.5,
          rubric: [
            "Clear question statement",
            "Unambiguous options"
          ]
        },
        {
          name: "completeness",
          weight: 0.5,
          rubric: [
            "Sufficient context",
            "Comprehensive explanations"
          ]
        }
      ]
    }
  },

  feedbackGuidelines: {
    structure: `Include: overall score, strengths, weaknesses, and improvement suggestions.`,
    examples: [
      `Example: Score: 85/100, Strengths: clear concepts, appropriate difficulty, Improvements: add real-world context, clarify wording`
    ]
  },

  formatInstructions: `RETURN ONLY JSON. NO TEXT BEFORE OR AFTER. Use this structure:

{
  "overallScore": 75,
  "feedback": {
    "strengths": ["Good technical accuracy", "Clear explanations"],
    "weaknesses": ["Limited real-world examples", "Some ambiguous options"],
    "suggestions": ["Add more practical scenarios", "Improve question wording"]
  },
  "questionEvaluations": [
    {
      "questionId": "q1",
      "score": 80,
      "issues": ["Ambiguous option B", "Missing edge case"],
      "suggestions": ["Clarify option B", "Add code example"]
    }
  ],
  "metadata": {
    "criteriaUsed": ["technicalAccuracy", "clarity"],
    "suggestedImprovements": ["Improve real-world relevance"],
    "timestamp": "2023-05-10T15:30:00Z"
  }
}`
};

// Create a simplified version for smaller models like Mistral
export const SIMPLIFIED_EVALUATOR_TEMPLATE: EvaluatorTemplate = {
  base: `Evaluate this programming quiz. Rate it on accuracy, clarity, and educational value.`,

  evaluationCriteria: {
    quality: {
      description: "Overall quality assessment",
      metrics: [
        {
          name: "accuracy",
          weight: 0.4,
          rubric: [
            "Technically correct questions and answers"
          ]
        },
        {
          name: "clarity",
          weight: 0.3,
          rubric: [
            "Clear, unambiguous questions"
          ]
        },
        {
          name: "value",
          weight: 0.3,
          rubric: [
            "Educational relevance"
          ]
        }
      ]
    }
  },

  feedbackGuidelines: {
    structure: `Provide brief feedback on strengths and what to improve.`,
    examples: [
      `Example: Score: 7/10, Good: technical accuracy, Improve: add more examples`
    ]
  },

  formatInstructions: `Return only this JSON:

{
  "overallScore": 75,
  "feedback": {
    "strengths": ["Technically accurate", "Good difficulty progression"],
    "weaknesses": ["Some unclear wording", "Limited practical examples"],
    "suggestions": ["Clarify question 2", "Add real-world context"]
  },
  "questionEvaluations": [],
  "metadata": {
    "criteriaUsed": ["accuracy", "clarity", "value"],
    "suggestedImprovements": ["Add more examples"],
    "timestamp": "2023-05-10T15:30:00Z"
  }
}`
};

export function buildDynamicEvaluatorPrompt(
  template: EvaluatorTemplate,
  config: {
    focusAreas?: string[];
    strictness?: 'lenient' | 'moderate' | 'strict';
    detailLevel?: 'basic' | 'detailed';
    customCriteria?: {
      name: string;
      weight: number;
      rubric: string[];
    }[];
    useSimplifiedTemplate?: boolean;
  } = {}
): string {
  const {
    focusAreas = [],
    strictness = 'moderate',
    detailLevel = 'detailed',
    customCriteria = [],
    useSimplifiedTemplate = false
  } = config;

  // Use simplified template for smaller models
  const selectedTemplate = useSimplifiedTemplate ? SIMPLIFIED_EVALUATOR_TEMPLATE : template;
  let prompt = selectedTemplate.base;

  // Add evaluation focus if using detailed template
  if (focusAreas.length > 0 && !useSimplifiedTemplate) {
    prompt += `\n\nFocus on: ${focusAreas.join(', ')}`;
  }

  // Add basic criteria reminders for simplified template
  if (useSimplifiedTemplate) {
    prompt += `\n\nCheck: 1) Technical accuracy, 2) Question clarity, 3) Educational value`;
    
    if (focusAreas.length > 0) {
      prompt += `\n\nPay special attention to: ${focusAreas.join(', ')}`;
    }
    
    // Add simplified strictness
    if (strictness === 'strict') {
      prompt += `\n\nBe rigorous in your evaluation.`;
    }
  } 
  // Add more detailed criteria for regular template
  else {
    // Add strictness level
    prompt += `\n\nStrictness: ${strictness.toUpperCase()} - ${
      strictness === 'strict' ? 'Apply rigorous standards.' :
      strictness === 'moderate' ? 'Balance thoroughness and practicality.' :
      'Be forgiving of minor issues.'
    }`;

    // Add a subset of evaluation criteria to keep prompt shorter
    Object.entries(selectedTemplate.evaluationCriteria)
      .slice(0, useSimplifiedTemplate ? 1 : 3)
      .forEach(([category, data]) => {
      prompt += `\n\n${category}: ${data.description}`;
    });
  }

  // Add format instructions
  prompt += `\n\n${selectedTemplate.formatInstructions}`;

  return prompt;
}

// Create a simplified default prompt
export const QUIZ_EVALUATOR_PROMPT = buildDynamicEvaluatorPrompt(QUIZ_EVALUATOR_TEMPLATE, {
  useSimplifiedTemplate: true,
  detailLevel: 'basic',
  strictness: 'moderate'
}); 