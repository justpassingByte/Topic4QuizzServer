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
- Prompt history tracking and improvement

### 2. Agents
- **Context Analyzer**: Analyzes topic context and complexity
- **Research Agent**: Gathers information about topics
- **Prompt Builder**: Creates and improves optimized prompts for question generation
- **Quiz Generator**: Generates actual quiz questions
- **Quiz Evaluator**: Evaluates quiz quality and provides feedback
- **Search Analysis Agent**: Performs deep analysis of search results

### 3. Prompt Improvement System
The system includes an intelligent prompt improvement mechanism:

#### Prompt History
```typescript
interface PromptHistory {
  topic: string;
  attempts: number;
  successfulPrompts: PromptFeedback[];  // Prompts with score >= 0.7
  failedPrompts: PromptFeedback[];      // Prompts with score < 0.7
  averageScore: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PromptFeedback {
  prompt: string;
  score: number;
  timestamp: Date;
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  }
}
```

#### Improvement Mechanism
1. **Automatic Improvement**:
   - Prompts are evaluated after each quiz generation
   - Successful prompts (score >= 0.7) are stored for future reference
   - Failed prompts are analyzed to avoid similar patterns

2. **Learning from Success**:
   - System learns from successful prompt patterns
   - High-performing prompts influence future generations
   - Maintains a database of effective prompts per topic

3. **Learning from Failure**:
   - Failed prompts are analyzed for improvement
   - System adapts based on evaluation feedback
   - Continuous refinement of prompt strategies

4. **Metrics Tracking**:
   - Average success rate per topic
   - Prompt effectiveness over time
   - Topic-specific performance metrics

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

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### Health Check
```http
GET /health
```
Returns the system health status and version.

Response:
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

#### Quiz Management

1. **Create Quiz**
```http
POST /create
```
Create a new quiz with specified topic and configuration.

Request body:
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

2. **Get All Quizzes**
```http
GET /quizzes
```
Returns a list of all available quizzes.

3. **Get Quiz by ID**
```http
GET /quizzes/:id
```
Returns details of a specific quiz.

4. **Get Quizzes by Topic**
```http
GET /quizzes/topic/:topic
```
Returns all quizzes related to a specific topic.

5. **Get Quizzes by Subtopic**
```http
GET /quizzes/subtopic/:subtopic
```
Returns all quizzes related to a specific subtopic.

6. **Evaluate Quiz**
```http
POST /quizzes/evaluate
```
Evaluate an existing quiz.

Request body:
```json
{
  "quizId": "quiz-123",
  "topic": "JavaScript Promises"
}
```

#### User Management & Personalization

1. **Create User**
```http
POST /users
```
Create a new user with personalized preferences.

Request body:
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "favoriteTopics": ["JavaScript", "Python", "Data Science"]
}
```

2. **Get User by ID**
```http
GET /users/:id
```
Returns details of a specific user.

3. **Update User Favorite Topics**
```http
PUT /users/:id/topics
```
Update a user's favorite topics.

Request body:
```json
{
  "topics": ["JavaScript", "Machine Learning", "React"],
  "action": "add" // or "remove" or omit for complete replacement
}
```

4. **Get Personalized Quizzes**
```http
GET /users/:id/quizzes
```
Returns quizzes that match the user's favorite topics.

5. **Save Quiz Result**
```http
POST /users/quiz-results
```
Save a user's quiz result for personalization.

Request body:
```json
{
  "userId": "user-123",
  "quizId": "quiz-456",
  "topic": "JavaScript Promises",
  "score": 0.85,
  "correctAnswers": 8,
  "totalQuestions": 10,
  "difficultyBreakdown": {
    "basic": {
      "correct": 4,
      "total": 5
    },
    "intermediate": {
      "correct": 3,
      "total": 3
    },
    "advanced": {
      "correct": 1,
      "total": 2
    }
  }
}
```

6. **Get User Statistics**
```http
GET /users/:id/statistics
```
Returns comprehensive learning statistics for a user.

Response example:
```json
{
  "totalQuizzesCompleted": 15,
  "averageScore": 0.82,
  "topicPerformance": {
    "JavaScript": {
      "completed": 8,
      "averageScore": 0.85,
      "strengths": ["High proficiency"],
      "weaknesses": []
    },
    "Python": {
      "completed": 4,
      "averageScore": 0.55,
      "strengths": [],
      "weaknesses": ["Needs improvement"]
    }
  },
  "recommendedDifficulty": "advanced",
  "quizzesCompletedOverTime": [
    {
      "date": "2023-09-01",
      "count": 2
    },
    {
      "date": "2023-09-02",
      "count": 3
    }
  ],
  "lastActive": "2023-09-02T15:30:45.123Z"
}
```

7. **Get Topic Recommendations**
```http
GET /users/:id/recommendations
```
Returns topic recommendations based on user's favorites and activity.

### Using the API

```javascript
const API_BASE_URL = 'http://localhost:3000/api';

// Create a new quiz
async function createQuiz(topic, config) {
  const response = await fetch(`${API_BASE_URL}/quizzes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ topic, config })
  });
  return await response.json();
}

// Get all quizzes
async function getAllQuizzes() {
  const response = await fetch(`${API_BASE_URL}/quizzes`);
  return await response.json();
}

// Get personalized quizzes for a user
async function getPersonalizedQuizzes(userId) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/quizzes`);
  return await response.json();
}

// Save quiz result
async function saveQuizResult(result) {
  const response = await fetch(`${API_BASE_URL}/users/quiz-results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(result)
  });
  return await response.json();
}

// Get user statistics
async function getUserStatistics(userId) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/statistics`);
  return await response.json();
}

// Example usage
async function example() {
  try {
    // Get personalized quizzes
    const personalizedQuizzes = await getPersonalizedQuizzes('user-123');
    console.log('Personalized quizzes:', personalizedQuizzes);

    // Save quiz result
    const result = await saveQuizResult({
      userId: 'user-123',
      quizId: 'quiz-456',
      topic: 'JavaScript Promises',
      score: 0.85,
      correctAnswers: 8,
      totalQuestions: 10,
      difficultyBreakdown: {
        basic: { correct: 4, total: 5 },
        intermediate: { correct: 3, total: 3 },
        advanced: { correct: 1, total: 2 }
      }
    });
    console.log('Saved quiz result:', result);
    
    // Get user statistics
    const statistics = await getUserStatistics('user-123');
    console.log('User statistics:', statistics);
  } catch (error) {
    console.error('Error:', error);
  }
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

## Personalization Features

### 1. Topic-Based Personalization
- **Favorite Topics Selection**: During registration/setup, users select topics they're interested in (AI, Programming, Math, etc.).
- **User Profile Storage**: These topics are saved in MongoDB per user.
- **Personalized Quiz Display**: When a user logs in, only quizzes related to their chosen topics are displayed.
- **Related Topic Suggestions**: After creating a quiz, the system suggests similar topics based on the quiz content.

### 2. Difficulty-Based Personalization
- **Quiz Result Tracking**: Records correct/incorrect answers and their difficulty levels (basic/intermediate/advanced) after each quiz completion.
- **Performance Analysis**: If a user scores >80%, suggests harder quizzes next time; if lower, suggests easier ones.
- **Non-Restrictive**: Users can still choose any difficulty when creating quizzes; personalization only applies to quiz recommendations.

### 3. Learning Statistics
- **Personal Stats Dashboard**: Shows:
  - Total quizzes completed
  - Average correct answer percentage
  - Strengths/weaknesses by topic
- **Learning Insights**: Helps users understand where they need improvement, increasing engagement and retention.

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
- Implements prompt versioning for tracking improvements
- Uses machine learning to identify successful prompt patterns
- Maintains separate prompt histories for different difficulty levels
- Implemented personalization features for users
- Added user statistics and performance tracking
- Created topic recommendation system based on user preferences
- Developed adaptive difficulty recommendations based on user performance

## Recent Improvements

- Added prompt improvement system with historical tracking
- Enhanced prompt evaluation metrics
- Implemented automatic prompt optimization
- Added support for topic-specific prompt patterns
- Enhanced error handling and null checks for improved reliability
- Optimized quiz storage with updatedAt timestamps and evaluation metrics
- Improved content extraction for better analysis results
- Added support for finding quizzes by topics and subtopics
- Implemented personalization features for users
- Added user statistics and performance tracking
- Created topic recommendation system based on user preferences
- Developed adaptive difficulty recommendations based on user performance

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# API Keys


OPENAI_API_KEY=your-openai-key
HUGGINGFACE_API_KEY=your-huggingface-key
SERPER_API_KEY=your-serper-key

# MongoDB Configuration
MONGODB_URI=your-mongodb-connection-string

# Server Configuration
PORT=3000

# Rate Limiting
RATE_LIMIT_WINDOW=60000  # 1 minute in milliseconds
MAX_REQUESTS_PER_WINDOW=50
```

### Quick Start
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your API keys and configuration

3. Never commit your `.env` file to version control

For security, always use environment variables for sensitive data and API keys.

## Contributing

Please read our contributing guidelines before submitting pull requests.



## Quiz Evaluation and Learning Statistics

The system now includes comprehensive quiz evaluation, feedback, and learning statistics features to ensure quiz quality and help users track their progress.

### Learning Statistics

The learning statistics dashboard provides users with a comprehensive view of their learning progress:

- **Overview Statistics:**
  - Total quizzes completed
  - Average score across all quizzes
  - Recent activity timeline

- **Topic-based Analysis:**
  - Performance broken down by topic
  - Strengths and weaknesses identification
  - Recommended topics for further study

- **Personalized Recommendations:**
  - Difficulty recommendations based on performance (users scoring >80% are recommended advanced quizzes)
  - Topic recommendations based on interests and performance gaps

### Quiz Evaluation and Feedback

The system now allows both users and administrators to evaluate quizzes and provide detailed feedback:

- **Quiz Feedback:**
  - Overall rating (1-5 scale)
  - Content accuracy assessment
  - Question clarity rating
  - Specific feedback for individual questions
  - Suggestions for improvements

- **Admin Review:**
  - Ability to mark questions as incorrect or outdated
  - Detailed feedback with suggested changes
  - Automatic scheduling of updates for quizzes with identified issues

- **Quiz Maintenance:**
  - Question-level updates with revision tracking
  - Change history with before/after comparisons
  - Scheduled maintenance for knowledge domains that change frequently
  - Periodic review reminders (configurable timeframe)

### API Endpoints

#### Learning Statistics
- `GET /api/users/:id/statistics` - Get comprehensive learning statistics for a user
- `GET /api/users/:id/recommendations` - Get topic recommendations based on performance and interests

#### Quiz Evaluation
- `POST /api/quizzes/:quizId/feedback` - Submit feedback for a quiz
- `GET /api/quizzes/:quizId/feedback` - Get all feedback for a specific quiz
- `PUT /api/quizzes/:quizId/questions/:questionId` - Update a question based on feedback
- `GET /api/quizzes/:quizId/revisions` - Get revision history for a quiz

#### Quiz Maintenance
- `POST /api/quizzes/schedule-update` - Schedule a quiz for update
- `GET /api/quizzes/updates` - Get quizzes pending updates
- `GET /api/quizzes/review` - Get quizzes that need periodic review

Refer to the Postman collection for detailed examples of using these endpoints. 