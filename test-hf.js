require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGoogleGeminiApi() {
  console.log('--- Starting Google Gemini API Test ---');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: Could not find GOOGLE_API_KEY in your .env file.');
    console.log('--- Test Finished ---');
    return;
  }

  console.log('Found GOOGLE_API_KEY. Initializing client...');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
  const prompt = "Who are you?";

  console.log(`Sending prompt to gemini-1.5-flash-latest: "${prompt}"`);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    console.log('✅ API Call Successful!');
    console.log('Response:', text);
  } catch (error) {
    console.error('❌ API Call Failed!');
    if (error instanceof Error) {
        console.error('Error Details:', error.message);
    } else {
        console.error('Unknown error:', error);
    }
  } finally {
    console.log('--- Test Finished ---');
  }
}

testGoogleGeminiApi(); 