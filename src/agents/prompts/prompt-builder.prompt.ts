export interface PromptTemplate {
  base: string;
  examples: string[];
  formatInstructions: string;
  adaptiveSections: {
    [key: string]: {
      content: string;
      weight: number;
      isOptional?: boolean;
    };
  };
}

export const PROMPT_BUILDER_TEMPLATE: PromptTemplate = {
  base: `You are an expert prompt engineer specializing in creating optimized prompts for quiz generation.
Your task is to create a structured prompt that will guide the Quiz Generator in creating high-quality programming questions.`,

  examples: [
    `Example Prompt Structure:
Topic: React Hooks
Focus: Understanding and practical implementation
Difficulty Range: Basic to Advanced
Question Types: Multiple choice and coding challenges
Key Areas to Cover:
- Core concepts and principles
- Common use cases and patterns
- Best practices and pitfalls
- Real-world applications`,
  ],

  formatInstructions: `The output must be a valid JSON object with the following structure:
{
  "prompt": string,
  "metadata": {
    "topicComplexity": "basic" | "intermediate" | "advanced",
    "estimatedQuestionCount": number,
    "suggestedTimeLimit": number,
    "promptVersion": number,
    "adaptations": [
      {
        "type": string,
        "reason": string,
        "impact": number
      }
    ]
  }
}`,

  adaptiveSections: {
    contextAnalysis: {
      content: `Consider the following context analysis when building the prompt:
- Topic complexity and prerequisites
- Learning objectives and outcomes
- Target audience skill level
- Common misconceptions and challenges`,
      weight: 1
    },
    questionGuidelines: {
      content: `Include specific guidelines for:
- Question clarity and precision
- Technical accuracy requirements
- Code example formatting
- Explanation depth and structure`,
      weight: 1
    },
    difficultyBalance: {
      content: `Ensure balanced difficulty distribution:
- Clear progression from basic to advanced
- Appropriate complexity for each level
- Challenging yet achievable questions`,
      weight: 0.8
    },
    realWorldRelevance: {
      content: `Emphasize practical applications:
- Industry best practices
- Common development scenarios
- Real-world problem-solving`,
      weight: 0.7,
      isOptional: true
    }
  }
};

export function buildDynamicPrompt(
  template: PromptTemplate,
  config: {
    focusAreas?: string[];
    tone?: 'formal' | 'casual';
    detail?: 'concise' | 'detailed';
    includeExamples?: boolean;
  } = {}
): string {
  const {
    focusAreas = [],
    tone = 'formal',
    detail = 'detailed',
    includeExamples = true
  } = config;

  let prompt = template.base;

  // Add tone and detail modifiers
  prompt += `\n\nTone: ${tone === 'formal' ? 
    'Maintain a professional and technical tone.' : 
    'Use a more conversational and approachable tone.'}`;

  prompt += `\nDetail Level: ${detail === 'detailed' ? 
    'Provide comprehensive and detailed instructions.' : 
    'Keep instructions clear and concise.'}`;

  // Add focus areas if specified
  if (focusAreas.length > 0) {
    prompt += `\n\nFocus Areas:\n${focusAreas.map(area => `- ${area}`).join('\n')}`;
  }

  // Add examples if requested
  if (includeExamples) {
    prompt += `\n\nReference Examples:\n${template.examples.join('\n\n')}`;
  }

  // Add adaptive sections based on weights
  Object.entries(template.adaptiveSections)
    .sort(([, a], [, b]) => b.weight - a.weight)
    .forEach(([key, section]) => {
      if (!section.isOptional || Math.random() < section.weight) {
        prompt += `\n\n${section.content}`;
      }
    });

  // Add format instructions
  prompt += `\n\n${template.formatInstructions}`;

  return prompt;
}

export const PROMPT_BUILDER_PROMPT = buildDynamicPrompt(PROMPT_BUILDER_TEMPLATE); 