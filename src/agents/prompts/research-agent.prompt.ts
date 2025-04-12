export interface ResearchTemplate {
  base: string;
  formatInstructions: string;
  subtopicInstructions?: string;
}

export const RESEARCH_AGENT_TEMPLATE: ResearchTemplate = {
  base: `Based on the provided search results, analyze and summarize:`,

  subtopicInstructions: `When analyzing this subtopic:
- Extract key information from search results
- Focus on its relationship to the main topic
- Identify core concepts and definitions`,

  formatInstructions: `{
  "mainContent": "Synthesize key information from search results",
  "concepts": [
    {
      "name": "concept name",
      "description": "explanation based on search results"
    }
  ],
  "references": [
    {
      "title": "source title from search",
      "url": "source url from search"
    }
  ]
}`
};

export function buildDynamicResearchPrompt(
  template: ResearchTemplate,
  config: {
    topic: string;
    depth?: string;
    focus?: string[];
    isSubtopic?: boolean;
  }
): string {
  const { topic, depth = 'intermediate', focus = [], isSubtopic = false } = config;
  
  let prompt = `${template.base} ${topic}

Instructions:
1. Extract and summarize key information from the search results
2. Identify main concepts and their explanations
3. Use source information for references
4. Ensure JSON response is properly formatted
5. Keep explanations clear and factual`;
  
  // Add main topic context for subtopics
  if (isSubtopic && focus.length > 0) {
    prompt += `\n\nThis is a subtopic of: ${focus[0]}`;
    
    if (template.subtopicInstructions) {
      prompt += `\n${template.subtopicInstructions}`;
    }
  }
  
  // Add focus areas if not a subtopic
  if (!isSubtopic && focus.length > 0) {
    prompt += `\n\nFocus areas: ${focus.join(', ')}`;
  }
  
  // Add format instructions
  prompt += `\n\nProvide your response in this JSON format:\n${template.formatInstructions}`;
  
  return prompt;
}

export const RESEARCH_AGENT_PROMPT = buildDynamicResearchPrompt(RESEARCH_AGENT_TEMPLATE, {
  topic: "Programming Concepts"
}); 