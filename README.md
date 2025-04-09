# Quiz Generation System

## Overview
The Quiz Generation System is an intelligent system that automatically generates quizzes based on given topics. It uses a combination of research, analysis, and AI-powered generation to create high-quality, relevant questions.

## Core Components

### 1. Quiz Generation Flow
The main orchestrator that coordinates the entire quiz generation process:
- Research and analysis of topics
- Question generation
- Quiz evaluation
- Session management

### 2. Agents
- **Context Analyzer**: Analyzes topic context and complexity
- **Research Agent**: Gathers information about topics
- **Prompt Builder**: Creates optimized prompts for question generation
- **Quiz Generator**: Generates actual quiz questions
- **Quiz Evaluator**: Evaluates quiz quality and provides feedback
- **Search Analysis Agent**: Performs deep analysis of search results

## How It Works

### Step 1: Quiz Generation Request
```typescript
const config: QuizGenerationConfig = {
  multipleChoiceCount: 8,
  codingQuestionCount: 2,
  difficultyDistribution: {
    basic: 5,
    intermediate: 3,
    advanced: 2
  },
  typeDistribution: {
    multipleChoice: 8,
    coding: 2
  },
  includeHints: true,
  maxAttempts: 3
};

const quiz = await quizGenerator.generateQuiz("JavaScript Promises", config);
```

### Step 2: Research & Analysis
1. **Comprehensive Research**
   - Analyzes the main topic
   - Identifies key concepts
   - Discovers related subtopics
   - Gathers learning resources

2. **Content Analysis**
   ```typescript
   // Example analysis result
   {
     contextAnalysis: {
       keyConcepts: [
         {
           name: "Promise Basics",
           description: "Fundamental concepts of Promises in JavaScript"
         },
         // ...more concepts
       ],
       difficulty: "intermediate",
       suggestedTopics: ["Async/Await", "Error Handling"]
     }
   }
   ```

### Step 3: Question Generation
1. **Main Topic Questions (40%)**
```typescript
   // Example Multiple Choice Question
   {
     type: "multiple-choice",
     text: "What is the state of a Promise when it's first created?",
     choices: [
       { text: "Pending", isCorrect: true },
       { text: "Fulfilled", isCorrect: false },
       { text: "Rejected", isCorrect: false },
       { text: "Settled", isCorrect: false }
     ],
     difficulty: "basic"
   }
   ```

2. **Subtopic Questions (60%)**
```typescript
   // Example Coding Question
   {
     type: "coding",
     text: "Write a function that creates a Promise that resolves after a given delay",
     solution: `function delay(ms) {
       return new Promise(resolve => setTimeout(resolve, ms));
     }`,
     testCases: [
       { input: "1000", expectedOutput: "Resolved after 1 second" }
     ],
     difficulty: "intermediate"
   }
   ```

### Step 4: Quiz Evaluation
```typescript
// Example Evaluation Result
{
  quizId: "quiz-123",
  score: 0.85,
  feedback: {
    coverage: 0.9,
    difficulty: 0.8,
    uniqueness: 0.85,
    clarity: 0.9,
    practicality: 0.8,
    quality: 0.85
  },
  suggestions: [
    "Consider adding more advanced error handling scenarios",
    "Include questions about Promise.all() and Promise.race()"
  ]
}
```

## Configuration Options

### Quiz Generation Config
```typescript
interface QuizGenerationConfig {
  multipleChoiceCount: number;      // Number of multiple choice questions
  codingQuestionCount: number;      // Number of coding questions
  difficultyDistribution: {         // Distribution of difficulty levels
    basic: number;
    intermediate: number;
    advanced: number;
  };
  typeDistribution: {               // Distribution of question types
    multipleChoice: number;
    coding: number;
  };
  includeHints: boolean;            // Whether to include hints
  maxAttempts: number;             // Maximum attempts allowed per question
}
```

## API Endpoints

The system exposes the following RESTful API endpoints:

### Quiz Generation and Evaluation
- **POST /api/generate-quiz**: Generate a new quiz based on a topic and configuration
  ```json
  {
    "topic": "JavaScript Promises",
    "config": {
      "multipleChoiceCount": 8,
      "codingQuestionCount": 2,
      "difficultyDistribution": {
        "basic": 5,
        "intermediate": 3,
        "advanced": 2
      },
      "typeDistribution": {
        "multipleChoice": 8,
        "coding": 2
      },
      "includeHints": true,
      "maxAttempts": 3
    }
  }
  ```

- **POST /api/evaluate-quiz**: Evaluate an existing quiz
  ```json
  {
    "quizId": "quiz-123",
    "topic": "JavaScript Promises"
  }
  ```

### Quiz Retrieval and Management
- **GET /api/quizzes**: Get a list of all quizzes
- **GET /api/quizzes/:id**: Get details of a specific quiz by ID
- **GET /api/quizzes/topic/:topic**: Get quizzes related to a specific topic
- **GET /api/quizzes/subtopic/:subtopic**: Get quizzes related to a specific subtopic

### System Status
- **GET /api/health**: Check system health and version

## Example Usage

```typescript
// Initialize the Quiz Generation Flow
const quizFlow = new QuizGenerationFlow();

// Configure quiz parameters
const config = {
  multipleChoiceCount: 8,
  codingQuestionCount: 2,
  difficultyDistribution: {
    basic: 4,
    intermediate: 4,
    advanced: 2
  },
  typeDistribution: {
    multipleChoice: 8,
    coding: 2
  },
  includeHints: true,
  maxAttempts: 3
};

// Generate a quiz
try {
  const quiz = await quizFlow.generateQuiz("JavaScript Promises", config);
  console.log(`Generated quiz with ${quiz.questions.length} questions`);
  
  // Evaluate the quiz
  const evaluation = await quizFlow.evaluateQuiz(quiz);
  console.log(`Quiz quality score: ${evaluation.score}`);
} catch (error) {
  console.error("Error generating quiz:", error);
}
```

## Using the API

```javascript
// Generate a new quiz
async function generateQuiz() {
  const response = await fetch('http://localhost:3000/api/generate-quiz', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      topic: 'JavaScript Promises',
      config: {
        multipleChoiceCount: 8,
        codingQuestionCount: 2,
        difficultyDistribution: {
          basic: 5,
          intermediate: 3,
          advanced: 2
        }
      }
    })
  });
  
  const quiz = await response.json();
  console.log(`Generated quiz with ${quiz.questions.length} questions`);
  return quiz;
}

// Get a specific quiz
async function getQuiz(quizId) {
  const response = await fetch(`http://localhost:3000/api/quizzes/${quizId}`);
  return await response.json();
}

// Get quizzes by topic
async function getQuizzesByTopic(topic) {
  const response = await fetch(`http://localhost:3000/api/quizzes/topic/${encodeURIComponent(topic)}`);
  return await response.json();
}
```

## Best Practices

1. **Topic Selection**
   - Choose specific, well-defined topics
   - Break down broad topics into subtopics
   - Consider prerequisite knowledge

2. **Configuration**
   - Balance difficulty distribution
   - Mix question types appropriately
   - Include sufficient questions for comprehensive coverage

3. **Question Quality**
   - Ensure clear, unambiguous wording
   - Provide meaningful distractors in multiple choice
   - Include practical, real-world scenarios

4. **Evaluation**
   - Review generated questions
   - Check for topic coverage
   - Validate difficulty levels
   - Test coding questions with multiple cases

## Error Handling

The system includes robust error handling for various scenarios:
- Invalid configurations
- Research failures
- Generation errors
- Evaluation issues

Example error handling:
```typescript
try {
  const quiz = await quizFlow.generateQuiz(topic, config);
} catch (error) {
  if (error.type === "ConfigurationError") {
    console.error("Invalid configuration:", error.message);
  } else if (error.type === "ResearchError") {
    console.error("Error during research:", error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

## Performance Considerations

- Caches research results for frequently used topics
- Optimizes prompt generation based on historical performance
- Maintains session history for improved generation
- Adapts to feedback and evaluation results

## Recent Improvements

- Added support for separately evaluating existing quizzes
- Enhanced error handling and null checks for improved reliability
- Optimized quiz storage with updatedAt timestamps and evaluation metrics
- Improved content extraction for better analysis results
- Reorganized API endpoints to avoid route conflicts
- Added support for finding quizzes by topics and subtopics

## Environment Setup

To run the application, you need to set up your environment variables. Create a `.env` file in the root directory of the project.

### Required Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/ask2test
DB_NAME=ask2test

# API Keys and External Services
OPENAI_API_KEY=your_openai_api_key
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# Security
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Optional Features
ENABLE_CACHE=true
CACHE_TTL=3600
MAX_REQUESTS_PER_MINUTE=100
```

### Environment Files

The system supports different environment files for different deployment stages:
- `.env`: Default environment variables
- `.env.local`: Local development overrides (not committed to git)
- `.env.development`: Development environment settings
- `.env.production`: Production environment settings
- `.env.test`: Test environment settings

### Setting Up Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your specific configuration:
   ```bash
   # Using your default editor
   nano .env
   # Or
   code .env
   ```

3. Ensure all required variables are set:
   ```bash
   # Check if all required variables are set
   npm run check-env
   ```

### Environment Variables Description

#### Server Configuration
- `PORT`: The port number for the server (default: 3000)
- `NODE_ENV`: Current environment (development/production/test)

#### Database Configuration
- `MONGODB_URI`: MongoDB connection string
- `DB_NAME`: Database name for the application

#### API Keys
- `OPENAI_API_KEY`: OpenAI API key for AI features
- `GOOGLE_SEARCH_API_KEY`: Google API key for search functionality
- `GOOGLE_SEARCH_ENGINE_ID`: Google Custom Search Engine ID

#### Security
- `JWT_SECRET`: Secret key for JWT token generation
- `JWT_EXPIRES_IN`: JWT token expiration time

#### Optional Features
- `ENABLE_CACHE`: Enable/disable caching (true/false)
- `CACHE_TTL`: Cache time-to-live in seconds
- `MAX_REQUESTS_PER_MINUTE`: Rate limiting configuration

### Security Notes

1. Never commit your actual `.env` file to version control
2. Keep your API keys and secrets secure
3. Use different values for different environments
4. Regularly rotate your security keys
5. Use strong, unique values for security-related variables

### Troubleshooting

If you encounter environment-related issues:

1. Check if all required variables are set:
   ```bash
   npm run check-env
   ```

2. Verify the `.env` file location:
   ```bash
   ls -la .env
   ```

3. Check environment variable loading:
   ```bash
   npm run env-debug
   ```

4. Common issues:
   - Missing required variables
   - Incorrect API keys
   - Wrong database connection string
   - Permission issues with file access

## Contributing

Please read our contributing guidelines before submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 