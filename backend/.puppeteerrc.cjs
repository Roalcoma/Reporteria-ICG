// Chromium (para el PDF) se instala dentro del proyecto y no en el perfil del
// usuario: como servicio de Windows el proceso corre con LocalSystem y no vería
// el Chromium descargado en C:\Users\<quien instaló>\.cache.
const path = require('path');
module.exports = { cacheDirectory: path.join(__dirname, '.cache', 'puppeteer') };
