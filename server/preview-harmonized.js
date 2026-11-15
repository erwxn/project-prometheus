const path = require('node:path');

// Local preview uses the same validated feed path as cloud publications.
process.env.HARMONIZED_LOCAL_FILE = path.resolve(process.argv[2] || 'test-data/harmonized/delivery_2014_morocco.zip');
delete process.env.HARMONIZED_SOURCE;
const app = require('./index');
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Harmonized delivery preview on port ${port}. Historical sample; not live fire data.`));
