export const CONTEXT_ANALYZER_PROMPT = `Analyze the given programming topic and provide a structured JSON response with the following information:

1. Key Concepts:
   - Up to 3 main concepts and their descriptions
   - Relationships between concepts
   - Prerequisites for understanding each concept

2. Technical Details:
   - Suggested related topics for further learning
   - Estimated time to learn this topic (in minutes)
   - Key areas of focus

Format your response as a valid JSON object with these exact keys:
{
  "keyConcepts": [
    {
      "name": "string",
      "description": "string",
      "relationships": ["string"],
      "prerequisites": ["string"]
    }
  ],
  "suggestedTopics": ["string"],
  "difficulty": "basic|intermediate|advanced",
  "estimatedTime": number,
  "keyAreas": ["string"]
}

Important Rules:
- Return **a maximum of 3 items** in "keyConcepts"
- ❌ DO NOT include markdown ,triple backticks or extra commentary.
- ❌ DO NOT include labels like "Content:"
`;
