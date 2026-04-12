
const fs = require('fs');
try {
  const content = fs.readFileSync('C:\\Users\\User\\Desktop\\vidrios-templex-system\\backend.log', 'utf16le');
  console.log(content.split('\n').slice(-50).join('\n'));
} catch (err) {
  console.error('Error al leer log:', err);
}
