const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const body = JSON.parse(event.body);
    const { query, deepSearch, priceLimit } = body;
    if (!query) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Query missing' }) };
    }
    
    // Estimate token usage. Here we use ~1 token per 4 characters.
    const tokenCount = Math.ceil(query.length / 4);
    // Add extra tokens if deep search mode is enabled.
    const extraTokens = deepSearch ? 50 : 0;
    const totalTokens = tokenCount + extraTokens;
    
    // Calculate estimated cost (example: $0.00006 per token)
    const estimatedCost = totalTokens * 0.00006;
    
    // If the estimated cost exceeds the user's price limit, return an error.
    if (estimatedCost > priceLimit) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ 
          error: `Estimated cost $${estimatedCost.toFixed(2)} exceeds your set price limit of $${priceLimit.toFixed(2)}. Please adjust your query or price limit.` 
        }) 
      };
    }
    
    // Call the ChatGPT API (adjust the model as needed: 'gpt-4' or 'gpt-3.5-turbo')
    const openai_api_key = process.env.OPENAI_API_KEY;
    if(!openai_api_key) {
      return { statusCode: 500, body: JSON.stringify({ error: 'OpenAI API key not configured' }) };
    }
    
    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openai_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-4',  // or 'gpt-3.5-turbo'
        messages: [
          { role: 'system', content: deepSearch ? 'You are in deep search mode. Provide detailed responses.' : 'You are ChatGPT.' },
          { role: 'user', content: query }
        ],
        max_tokens: 500
      })
    });
    
    const apiData = await apiResponse.json();
    const chatResponse = (apiData.choices && apiData.choices[0] && apiData.choices[0].message && apiData.choices[0].message.content)
      ? apiData.choices[0].message.content
      : 'No response from API.';
    
    // Simulate charging credit card and record the transaction.
    const chargeInfo = `Charged $${estimatedCost.toFixed(2)} for ${totalTokens} tokens.`;
    // Log the transaction to a file in /tmp (note: this is ephemeral storage for demo purposes)
    const logPath = path.join('/tmp', 'charges.log');
    const logEntry = `${new Date().toISOString()} - Query: "${query}" - Tokens: ${totalTokens} - Cost: $${estimatedCost.toFixed(2)}\n`;
    fs.appendFileSync(logPath, logEntry);
    
    return { statusCode: 200, body: JSON.stringify({ response: chatResponse, chargeInfo }) };
    
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
