const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { query, deepSearch, priceLimit, model } = body;
    if (!query) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Query missing' }) };
    }

    // Estimate token usage. Roughly 1 token per 4 characters.
    const tokenCount = Math.ceil(query.length / 4);
    // Add extra tokens if deep search mode is enabled.
    const extraTokens = deepSearch ? 50 : 0;
    const totalTokens = tokenCount + extraTokens;

    // Calculate estimated cost (example: $0.00006 per token)
    const estimatedCost = totalTokens * 0.00006;

    // Check if the estimated cost exceeds the price limit set by the user.
    if (estimatedCost > priceLimit) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ 
          error: `Estimated cost $${estimatedCost.toFixed(2)} exceeds your set price limit of $${priceLimit.toFixed(2)}. Please adjust your query or price limit.` 
        }) 
      };
    }

    // Use the selected model or default to GPT-4 if none is provided.
    const selectedModel = model || 'gpt-4';

    // Call the OpenAI API (ensure OPENAI_API_KEY is set in Netlify Environment Variables)
    const openai_api_key = process.env.OPENAI_API_KEY;
    if (!openai_api_key) {
      return { statusCode: 500, body: JSON.stringify({ error: 'OpenAI API key not configured' }) };
    }

    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openai_api_key}`
      },
      body: JSON.stringify({
        model: selectedModel,
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

    // Simulate charging the credit card by logging the transaction.
    const chargeInfo = `Charged $${estimatedCost.toFixed(2)} for ${totalTokens} tokens.`;
    const logPath = path.join('/tmp', 'charges.log');
    const logEntry = `${new Date().toISOString()} - Query: "${query}" - Tokens: ${totalTokens} - Cost: $${estimatedCost.toFixed(2)}\n`;
    fs.appendFileSync(logPath, logEntry);

    return { statusCode: 200, body: JSON.stringify({ response: chatResponse, chargeInfo }) };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
