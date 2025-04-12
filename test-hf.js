const fetch = require('node-fetch');

async function testHuggingFaceAccess() {
  const apiKey = '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';
  
  try {
    const response = await fetch('https://huggingface.co/api/models/mistralai/Mixtral-8x7B-Instruct-v0.1', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Access successful:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testHuggingFaceAccess(); 