/**
 * Enhanced JSON parser that attempts to fix common LLM output issues
 */
export function parseJSON<T>(jsonString: string): T | null {
  if (!jsonString) return null;

  try {
    // First attempt: Try direct parsing
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.log('JSON parsing error details:', error);
    
    try {
      // Fix common LLM JSON errors
      let fixedJson = jsonString.trim();
      
      // Remove markdown code block markers
      fixedJson = fixedJson.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Fix trailing commas
      fixedJson = fixedJson.replace(/,\s*}/g, '}');
      fixedJson = fixedJson.replace(/,\s*]/g, ']');
      
      // Fix double commas
      fixedJson = fixedJson.replace(/,,/g, ',');
      
      // Fix Mixtral specific errors - double commas before brackets
      fixedJson = fixedJson.replace(/\],\s*,/g, '],');
      fixedJson = fixedJson.replace(/\},\s*,/g, '},');
      
      // Fix missing quotes in property names
      fixedJson = fixedJson.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
      
      // Fix Mixtral specific error with wrong quotes in property names
      fixedJson = fixedJson.replace(/"(\w+)":\s*"/g, '"$1":"');
      
      // Fix key-value pairs without proper quotes
      fixedJson = fixedJson.replace(/(\w+):/g, '"$1":');
      
      // Fix comma patterns that are common in Mixtral outputs
      fixedJson = fixedJson.replace(/\}\s*,\s*\]/g, '}]');
      fixedJson = fixedJson.replace(/",\s*,\s*"/g, '","');
      
      // Fix keys and values with spaces
      fixedJson = fixedJson.replace(/"([^"]+)"\s*:\s*"([^"]+)"\s*,/g, '"$1":"$2",');
      
      // Fix errors in strings with quotes
      fixedJson = fixedJson.replace(/"""([^"]+)"""/g, '"$1"');
      fixedJson = fixedJson.replace(/"([^"]+)""([^"]+)"/g, '"$1\'$2"');
      
      // Fix quotes - change single quotes to double quotes
      if (fixedJson.includes("'") && !fixedJson.includes('"')) {
        fixedJson = fixedJson.replace(/'/g, '"');
      }
      
      // Handle unbalanced brackets (a more aggressive fix)
      const openBraces = (fixedJson.match(/{/g) || []).length;
      const closedBraces = (fixedJson.match(/}/g) || []).length;
      if (openBraces > closedBraces) {
        fixedJson += '}'.repeat(openBraces - closedBraces);
      } else if (closedBraces > openBraces) {
        fixedJson = '{'.repeat(closedBraces - openBraces) + fixedJson;
      }
      
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closedBrackets = (fixedJson.match(/\]/g) || []).length;
      if (openBrackets > closedBrackets) {
        fixedJson += ']'.repeat(openBrackets - closedBrackets);
      } else if (closedBrackets > openBrackets) {
        fixedJson = '['.repeat(closedBrackets - openBrackets) + fixedJson;
      }
      
      console.log('Attempting to parse fixed JSON:', fixedJson.substring(0, 500) + (fixedJson.length > 500 ? '...' : ''));
      return JSON.parse(fixedJson) as T;
    } catch (finalError) {
      console.error('Failed to parse JSON after fixing:', finalError);
      return null;
    }
  }
}

/**
 * Creates a fallback object based on the content type
 */
function createFallbackObject(content: string): any {
  // Try to determine what kind of object we're dealing with
  if (content.includes('"keyConcepts"')) {
    return {
      keyConcepts: [{
        concept: "Extracted from incomplete JSON",
        description: "The original JSON was incomplete and could not be parsed.",
        relationships: [],
        prerequisites: []
      }],
      suggestedTopics: [],
      difficulty: "intermediate",
      estimatedTime: 30
    };
  } else if (content.includes('"questions"')) {
    return {
      questions: [{
        type: "multipleChoice",
        difficulty: "basic",
        question: "What is the main topic being discussed?",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: 0,
        explanation: "This is a placeholder question due to JSON parsing error."
      }]
    };
  } else {
    return { error: "JSON parsing failed", content: content.substring(0, 100) };
  }
} 