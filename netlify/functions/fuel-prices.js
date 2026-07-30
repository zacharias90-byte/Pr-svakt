const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
  try {
    // Read prices-override.json from repo root
    const pricesPath = path.join(__dirname, '../../prices-override.json');
    const pricesData = fs.readFileSync(pricesPath, 'utf-8');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600'
      },
      body: pricesData
    };
  } catch (error) {
    console.error('Error reading prices:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to read prices' })
    };
  }
};
