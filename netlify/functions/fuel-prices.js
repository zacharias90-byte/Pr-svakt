exports.handler = async (event, context) => {
  // Serve prices-override.json directly from repo
  try {
    const data = {
      sources: [
        { source: "Thomsen", gassoil: "11.00", diesel: null, bensin: null, updatedAt: "28/07/2026" },
        { source: "Magn", gassoil: "11.513", diesel: "11.530", bensin: "11.350", updatedAt: "30/07/2026" },
        { source: "Effo", gassoil: "11.513", diesel: "11.53", bensin: "11.35", updatedAt: "30/07/2026" }
      ],
      updatedAt: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=600'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to load prices' })
    };
  }
};
