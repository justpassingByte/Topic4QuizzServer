export interface ResearchTemplate {
  base: string;
  formatInstructions: string;
  subtopicInstructions?: string;
}

export const RESEARCH_AGENT_TEMPLATE: ResearchTemplate = {
  base: `Research:`,

  subtopicInstructions: `Focus on relation to main topic, key definitions, and connections.`,

  formatInstructions: `{
  "mainContent": "Brief topic summary",
  "concepts": [
    {"name": "concept", "description": "brief description"}
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
  
  let prompt = `${template.base} ${topic}`;
  
  // Add main topic context for subtopics
  if (isSubtopic && focus.length > 0) {
    prompt += ` as subtopic of ${focus[0]}`;
    
    // Add subtopic instructions
    if (template.subtopicInstructions) {
      prompt += `\n${template.subtopicInstructions}`;
    }
  }
  
  // Add focus areas if not a subtopic
  if (!isSubtopic && focus.length > 0) {
    prompt += `\nFocus: ${focus.join(', ')}`;
  }
  
  // Add format instructions
  prompt += `\n\nJSON format:\n${template.formatInstructions}`;
  
  return prompt;
}

export const RESEARCH_AGENT_PROMPT = buildDynamicResearchPrompt(RESEARCH_AGENT_TEMPLATE, {
  topic: "Programming Concepts"
}); 