exports.handler = async (event, context) => {
  try {
    // Fetch prices from GitHub raw content
    const response = await fetch('https://raw.githubusercontent.com/zacharias90-byte/Pr-svakt/main/prices-override.json');
    
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Failed to fetch prices' })
      };
    }
    
    const pricesData = await response.text();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=600'
      },
      body: pricesData
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error' })
    };
  }
};
