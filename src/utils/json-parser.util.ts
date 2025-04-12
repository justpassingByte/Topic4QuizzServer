/**
 * Enhanced JSON parser that attempts to fix common LLM output issues
 */
export function parseJSON<T>(jsonString: string): T | null {
  if (!jsonString) return null;

  console.log('=== JSON PARSING DEBUG ===');
  console.log('Input string:', jsonString);
  console.log('String length:', jsonString.length);
  
  try {
    // First: Try to extract JSON from code blocks if present
    const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)```/);
    let cleanedJson = codeBlockMatch ? codeBlockMatch[1].trim() : jsonString.trim();
    
    // If response is from Hugging Face, extract the generated_text
    if (cleanedJson.includes('"generated_text"')) {
      try {
        const parsed = JSON.parse(cleanedJson);
        if (Array.isArray(parsed) && parsed[0]?.generated_text) {
          cleanedJson = parsed[0].generated_text.trim();
        } else if (parsed.generated_text) {
          cleanedJson = parsed.generated_text.trim();
        }
        // Try to extract from code blocks again
        const innerCodeBlock = cleanedJson.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (innerCodeBlock) {
          cleanedJson = innerCodeBlock[1].trim();
        }
        
        // Try to find JSON object in the cleaned text
        const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedJson = jsonMatch[0];
        }
      } catch (e) {
        console.error('Error parsing Hugging Face response:', e);
      }
    }

    console.log('Cleaned JSON to parse:', cleanedJson);

    // First attempt: direct parse
    const parsed = JSON.parse(cleanedJson) as T;
    console.log('Successfully parsed JSON structure:', 
      typeof parsed === 'object' ? Object.keys(parsed as object) : typeof parsed);
    return parsed;
  } catch (error) {
    console.error('Initial parse error:', error);
    
    try {
      // Second attempt: Try to fix common JSON issues
      let fixedJson = jsonString
        .replace(/```(?:json)?\s*/g, '')  // Remove all code block markers
        .replace(/```\s*/g, '')
        .trim()
        .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')  // Quote unquoted keys
        .replace(/\n/g, ' ');  // Remove newlines
      
      // Try to extract complete JSON object
      const completeObject = fixedJson.match(/\{[\s\S]*\}/);
      if (completeObject) {
        fixedJson = completeObject[0];
      }
      
      console.log('After fixing common issues:', fixedJson);
      
      const parsed = JSON.parse(fixedJson) as T;
      console.log('Parsed after fixes:', 
        typeof parsed === 'object' ? Object.keys(parsed as object) : typeof parsed);
      return parsed;
    } catch (secondError) {
      console.error('Second parse attempt failed:', secondError);
      
      // If all else fails, try to create a valid object from the content
      return createFallbackObject(jsonString) as T;
    }
  }
}

/**
 * Extract concepts from malformed JSON
 */
function extractConcepts(content: string): any[] {
  try {
    // Try to extract the keyConcepts array directly
    const keyConceptsMatch = content.match(/"keyConcepts"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*")/);
    if (keyConceptsMatch) {
      const conceptsJson = keyConceptsMatch[1];
      try {
        return JSON.parse(conceptsJson);
      } catch (e) {
        console.log('Failed to parse keyConcepts JSON:', e);
      }
    }

    // Fallback to regex matching if direct extraction fails
    const concepts = [];
    const conceptMatches = content.match(/{[^}]*"name"\s*:\s*"([^"]+)"[^}]*"description"\s*:\s*"([^"]+)"[^}]*}/g);
    
    if (conceptMatches) {
      for (const match of conceptMatches) {
        const concept: any = {};
        
        // Extract name
        const nameMatch = match.match(/"name"\s*:\s*"([^"]+)"/);
        if (nameMatch) concept.name = nameMatch[1];
        
        // Extract description
        const descMatch = match.match(/"description"\s*:\s*"([^"]+)"/);
        if (descMatch) concept.description = descMatch[1];
        
        // Extract relationships
        const relMatch = match.match(/"relationships"\s*:\s*(\[[^\]]*\])/);
        if (relMatch) {
          try {
            concept.relationships = JSON.parse(relMatch[1]);
          } catch (e) {
            concept.relationships = [];
          }
        } else {
          concept.relationships = [];
        }
        
        // Extract prerequisites
        const preMatch = match.match(/"prerequisites"\s*:\s*(\[[^\]]*\])/);
        if (preMatch) {
          try {
            concept.prerequisites = JSON.parse(preMatch[1]);
          } catch (e) {
            concept.prerequisites = [];
          }
        } else {
          concept.prerequisites = [];
        }
        
        if (concept.name && concept.description) {
          concepts.push(concept);
        }
      }
    }
    
    return concepts;
  } catch (error) {
    console.error('Error extracting concepts:', error);
    return [];
  }
}

/**
 * Extract suggested topics from malformed JSON
 */
function extractSuggestedTopics(content: string): string[] {
  try {
    // Try to extract the suggestedTopics array directly
    const topicsMatch = content.match(/"suggestedTopics"\s*:\s*(\[[^\]]*\])/);
    if (topicsMatch) {
      try {
        return JSON.parse(topicsMatch[1]);
      } catch (e) {
        console.log('Failed to parse suggestedTopics JSON:', e);
      }
    }

    // Fallback to simpler regex if JSON parse fails
    const match = content.match(/"suggestedTopics"\s*:\s*\[(.*?)\]/);
    if (match) {
      return match[1]
        .split(',')
        .map(topic => topic.trim().replace(/"/g, ''))
        .filter(topic => topic.length > 0);
    }
    return [];
  } catch (error) {
    console.error('Error extracting suggested topics:', error);
    return [];
  }
}

/**
 * Extract key areas from malformed JSON
 */
function extractKeyAreas(content: string): string[] {
  try {
    const areasMatch = content.match(/"keyAreas"\s*:\s*(\[[^\]]*\])/);
    if (areasMatch) {
      try {
        return JSON.parse(areasMatch[1]);
      } catch (e) {
        console.log('Failed to parse keyAreas JSON:', e);
      }
    }
    return [];
  } catch (error) {
    console.error('Error extracting key areas:', error);
    return [];
  }
}

/**
 * Creates a fallback object based on the content type
 */
function createFallbackObject(content: string): any {
  // Try to extract any valid JSON objects first
  const jsonMatches = content.match(/\{[^{}]*\}/g);
  if (jsonMatches) {
    for (const match of jsonMatches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (e) {
        // Continue to next match
      }
    }
  }

  // Handle specific object types
  if (content.includes('"keyConcepts"') || content.includes('"concepts"')) {
    const concepts = extractConcepts(content);
    const suggestedTopics = extractSuggestedTopics(content);
    const keyAreas = extractKeyAreas(content);
    const difficulty = extractDifficulty(content);
    const estimatedTime = extractEstimatedTime(content);

    return {
      keyConcepts: concepts.length > 0 ? concepts : ['Main concept'],
      suggestedTopics: suggestedTopics.length > 0 ? suggestedTopics : ['Topic 1', 'Topic 2'],
      difficulty: difficulty,
      estimatedTime: estimatedTime,
      keyAreas: keyAreas.length > 0 ? keyAreas : ['Key area 1'],
      status: 'fallback',
      error: 'Parsed with fallback logic'
    };
  } else if (content.includes('"questions"') || content.includes('"quiz"')) {
    const difficulty = extractDifficulty(content);
    return {
      questions: [{
        id: '1',
        type: 'multipleChoice',
        difficulty: difficulty || 'intermediate',
        text: 'What is the main concept being tested?',
        choices: [
          { id: 'a', text: 'First concept' },
          { id: 'b', text: 'Second concept' },
          { id: 'c', text: 'Third concept' },
          { id: 'd', text: 'Fourth concept' }
        ],
        correctAnswer: 'a',
        explanation: 'This is a fallback question due to JSON parsing error. Please regenerate the quiz.',
        topics: ['fallback'],
        metadata: {
          source: 'fallback',
          confidence: 0
        }
      }],
      metadata: {
        status: 'fallback',
        error: 'Generated using fallback logic',
        originalContent: content.substring(0, 200)
      }
    };
  } else if (content.includes('"prompt"') || content.includes('"template"')) {
    return {
      prompt: extractPromptTemplate(content) || 'Default prompt template',
      parameters: {},
      metadata: {
        status: 'fallback',
        error: 'Generated using fallback logic'
      }
    };
  } else {
    // Try to determine if it's an array
    if (content.trim().startsWith('[') && content.trim().endsWith(']')) {
      try {
        const cleanContent = content
          .replace(/,\s*]/g, ']') // Remove trailing commas
          .replace(/,\s*,/g, ',') // Remove double commas
          .replace(/\[\s*,/g, '[') // Remove leading comma in array
          .replace(/\s+/g, ' '); // Normalize whitespace
        
        const parsed = JSON.parse(cleanContent);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        // Fall through to default
      }
    }

    // Default fallback for unknown content
    return {
      error: 'JSON parsing failed',
      status: 'error',
      content: content.substring(0, 200),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Extract prompt template from malformed JSON
 */
function extractPromptTemplate(content: string): string | null {
  try {
    const promptMatch = content.match(/"(?:prompt|template)"\s*:\s*"([^"]+)"/);
    return promptMatch ? promptMatch[1] : null;
  } catch (error) {
    console.error('Error extracting prompt template:', error);
    return null;
  }
}

/**
 * Extract difficulty from malformed JSON
 */
import { Difficulty } from '../models/quiz.model';

function extractDifficulty(content: string): Difficulty {
  const difficultyMatch = content.match(/difficulty["\s:]+(\w+)/i);
  const extractedDifficulty = difficultyMatch?.[1]?.toLowerCase();
  
  if (extractedDifficulty === 'basic' || 
      extractedDifficulty === 'intermediate' || 
      extractedDifficulty === 'advanced') {
    return extractedDifficulty;
  }
  
  return 'intermediate';
}

/**
 * Extract estimated time from malformed JSON
 */
function extractEstimatedTime(content: string): number {
  try {
    const match = content.match(/"estimatedTime"\s*:\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 30;
  } catch (error) {
    console.error('Error extracting estimated time:', error);
    return 30;
  }
} 