async function main() {
  console.log('Byrjar at sækja prísir...', new Date().toISOString());

  const thomsen = await scrapeThomsen();
  let magn      = await scrapeMagn();
  const effo    = await scrapeEffo();

  // Hvis Magn fejler, bevar eksisterende priser fra prices-override.json
  if (!magn.gassoil || !magn.diesel || !magn.bensin) {
    try {
      const existing = JSON.parse(fs.readFileSync('prices-override.json', 'utf8'));
      const existingMagn = existing.sources.find(s => s.source === 'Magn');
      if (existingMagn && existingMagn.gassoil) {
        magn = existingMagn;
        console.log('Magn: bruger eksisterende priser:', JSON.stringify(magn));
      } else {
        console.log('Magn: ingen eksisterende priser fundet, bruger KNOWN');
        magn = { source: 'Magn', ...KNOWN.Magn };
      }
    } catch(e) {
      console.log('Magn: kunne ikke læse fil, bruger KNOWN');
      magn = { source: 'Magn', ...KNOWN.Magn };
    }
  }

  const data = {
    updatedAt: new Date().toISOString(),
    sources: [thomsen, magn, effo]
  };

  fs.writeFileSync('prices-override.json', JSON.stringify(data, null, 2));
  console.log('Prísir goymdar:', JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error('Feilt:', e.message);
  process.exit(1);
});
